import { Router } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../config/database";
import { Deployment } from "../entities/Deployment";
import { DeploymentClient } from "../entities/DeploymentClient";
import { Client } from "../entities/Client";
import { SoftwarePackage } from "../entities/SoftwarePackage";
import { PackageVersion } from "../entities/PackageVersion";
import { LogEntry } from "../entities/LogEntry";

const router = Router();

// ── GET /api/deployments ── List all deployments (optional ?status= filter)
router.get("/", async (req, res) => {
  try {
    const deploymentRepo = AppDataSource.getRepository(Deployment);
    const where: Record<string, unknown> = {};

    if (req.query.status && req.query.status !== "all") {
      where.status = req.query.status;
    }

    const deployments = await deploymentRepo.find({
      where,
      order: { createdAt: "DESC" },
    });

    return res.json(deployments);
  } catch (err) {
    console.error("GET /deployments error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/deployments/:id ── Single deployment detail
router.get("/:id", async (req, res) => {
  try {
    const deployment = await AppDataSource.getRepository(Deployment).findOneBy({
      id: req.params.id,
    });

    if (!deployment) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    return res.json(deployment);
  } catch (err) {
    console.error("GET /deployments/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/deployments/:id/clients ── Per-client statuses for a deployment
router.get("/:id/clients", async (req, res) => {
  try {
    const dcRepo = AppDataSource.getRepository(DeploymentClient);

    const clientStatuses = await dcRepo.find({
      where: { deploymentId: req.params.id },
      order: { clientHostname: "ASC" },
    });

    return res.json(clientStatuses);
  } catch (err) {
    console.error("GET /deployments/:id/clients error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/deployments ── Create a new deployment
router.post("/", async (req, res) => {
  try {
    const { packageId, version, clientIds } = req.body;

    if (!packageId || !version || !Array.isArray(clientIds) || clientIds.length === 0) {
      return res.status(400).json({ error: "packageId, version, and clientIds[] are required" });
    }

    const pkg = await AppDataSource.getRepository(SoftwarePackage).findOneBy({ id: packageId });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const clients = await AppDataSource.getRepository(Client).find({
      where: { id: In(clientIds) },
    });
    if (clients.length !== clientIds.length) {
      return res.status(400).json({ error: "One or more client IDs are invalid" });
    }

    // Create deployment
    const deploymentRepo = AppDataSource.getRepository(Deployment);
    const deployment = deploymentRepo.create({
      packageId,
      packageName: pkg.name,
      version,
      targetCount: clientIds.length,
      successCount: 0,
      failedCount: 0,
      status: "pending",
    });
    await deploymentRepo.save(deployment);

    // Create per-client entries
    const dcRepo = AppDataSource.getRepository(DeploymentClient);
    const deploymentClients = clients.map((c) =>
      dcRepo.create({
        deploymentId: deployment.id,
        clientId: c.id,
        clientHostname: c.hostname,
        status: "pending",
      })
    );
    await dcRepo.save(deploymentClients);

    // Log the creation
    await AppDataSource.getRepository(LogEntry).save(
      AppDataSource.getRepository(LogEntry).create({
        level: "info",
        clientHostname: "system",
        packageName: pkg.name,
        message: `Deployment created: ${pkg.name} v${version} targeting ${clientIds.length} client(s)`,
      })
    );

    return res.status(201).json(deployment);
  } catch (err) {
    console.error("POST /deployments error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/deployments/:id/rollback ── Rollback a failed deployment
router.post("/:id/rollback", async (req, res) => {
  try {
    const deploymentRepo = AppDataSource.getRepository(Deployment);
    const original = await deploymentRepo.findOneBy({ id: req.params.id });

    if (!original) {
      return res.status(404).json({ error: "Deployment not found" });
    }
    if (original.status !== "failed") {
      return res.status(400).json({ error: "Only failed deployments can be rolled back" });
    }

    // Find the rollback target version for this package
    const rollbackVersion = await AppDataSource.getRepository(PackageVersion).findOne({
      where: { packageId: original.packageId, isRollbackTarget: true },
      order: { releaseDate: "DESC" },
    });
    if (!rollbackVersion) {
      return res.status(400).json({ error: "No rollback target version found for this package" });
    }

    // Get the failed clients from original deployment
    const dcRepo = AppDataSource.getRepository(DeploymentClient);
    const originalClients = await dcRepo.find({
      where: { deploymentId: original.id },
    });
    const clientIds = originalClients.map((dc) => dc.clientId);

    const clients = await AppDataSource.getRepository(Client).find({
      where: { id: In(clientIds) },
    });

    // Create rollback deployment
    const rollback = deploymentRepo.create({
      packageId: original.packageId,
      packageName: original.packageName,
      version: rollbackVersion.version,
      targetCount: clients.length,
      successCount: 0,
      failedCount: 0,
      status: "pending",
    });
    await deploymentRepo.save(rollback);

    // Create per-client entries for rollback
    const rollbackClients = clients.map((c) =>
      dcRepo.create({
        deploymentId: rollback.id,
        clientId: c.id,
        clientHostname: c.hostname,
        status: "pending",
      })
    );
    await dcRepo.save(rollbackClients);

    // Log the rollback
    await AppDataSource.getRepository(LogEntry).save(
      AppDataSource.getRepository(LogEntry).create({
        level: "warn",
        clientHostname: "system",
        packageName: original.packageName,
        message: `Rollback initiated: ${original.packageName} v${original.version} → v${rollbackVersion.version} for ${clients.length} client(s)`,
      })
    );

    return res.status(201).json(rollback);
  } catch (err) {
    console.error("POST /deployments/:id/rollback error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
