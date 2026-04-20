import { Router } from "express";
import { AppDataSource } from "../config/database";
import { Client } from "../entities/Client";
import { InstalledPackage } from "../entities/InstalledPackage";

const router = Router();

// ── GET /api/clients ── List all clients (optional ?search= filter)
router.get("/", async (req, res) => {
  try {
    const clientRepo = AppDataSource.getRepository(Client);
    const qb = clientRepo.createQueryBuilder("client");

    if (req.query.search) {
      const s = `%${req.query.search}%`;
      qb.where("client.hostname LIKE :s OR client.ip LIKE :s", { s });
    }

    qb.orderBy("client.hostname", "ASC");
    const clients = await qb.getMany();

    // Map to frontend shape (exclude apiKey)
    const result = clients.map(({ apiKey, ...rest }) => rest);
    return res.json(result);
  } catch (err) {
    console.error("GET /clients error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/clients/:id ── Single client detail
router.get("/:id", async (req, res) => {
  try {
    const client = await AppDataSource.getRepository(Client).findOneBy({
      id: req.params.id,
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Exclude apiKey from response
    const { apiKey, ...result } = client;
    return res.json(result);
  } catch (err) {
    console.error("GET /clients/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/clients/:id/packages ── Installed packages for a client
router.get("/:id/packages", async (req, res) => {
  try {
    const installed = await AppDataSource.getRepository(InstalledPackage).find({
      where: { clientId: req.params.id },
      order: { installedAt: "DESC" },
    });

    return res.json(installed);
  } catch (err) {
    console.error("GET /clients/:id/packages error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
