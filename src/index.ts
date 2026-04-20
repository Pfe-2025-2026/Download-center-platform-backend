import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { AppDataSource } from "./config/database";
import { Client } from "./entities/Client";
import { LessThan } from "typeorm";

// Route imports
import deploymentRoutes from "./routes/deployments";
import clientRoutes from "./routes/clients";
import logRoutes from "./routes/logs";
import dashboardRoutes from "./routes/dashboard";
import agentRoutes from "./routes/agents";
import authRoutes from "./routes/auth";
import packageRoutes from "./routes/packages";
import settingsRoutes from "./routes/settings";

// Auth middleware
import { authMiddleware } from "./middleware/auth";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Routes ──
// Public routes (no auth needed)
app.use("/api/auth", authRoutes);
app.use("/api/agents", agentRoutes);

// Protected routes (auth middleware applied — currently a stub, P1 will enforce)
app.use("/api/packages", authMiddleware, packageRoutes);
app.use("/api/deployments", authMiddleware, deploymentRoutes);
app.use("/api/clients", authMiddleware, clientRoutes);
app.use("/api/logs", authMiddleware, logRoutes);
app.use("/api/dashboard", authMiddleware, dashboardRoutes);
app.use("/api/settings", authMiddleware, settingsRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Heartbeat Monitor ──
// Background job: mark clients as "offline" if no heartbeat within HEARTBEAT_TIMEOUT
function startHeartbeatMonitor() {
  const interval = parseInt(process.env.HEARTBEAT_INTERVAL || "60000", 10);
  const timeout = parseInt(process.env.HEARTBEAT_TIMEOUT || "300000", 10);

  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - timeout);
      const clientRepo = AppDataSource.getRepository(Client);

      const staleClients = await clientRepo.find({
        where: {
          status: "online" as const,
          lastSeen: LessThan(cutoff),
        },
      });

      for (const client of staleClients) {
        client.status = "offline";
        await clientRepo.save(client);
      }

      if (staleClients.length > 0) {
        console.log(`[heartbeat-monitor] Marked ${staleClients.length} client(s) as offline`);
      }
    } catch (err) {
      console.error("[heartbeat-monitor] Error:", err);
    }
  }, interval);

  console.log(
    `[heartbeat-monitor] Running every ${interval / 1000}s, timeout ${timeout / 1000}s`
  );
}

// ── Start ──
async function bootstrap() {
  // Ensure data directory exists
  const dbPath = process.env.DB_PATH || "./data/database.sqlite";
  const dbDir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize database
  await AppDataSource.initialize();
  console.log("Database connected");

  // Start heartbeat monitor
  startHeartbeatMonitor();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export default app;
