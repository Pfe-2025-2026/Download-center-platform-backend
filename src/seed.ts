import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "./config/database";
import { User } from "./entities/User";
import { SoftwarePackage } from "./entities/SoftwarePackage";
import { PackageVersion } from "./entities/PackageVersion";
import { Client } from "./entities/Client";
import { Deployment } from "./entities/Deployment";
import { DeploymentClient } from "./entities/DeploymentClient";
import { InstalledPackage } from "./entities/InstalledPackage";
import { LogEntry } from "./entities/LogEntry";
import { DownloadRecord } from "./entities/DownloadRecord";
import { PlatformSettings } from "./entities/PlatformSettings";
import { SigningKey } from "./entities/SigningKey";
import bcrypt from "bcryptjs";

async function seed() {
  const dbPath = process.env.DB_PATH || "./data/database.sqlite";
  const dbDir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  await AppDataSource.initialize();
  console.log("Database connected, seeding...");

  // ── Clear existing data ──
  await AppDataSource.getRepository(DownloadRecord).clear();
  await AppDataSource.getRepository(LogEntry).clear();
  await AppDataSource.getRepository(InstalledPackage).clear();
  await AppDataSource.getRepository(DeploymentClient).clear();
  await AppDataSource.getRepository(Deployment).clear();
  await AppDataSource.getRepository(Client).clear();
  await AppDataSource.getRepository(PackageVersion).clear();
  await AppDataSource.getRepository(SoftwarePackage).clear();
  await AppDataSource.getRepository(User).clear();
  await AppDataSource.getRepository(SigningKey).clear();
  await AppDataSource.getRepository(PlatformSettings).clear();

  // ── P1 Stub: Admin user ──
  const userRepo = AppDataSource.getRepository(User);
  const hashedPw = await bcrypt.hash("admin123", 10);
  await userRepo.save(
    userRepo.create({
      email: "admin@downloadcenter.local",
      password: hashedPw,
      name: "Admin User",
      role: "admin",
    })
  );
  console.log("  ✓ Users");

  // ── Platform Settings ──
  const settingsRepo = AppDataSource.getRepository(PlatformSettings);
  await settingsRepo.save(
    settingsRepo.create({
      platformName: "Download Center",
      logoUrl: "",
      emailAlertsEnabled: true,
      alertEmail: "ops-alerts@downloadcenter.local",
    })
  );
  console.log("  ✓ Platform Settings");

  // ── Signing Keys ──
  const keyRepo = AppDataSource.getRepository(SigningKey);
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 2);
  await keyRepo.save(
    keyRepo.create({
      fingerprint: "A1B2 C3D4 E5F6 7890 1234 5678 9ABC DEF0 1234 5678",
      expiresAt,
      isActive: true,
    })
  );
  console.log("  ✓ Signing Keys");

  // ── P2 Stub: Software Packages ──
  const pkgRepo = AppDataSource.getRepository(SoftwarePackage);
  const packages = await pkgRepo.save([
    pkgRepo.create({
      name: "core-agent",
      description: "Core monitoring and management agent for all client machines",
      architectures: ["amd64"],
      latestVersion: "3.4.1",
      size: "24.5 MB",
      status: "active",
      gpgFingerprint: "A1B2 C3D4 E5F6 7890",
      gpgStatus: "valid",
    }),
    pkgRepo.create({
      name: "telemetry-collector",
      description: "Collects and forwards system telemetry data",
      architectures: ["amd64"],
      latestVersion: "2.1.0",
      size: "12.8 MB",
      status: "active",
      gpgFingerprint: "B2C3 D4E5 F678 9012",
      gpgStatus: "valid",
    }),
    pkgRepo.create({
      name: "log-forwarder",
      description: "Centralized log forwarding and aggregation service",
      architectures: ["amd64", "i386"],
      latestVersion: "1.8.3",
      size: "8.2 MB",
      status: "active",
      gpgFingerprint: "C3D4 E5F6 7890 1234",
      gpgStatus: "valid",
    }),
    pkgRepo.create({
      name: "patch-manager",
      description: "Automated system patching and update management",
      architectures: ["amd64"],
      latestVersion: "4.0.0-beta",
      size: "31.1 MB",
      status: "draft",
      gpgFingerprint: "D4E5 F678 9012 3456",
      gpgStatus: "valid",
    }),
    pkgRepo.create({
      name: "vpn-connector",
      description: "Secure VPN tunnel client for remote access",
      architectures: ["amd64"],
      latestVersion: "2.5.0",
      size: "18.4 MB",
      status: "archived",
      gpgFingerprint: "E5F6 7890 1234 5678",
      gpgStatus: "expired",
    }),
  ]);
  console.log("  ✓ Packages");

  // ── P2 Stub: Package Versions (for core-agent) ──
  const pvRepo = AppDataSource.getRepository(PackageVersion);
  await pvRepo.save([
    pvRepo.create({
      packageId: packages[0].id,
      version: "3.4.1",
      architecture: "amd64",
      status: "stable",
      size: "24.5 MB",
      checksum: "sha256:a1b2c3d4e5f6...",
      releaseDate: new Date("2025-03-15"),
      isRollbackTarget: false,
    }),
    pvRepo.create({
      packageId: packages[0].id,
      version: "3.4.0",
      architecture: "amd64",
      status: "stable",
      size: "24.3 MB",
      checksum: "sha256:f6e5d4c3b2a1...",
      releaseDate: new Date("2025-02-20"),
      isRollbackTarget: true,
    }),
    pvRepo.create({
      packageId: packages[0].id,
      version: "3.3.0",
      architecture: "amd64",
      status: "deprecated",
      size: "23.8 MB",
      checksum: "sha256:1234567890ab...",
      releaseDate: new Date("2025-01-10"),
      isRollbackTarget: false,
    }),
    pvRepo.create({
      packageId: packages[0].id,
      version: "3.5.0-beta",
      architecture: "amd64",
      status: "beta",
      size: "25.1 MB",
      checksum: "sha256:abcdef123456...",
      releaseDate: new Date("2025-04-01"),
      isRollbackTarget: false,
    }),
    pvRepo.create({
      packageId: packages[0].id,
      version: "3.4.1",
      architecture: "i386",
      status: "stable",
      size: "22.1 MB",
      checksum: "sha256:7890abcdef12...",
      releaseDate: new Date("2025-03-15"),
      isRollbackTarget: false,
    }),
  ]);
  console.log("  ✓ Package Versions");

  // ── P3: Clients ──
  const clientRepo = AppDataSource.getRepository(Client);
  const now = new Date();
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  const clients = await clientRepo.save([
    clientRepo.create({
      hostname: "prod-web-01",
      ip: "10.0.1.10",
      os: "Debian 12",
      architecture: "amd64",
      lastSeen: minutesAgo(2),
      currentVersion: "3.4.1",
      status: "online",
      apiKey: uuidv4(),
    }),
    clientRepo.create({
      hostname: "prod-web-02",
      ip: "10.0.1.11",
      os: "Linux Mint 21.3",
      architecture: "amd64",
      lastSeen: minutesAgo(1),
      currentVersion: "3.4.1",
      status: "online",
      apiKey: uuidv4(),
    }),
    clientRepo.create({
      hostname: "prod-db-01",
      ip: "10.0.2.10",
      os: "Debian 12",
      architecture: "amd64",
      lastSeen: minutesAgo(3),
      currentVersion: "3.4.0",
      status: "online",
      apiKey: uuidv4(),
    }),
    clientRepo.create({
      hostname: "edge-node-01",
      ip: "10.1.0.10",
      os: "Linux Mint 21.3",
      architecture: "i386",
      lastSeen: hoursAgo(12),
      currentVersion: "3.3.0",
      status: "offline",
      apiKey: uuidv4(),
    }),
    clientRepo.create({
      hostname: "staging-app-01",
      ip: "10.0.3.10",
      os: "Debian 12",
      architecture: "amd64",
      lastSeen: minutesAgo(5),
      currentVersion: "3.4.1",
      status: "online",
      apiKey: uuidv4(),
    }),
    clientRepo.create({
      hostname: "prod-worker-01",
      ip: "10.0.1.20",
      os: "Linux Mint 22",
      architecture: "amd64",
      lastSeen: minutesAgo(4),
      currentVersion: "3.3.0",
      status: "outdated",
      apiKey: uuidv4(),
    }),
    clientRepo.create({
      hostname: "prod-worker-02",
      ip: "10.0.1.21",
      os: "Debian 11",
      architecture: "amd64",
      lastSeen: minutesAgo(2),
      currentVersion: "3.4.1",
      status: "online",
      apiKey: uuidv4(),
    }),
    clientRepo.create({
      hostname: "dev-box-01",
      ip: "10.0.4.10",
      os: "Linux Mint 22",
      architecture: "amd64",
      lastSeen: minutesAgo(10),
      currentVersion: "3.3.0",
      status: "outdated",
      apiKey: uuidv4(),
    }),
  ]);
  console.log("  ✓ Clients");

  // ── P3: Deployments ──
  const depRepo = AppDataSource.getRepository(Deployment);
  const daysAgo = (d: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - d);
    date.setUTCHours(12, 0, 0, 0); // noon UTC so it always falls within that day
    return date;
  };

  const deployments = await depRepo.save([
    depRepo.create({
      packageId: packages[0].id,
      packageName: "core-agent",
      version: "3.4.1",
      targetCount: 6,
      successCount: 5,
      failedCount: 1,
      status: "failed",
      createdAt: daysAgo(2),
      completedAt: daysAgo(2),
    }),
    depRepo.create({
      packageId: packages[1].id,
      packageName: "telemetry-collector",
      version: "2.1.0",
      targetCount: 4,
      successCount: 4,
      failedCount: 0,
      status: "success",
      createdAt: daysAgo(5),
      completedAt: daysAgo(5),
    }),
    depRepo.create({
      packageId: packages[0].id,
      packageName: "core-agent",
      version: "3.4.0",
      targetCount: 8,
      successCount: 8,
      failedCount: 0,
      status: "success",
      createdAt: daysAgo(14),
      completedAt: daysAgo(14),
    }),
    depRepo.create({
      packageId: packages[2].id,
      packageName: "log-forwarder",
      version: "1.8.3",
      targetCount: 3,
      successCount: 0,
      failedCount: 0,
      status: "pending",
      createdAt: minutesAgo(30),
      completedAt: null,
    }),
    depRepo.create({
      packageId: packages[0].id,
      packageName: "core-agent",
      version: "3.5.0-beta",
      targetCount: 2,
      successCount: 1,
      failedCount: 0,
      status: "running",
      createdAt: minutesAgo(10),
      completedAt: null,
    }),
    depRepo.create({
      packageId: packages[4].id,
      packageName: "vpn-connector",
      version: "2.5.0",
      targetCount: 5,
      successCount: 5,
      failedCount: 0,
      status: "success",
      createdAt: daysAgo(7),
      completedAt: daysAgo(7),
    }),
  ]);
  console.log("  ✓ Deployments");

  // ── P3: Deployment Client Statuses ──
  const dcRepo = AppDataSource.getRepository(DeploymentClient);

  // Deployment 1 (failed): 5 success, 1 failed
  const dep1Clients = [clients[0], clients[1], clients[2], clients[4], clients[5], clients[6]];
  for (let i = 0; i < dep1Clients.length; i++) {
    const isFailed = i === 5; // prod-worker-02 failed
    await dcRepo.save(
      dcRepo.create({
        deploymentId: deployments[0].id,
        clientId: dep1Clients[i].id,
        clientHostname: dep1Clients[i].hostname,
        status: isFailed ? "failed" : "success",
        duration: isFailed ? 45 : 12 + i * 3,
        errorMessage: isFailed ? "Checksum verification failed after download" : null,
        startedAt: daysAgo(2),
        completedAt: daysAgo(2),
      })
    );
  }

  // Deployment 4 (pending): 3 clients all pending
  for (const c of [clients[3], clients[5], clients[7]]) {
    await dcRepo.save(
      dcRepo.create({
        deploymentId: deployments[3].id,
        clientId: c.id,
        clientHostname: c.hostname,
        status: "pending",
      })
    );
  }

  // Deployment 5 (running): 1 success, 1 installing
  await dcRepo.save(
    dcRepo.create({
      deploymentId: deployments[4].id,
      clientId: clients[4].id,
      clientHostname: clients[4].hostname,
      status: "success",
      duration: 18,
      startedAt: minutesAgo(8),
      completedAt: minutesAgo(5),
    })
  );
  await dcRepo.save(
    dcRepo.create({
      deploymentId: deployments[4].id,
      clientId: clients[7].id,
      clientHostname: clients[7].hostname,
      status: "installing",
      startedAt: minutesAgo(6),
    })
  );
  console.log("  ✓ Deployment Client Statuses");

  // ── P3: Installed Packages ──
  const ipRepo = AppDataSource.getRepository(InstalledPackage);
  const installData = [
    { client: clients[0], pkg: packages[0], version: "3.4.1", daysAgo: 2 },
    { client: clients[0], pkg: packages[1], version: "2.1.0", daysAgo: 5 },
    { client: clients[1], pkg: packages[0], version: "3.4.1", daysAgo: 2 },
    { client: clients[1], pkg: packages[2], version: "1.8.3", daysAgo: 10 },
    { client: clients[2], pkg: packages[0], version: "3.4.0", daysAgo: 14 },
    { client: clients[2], pkg: packages[1], version: "2.1.0", daysAgo: 5 },
    { client: clients[4], pkg: packages[0], version: "3.4.1", daysAgo: 2 },
    { client: clients[5], pkg: packages[0], version: "3.3.0", daysAgo: 30 },
    { client: clients[6], pkg: packages[0], version: "3.4.1", daysAgo: 2 },
    { client: clients[6], pkg: packages[4], version: "2.5.0", daysAgo: 7 },
  ];

  for (const d of installData) {
    await ipRepo.save(
      ipRepo.create({
        clientId: d.client.id,
        packageId: d.pkg.id,
        packageName: d.pkg.name,
        version: d.version,
        installedAt: daysAgo(d.daysAgo),
      })
    );
  }
  console.log("  ✓ Installed Packages");

  // ── P3: Logs ──
  const logRepo = AppDataSource.getRepository(LogEntry);
  const logData = [
    { level: "info", host: "prod-web-01", pkg: "core-agent", msg: "Deployment completed successfully — version 3.4.1 installed", ago: 120 },
    { level: "info", host: "prod-web-02", pkg: "core-agent", msg: "Deployment completed successfully — version 3.4.1 installed", ago: 118 },
    { level: "info", host: "prod-db-01", pkg: "core-agent", msg: "Deployment completed successfully — version 3.4.1 installed", ago: 115 },
    { level: "error", host: "prod-worker-02", pkg: "core-agent", msg: "Checksum verification failed after download. Expected sha256:a1b2… got sha256:ff01…", ago: 110 },
    { level: "warn", host: "edge-node-01", pkg: "core-agent", msg: "Client offline — last heartbeat was 12 hours ago, deployment queued", ago: 100 },
    { level: "info", host: "staging-app-01", pkg: "core-agent", msg: "Deployment completed successfully — version 3.5.0-beta installed", ago: 8 },
    { level: "info", host: "prod-web-01", pkg: "telemetry-collector", msg: "Package downloaded and verified — checksum OK", ago: 300 },
    { level: "warn", host: "prod-worker-01", pkg: "core-agent", msg: "Client running outdated version 3.3.0 — update available", ago: 180 },
    { level: "error", host: "prod-worker-01", pkg: "patch-manager", msg: "Installation failed — insufficient disk space (requires 50MB, 12MB available)", ago: 95 },
    { level: "info", host: "prod-web-01", pkg: "vpn-connector", msg: "VPN tunnel established successfully", ago: 420 },
    { level: "info", host: "dev-box-01", pkg: "core-agent", msg: "Agent registered — Linux Mint 22, amd64", ago: 1440 },
    { level: "warn", host: "dev-box-01", pkg: "core-agent", msg: "Client running outdated version 3.3.0 — update available", ago: 60 },
  ] as const;

  for (const l of logData) {
    const entry = logRepo.create({
      level: l.level,
      clientHostname: l.host,
      packageName: l.pkg,
      message: l.msg,
    });
    // Override the auto-generated timestamp
    entry.timestamp = minutesAgo(l.ago);
    await logRepo.save(entry);
  }
  console.log("  ✓ Logs");

  // ── P3: Download Records (for dashboard chart) ──
  const drRepo = AppDataSource.getRepository(DownloadRecord);
  const dailyDownloads = [
    { daysAgo: 6, count: 45 },
    { daysAgo: 5, count: 62 },
    { daysAgo: 4, count: 38 },
    { daysAgo: 3, count: 73 },
    { daysAgo: 2, count: 56 },
    { daysAgo: 1, count: 29 },
    { daysAgo: 0, count: 41 },
  ];

  for (const day of dailyDownloads) {
    const date = daysAgo(day.daysAgo);
    for (let i = 0; i < day.count; i++) {
      const record = drRepo.create({
        packageId: packages[i % packages.length].id,
        clientId: clients[i % clients.length].id,
      });
      // Spread downloads across the day (using UTC to match dashboard query)
      const hour = Math.floor((i / day.count) * 24);
      const recordDate = new Date(date);
      recordDate.setUTCHours(hour, Math.floor(Math.random() * 60), 0, 0);
      record.downloadedAt = recordDate;
      await drRepo.save(record);
    }
  }
  console.log("  ✓ Download Records");

  console.log("\nSeed complete!");
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
