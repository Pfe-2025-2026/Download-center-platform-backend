import { Router } from "express";
import { AppDataSource } from "../config/database";
import { LogEntry } from "../entities/LogEntry";

const router = Router();

// ── GET /api/logs ── List logs with optional filters
// Query params: ?level=info|warn|error &client=hostname &package=name &search=text
router.get("/", async (req, res) => {
  try {
    const logRepo = AppDataSource.getRepository(LogEntry);
    const qb = logRepo.createQueryBuilder("log");

    if (req.query.level && req.query.level !== "all") {
      qb.andWhere("log.level = :level", { level: req.query.level });
    }

    if (req.query.client && req.query.client !== "all") {
      qb.andWhere("log.clientHostname = :client", { client: req.query.client });
    }

    if (req.query.package && req.query.package !== "all") {
      qb.andWhere("log.packageName = :pkg", { pkg: req.query.package });
    }

    if (req.query.search) {
      qb.andWhere("log.message LIKE :search", { search: `%${req.query.search}%` });
    }

    qb.orderBy("log.timestamp", "DESC");

    const logs = await qb.getMany();
    return res.json(logs);
  } catch (err) {
    console.error("GET /logs error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
