import "reflect-metadata";
import { DataSource } from "typeorm";
import path from "path";
import { User } from "../entities/User";
import { SoftwarePackage } from "../entities/SoftwarePackage";
import { PackageVersion } from "../entities/PackageVersion";
import { Client } from "../entities/Client";
import { Deployment } from "../entities/Deployment";
import { DeploymentClient } from "../entities/DeploymentClient";
import { InstalledPackage } from "../entities/InstalledPackage";
import { LogEntry } from "../entities/LogEntry";
import { DownloadRecord } from "../entities/DownloadRecord";
import { SigningKey } from "../entities/SigningKey";
import { PlatformSettings } from "../entities/PlatformSettings";

const dbPath = process.env.DB_PATH || "./data/database.sqlite";

export const AppDataSource = new DataSource({
  type: "sqljs",
  location: path.resolve(dbPath),
  autoSave: true,
  synchronize: true,
  logging: false,
  entities: [
    User,
    SoftwarePackage,
    PackageVersion,
    Client,
    Deployment,
    DeploymentClient,
    InstalledPackage,
    LogEntry,
    DownloadRecord,
    SigningKey,
    PlatformSettings,
  ],
});
