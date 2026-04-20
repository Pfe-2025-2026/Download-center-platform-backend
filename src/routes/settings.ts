import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../config/database";
import { PlatformSettings } from "../entities/PlatformSettings";
import { SigningKey } from "../entities/SigningKey";
import { User } from "../entities/User";

const router = Router();

// ── Helper: get or create the singleton settings row ──
async function getSettings(): Promise<PlatformSettings> {
  const repo = AppDataSource.getRepository(PlatformSettings);
  let settings = await repo.findOne({ where: {} });
  if (!settings) {
    settings = repo.create({
      platformName: "Download Center",
      logoUrl: "",
      emailAlertsEnabled: true,
      alertEmail: "ops-alerts@downloadcenter.local",
    });
    await repo.save(settings);
  }
  return settings;
}

// ── GET /api/settings ── Platform settings
router.get("/", async (_req, res) => {
  try {
    const settings = await getSettings();
    return res.json({
      platformName: settings.platformName,
      logoUrl: settings.logoUrl,
      emailAlertsEnabled: settings.emailAlertsEnabled,
      alertEmail: settings.alertEmail,
    });
  } catch (err) {
    console.error("GET /settings error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/settings ── Update platform settings
router.put("/", async (req, res) => {
  try {
    const settings = await getSettings();
    const { platformName, logoUrl, emailAlertsEnabled, alertEmail } = req.body;

    if (platformName !== undefined) settings.platformName = platformName;
    if (logoUrl !== undefined) settings.logoUrl = logoUrl;
    if (emailAlertsEnabled !== undefined) settings.emailAlertsEnabled = emailAlertsEnabled;
    if (alertEmail !== undefined) settings.alertEmail = alertEmail;

    await AppDataSource.getRepository(PlatformSettings).save(settings);
    return res.json({
      platformName: settings.platformName,
      logoUrl: settings.logoUrl,
      emailAlertsEnabled: settings.emailAlertsEnabled,
      alertEmail: settings.alertEmail,
    });
  } catch (err) {
    console.error("PUT /settings error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/settings/keys ── List signing keys
router.get("/keys", async (_req, res) => {
  try {
    const keys = await AppDataSource.getRepository(SigningKey).find({
      order: { createdAt: "DESC" },
    });
    return res.json(keys);
  } catch (err) {
    console.error("GET /settings/keys error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/settings/keys/rotate ── Generate a new signing key (simple mock)
router.post("/keys/rotate", async (_req, res) => {
  try {
    const keyRepo = AppDataSource.getRepository(SigningKey);

    // Deactivate old keys
    await keyRepo
      .createQueryBuilder()
      .update()
      .set({ isActive: false })
      .where("isActive = :val", { val: true })
      .execute();

    // Create new key with a random fingerprint
    const parts = Array.from({ length: 10 }, () =>
      Math.random().toString(16).substring(2, 6).toUpperCase()
    );
    const fingerprint = parts.join(" ");

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 2);

    const key = keyRepo.create({ fingerprint, expiresAt, isActive: true });
    await keyRepo.save(key);

    return res.status(201).json(key);
  } catch (err) {
    console.error("POST /settings/keys/rotate error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/settings/users ── List admin users (no passwords)
router.get("/users", async (_req, res) => {
  try {
    const users = await AppDataSource.getRepository(User).find({
      order: { createdAt: "DESC" },
    });
    const result = users.map(({ password, ...u }) => u);
    return res.json(result);
  } catch (err) {
    console.error("GET /settings/users error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/settings/users ── Invite / create a new user
router.post("/users", async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "name and email are required" });
    }

    const userRepo = AppDataSource.getRepository(User);
    const existing = await userRepo.findOneBy({ email });
    if (existing) {
      return res.status(409).json({ error: "A user with that email already exists" });
    }

    // Default password for invited users (they would reset it in a real system)
    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.hash("changeme123", 10);

    const user = userRepo.create({
      name,
      email,
      password: hashed,
      role: role || "viewer",
    });
    await userRepo.save(user);

    const { password, ...result } = user;
    return res.status(201).json(result);
  } catch (err) {
    console.error("POST /settings/users error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
