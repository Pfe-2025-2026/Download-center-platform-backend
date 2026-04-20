import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { AppDataSource } from "../config/database";
import { Client } from "../entities/Client";
import { Deployment } from "../entities/Deployment";
import { DeploymentClient } from "../entities/DeploymentClient";
import { InstalledPackage } from "../entities/InstalledPackage";
import { LogEntry } from "../entities/LogEntry";
import { PackageVersion } from "../entities/PackageVersion";

const router = Router();

// ── POST /api/agents/register ── Register a new client agent
router.post("/register", async (req, res) => {
  try {
    const { hostname, ip, os, architecture, currentVersion } = req.body;

    if (!hostname || !ip || !os || !architecture) {
      return res.status(400).json({ error: "hostname, ip, os, and architecture are required" });
    }

    const clientRepo = AppDataSource.getRepository(Client);

    // Check if hostname already registered
    const existing = await clientRepo.findOneBy({ hostname });
    if (existing) {
      // Re-register: update info and return existing apiKey
      existing.ip = ip;
      existing.os = os;
      existing.architecture = architecture;
      existing.currentVersion = currentVersion || existing.currentVersion;
      existing.lastSeen = new Date();
      existing.status = "online";
      await clientRepo.save(existing);

      return res.json({ clientId: existing.id, apiKey: existing.apiKey });
    }

    // New registration
    const apiKey = uuidv4();
    const client = clientRepo.create({
      hostname,
      ip,
      os,
      architecture,
      currentVersion: currentVersion || null,
      lastSeen: new Date(),
      status: "online",
      apiKey,
    });
    await clientRepo.save(client);

    // Log registration
    await AppDataSource.getRepository(LogEntry).save(
      AppDataSource.getRepository(LogEntry).create({
        level: "info",
        clientHostname: hostname,
        packageName: "system",
        message: `Agent registered: ${hostname} (${os}, ${architecture})`,
      })
    );

    return res.status(201).json({ clientId: client.id, apiKey: client.apiKey });
  } catch (err) {
    console.error("POST /agents/register error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/agents/heartbeat ── Agent sends periodic heartbeat
// Body: { apiKey, currentVersion? }
router.post("/heartbeat", async (req, res) => {
  try {
    const { apiKey, currentVersion } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: "apiKey is required" });
    }

    const clientRepo = AppDataSource.getRepository(Client);
    const client = await clientRepo.findOneBy({ apiKey });

    if (!client) {
      return res.status(401).json({ error: "Invalid apiKey" });
    }

    // Update heartbeat
    client.lastSeen = new Date();
    client.status = "online";
    if (currentVersion) {
      client.currentVersion = currentVersion;
    }
    await clientRepo.save(client);

    // Check for pending deployments assigned to this client
    const pendingWork = await AppDataSource.getRepository(DeploymentClient).find({
      where: { clientId: client.id, status: "pending" },
    });

    // Return pending deployment tasks for the agent to pick up
    const tasks = [];
    for (const dc of pendingWork) {
      const deployment = await AppDataSource.getRepository(Deployment).findOneBy({
        id: dc.deploymentId,
      });
      if (deployment) {
        tasks.push({
          deploymentId: deployment.id,
          deploymentClientId: dc.id,
          packageId: deployment.packageId,
          packageName: deployment.packageName,
          version: deployment.version,
        });
      }
    }

    return res.json({
      status: "ok",
      clientId: client.id,
      tasks,
    });
  } catch (err) {
    console.error("POST /agents/heartbeat error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/agents/report ── Agent reports deployment progress
// Body: { apiKey, deploymentClientId, status, errorMessage? }
router.post("/report", async (req, res) => {
  try {
    const { apiKey, deploymentClientId, status, errorMessage } = req.body;

    if (!apiKey || !deploymentClientId || !status) {
      return res.status(400).json({ error: "apiKey, deploymentClientId, and status are required" });
    }

    const validStatuses = ["downloading", "installing", "success", "failed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }

    // Verify agent
    const client = await AppDataSource.getRepository(Client).findOneBy({ apiKey });
    if (!client) {
      return res.status(401).json({ error: "Invalid apiKey" });
    }

    // Update deployment client status
    const dcRepo = AppDataSource.getRepository(DeploymentClient);
    const dc = await dcRepo.findOneBy({ id: deploymentClientId, clientId: client.id });
    if (!dc) {
      return res.status(404).json({ error: "Deployment task not found" });
    }

    const now = new Date();

    // Track timing
    if (status === "downloading" && !dc.startedAt) {
      dc.startedAt = now;
    }

    dc.status = status;

    if (status === "success" || status === "failed") {
      dc.completedAt = now;
      if (dc.startedAt) {
        dc.duration = (now.getTime() - new Date(dc.startedAt).getTime()) / 1000;
      }
    }

    if (status === "failed" && errorMessage) {
      dc.errorMessage = errorMessage;
    }

    await dcRepo.save(dc);

    // Update parent deployment counters and status
    const deploymentRepo = AppDataSource.getRepository(Deployment);
    const deployment = await deploymentRepo.findOneBy({ id: dc.deploymentId });

    if (deployment) {
      // Recalculate counts from actual data
      const allDcs = await dcRepo.find({ where: { deploymentId: deployment.id } });
      deployment.successCount = allDcs.filter((d) => d.status === "success").length;
      deployment.failedCount = allDcs.filter((d) => d.status === "failed").length;

      const inProgress = allDcs.some(
        (d) => d.status === "pending" || d.status === "downloading" || d.status === "installing"
      );

      if (!inProgress) {
        // All clients finished
        deployment.completedAt = now;
        deployment.status = deployment.failedCount > 0 ? "failed" : "success";
      } else if (allDcs.some((d) => d.status !== "pending")) {
        deployment.status = "running";
      }

      await deploymentRepo.save(deployment);

      // If client succeeded, update installed packages
      if (status === "success") {
        const ipRepo = AppDataSource.getRepository(InstalledPackage);
        // Upsert: remove old version of same package, insert new
        await ipRepo.delete({ clientId: client.id, packageId: deployment.packageId });
        await ipRepo.save(
          ipRepo.create({
            clientId: client.id,
            packageId: deployment.packageId,
            packageName: deployment.packageName,
            version: deployment.version,
            installedAt: now,
          })
        );
      }

      // Log the status change
      const logRepo = AppDataSource.getRepository(LogEntry);
      const level = status === "failed" ? "error" : "info";
      await logRepo.save(
        logRepo.create({
          level,
          clientHostname: client.hostname,
          packageName: deployment.packageName,
          message:
            status === "failed"
              ? `Deployment failed on ${client.hostname}: ${errorMessage || "unknown error"}`
              : `Deployment ${status} on ${client.hostname}: ${deployment.packageName} v${deployment.version}`,
        })
      );
    }

    return res.json({ status: "ok" });
  } catch (err) {
    console.error("POST /agents/report error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/agents/download/:packageId/:version ── Agent downloads a package file
// Query: ?apiKey=xxx
router.get("/download/:packageId/:version", async (req, res) => {
  try {
    const { apiKey } = req.query;
    if (!apiKey) {
      return res.status(400).json({ error: "apiKey query param required" });
    }

    const client = await AppDataSource.getRepository(Client).findOneBy({
      apiKey: apiKey as string,
    });
    if (!client) {
      return res.status(401).json({ error: "Invalid apiKey" });
    }

    // Find the version file
    const pv = await AppDataSource.getRepository(PackageVersion).findOne({
      where: {
        packageId: req.params.packageId,
        version: req.params.version,
      },
    });
    if (!pv || !pv.filePath || !fs.existsSync(pv.filePath)) {
      return res.status(404).json({ error: "Package file not found" });
    }

    const filename = pv.originalFilename || `${req.params.packageId}-${pv.version}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    const stream = fs.createReadStream(pv.filePath);
    stream.pipe(res);
  } catch (err) {
    console.error("GET /agents/download error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
