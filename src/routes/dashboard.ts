import { Router } from "express";
import { AppDataSource } from "../config/database";
import { SoftwarePackage } from "../entities/SoftwarePackage";
import { Client } from "../entities/Client";
import { Deployment } from "../entities/Deployment";
import { DownloadRecord } from "../entities/DownloadRecord";

const router = Router();

// ── GET /api/dashboard/stats ── Aggregate statistics
router.get("/stats", async (req, res) => {
  try {
    const totalPackages = await AppDataSource.getRepository(SoftwarePackage).count();
    const totalClients = await AppDataSource.getRepository(Client).count();

    const deploymentRepo = AppDataSource.getRepository(Deployment);
    const activeDeployments = await deploymentRepo.count({
      where: [{ status: "pending" }, { status: "running" }],
    });
    const failedDeployments = await deploymentRepo.count({
      where: { status: "failed" },
    });

    return res.json({
      totalPackages,
      totalClients,
      activeDeployments,
      failedDeployments,
    });
  } catch (err) {
    console.error("GET /dashboard/stats error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/dashboard/downloads ── Download activity for the last 7 days
router.get("/downloads", async (req, res) => {
  try {
    const days = 7;
    const result: { date: string; downloads: number }[] = [];
    const drRepo = AppDataSource.getRepository(DownloadRecord);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const dayStr = d.toISOString().slice(0, 10); // YYYY-MM-DD

      // sqljs stores dates as "YYYY-MM-DD HH:mm:ss.SSS" text
      const start = `${dayStr} 00:00:00.000`;
      const end = `${dayStr} 23:59:59.999`;

      const count = await drRepo
        .createQueryBuilder("dr")
        .where("dr.downloadedAt BETWEEN :start AND :end", { start, end })
        .getCount();

      result.push({ date: dayStr, downloads: count });
    }

    return res.json(result);
  } catch (err) {
    console.error("GET /dashboard/downloads error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/dashboard/client-status ── Client status breakdown
router.get("/client-status", async (req, res) => {
  try {
    const clientRepo = AppDataSource.getRepository(Client);

    const breakdown = await clientRepo
      .createQueryBuilder("client")
      .select("client.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("client.status")
      .getRawMany();

    // Ensure all statuses are represented
    const statusMap: Record<string, number> = { online: 0, offline: 0, outdated: 0 };
    for (const row of breakdown) {
      statusMap[row.status] = parseInt(row.count, 10);
    }

    const result = Object.entries(statusMap).map(([status, count]) => ({
      status,
      count,
    }));

    return res.json(result);
  } catch (err) {
    console.error("GET /dashboard/client-status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
