import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { AppDataSource } from "../config/database";
import { SoftwarePackage } from "../entities/SoftwarePackage";
import { PackageVersion } from "../entities/PackageVersion";

const router = Router();

// ── Multer setup ── store files in uploads/<packageId>/
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve("./uploads/tmp");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
});

// ── Helper: compute sha256 checksum of a file ──
function checksumFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
    stream.on("error", reject);
  });
}

// ── Helper: format file size ──
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── GET /api/packages ── List all packages
router.get("/", async (_req, res) => {
  try {
    const packages = await AppDataSource.getRepository(SoftwarePackage).find({
      order: { name: "ASC" },
    });
    return res.json(packages);
  } catch (err) {
    console.error("GET /packages error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/packages/:id ── Single package detail
router.get("/:id", async (req, res) => {
  try {
    const pkg = await AppDataSource.getRepository(SoftwarePackage).findOneBy({
      id: req.params.id,
    });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }
    return res.json(pkg);
  } catch (err) {
    console.error("GET /packages/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/packages ── Create package + upload first version file
// multipart: name, description, architectures (JSON string or repeated), version, file
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { name, description, version } = req.body;
    let architectures: string[] = [];

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // Parse architectures — could be JSON array string or repeated field
    if (req.body.architectures) {
      if (typeof req.body.architectures === "string") {
        try {
          architectures = JSON.parse(req.body.architectures);
        } catch {
          architectures = [req.body.architectures];
        }
      } else if (Array.isArray(req.body.architectures)) {
        architectures = req.body.architectures;
      }
    }

    const pkgRepo = AppDataSource.getRepository(SoftwarePackage);

    // Check duplicate name
    const existing = await pkgRepo.findOneBy({ name });
    if (existing) {
      return res.status(409).json({ error: "A package with that name already exists" });
    }

    // Create the package
    const pkg = pkgRepo.create({
      name,
      description: description || "",
      architectures,
      latestVersion: version || "1.0.0",
      size: req.file ? formatSize(req.file.size) : null,
      status: "draft",
    });
    await pkgRepo.save(pkg);

    // If a file was uploaded, create the first version
    if (req.file) {
      // Move file to permanent location
      const pkgDir = path.resolve(`./uploads/${pkg.id}`);
      if (!fs.existsSync(pkgDir)) {
        fs.mkdirSync(pkgDir, { recursive: true });
      }
      const dest = path.join(pkgDir, req.file.filename);
      fs.renameSync(req.file.path, dest);

      const checksum = await checksumFile(dest);

      const pvRepo = AppDataSource.getRepository(PackageVersion);
      await pvRepo.save(
        pvRepo.create({
          packageId: pkg.id,
          version: version || "1.0.0",
          architecture: architectures[0] || "x86_64",
          status: "stable",
          size: formatSize(req.file.size),
          checksum,
          releaseDate: new Date(),
          filePath: dest,
          originalFilename: req.file.originalname,
        })
      );
    }

    return res.status(201).json(pkg);
  } catch (err) {
    console.error("POST /packages error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/packages/:id ── Update package metadata
router.put("/:id", async (req, res) => {
  try {
    const pkgRepo = AppDataSource.getRepository(SoftwarePackage);
    const pkg = await pkgRepo.findOneBy({ id: req.params.id });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const { name, description, architectures, status } = req.body;
    if (name !== undefined) pkg.name = name;
    if (description !== undefined) pkg.description = description;
    if (architectures !== undefined) pkg.architectures = architectures;
    if (status !== undefined) pkg.status = status;

    await pkgRepo.save(pkg);
    return res.json(pkg);
  } catch (err) {
    console.error("PUT /packages/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/packages/:id ── Delete package and its versions
router.delete("/:id", async (req, res) => {
  try {
    const pkgRepo = AppDataSource.getRepository(SoftwarePackage);
    const pkg = await pkgRepo.findOneBy({ id: req.params.id });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    // Delete versions
    await AppDataSource.getRepository(PackageVersion).delete({ packageId: pkg.id });

    // Delete uploaded files
    const pkgDir = path.resolve(`./uploads/${pkg.id}`);
    if (fs.existsSync(pkgDir)) {
      fs.rmSync(pkgDir, { recursive: true, force: true });
    }

    await pkgRepo.delete({ id: pkg.id });
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /packages/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/packages/:id/versions ── List versions for a package
router.get("/:id/versions", async (req, res) => {
  try {
    const versions = await AppDataSource.getRepository(PackageVersion).find({
      where: { packageId: req.params.id },
      order: { releaseDate: "DESC" },
    });
    return res.json(versions);
  } catch (err) {
    console.error("GET /packages/:id/versions error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/packages/:id/versions ── Upload a new version for a package
router.post("/:id/versions", upload.single("file"), async (req, res) => {
  try {
    const pkgRepo = AppDataSource.getRepository(SoftwarePackage);
    const pkg = await pkgRepo.findOneBy({ id: req.params.id });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const { version, architecture, status: versionStatus } = req.body;
    if (!version) {
      return res.status(400).json({ error: "version is required" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    // Move file
    const pkgDir = path.resolve(`./uploads/${pkg.id}`);
    if (!fs.existsSync(pkgDir)) {
      fs.mkdirSync(pkgDir, { recursive: true });
    }
    const dest = path.join(pkgDir, req.file.filename);
    fs.renameSync(req.file.path, dest);

    const checksum = await checksumFile(dest);

    const pvRepo = AppDataSource.getRepository(PackageVersion);
    const pv = pvRepo.create({
      packageId: pkg.id,
      version,
      architecture: architecture || "x86_64",
      status: versionStatus || "stable",
      size: formatSize(req.file.size),
      checksum,
      releaseDate: new Date(),
      filePath: dest,
      originalFilename: req.file.originalname,
    });
    await pvRepo.save(pv);

    // Update package's latestVersion and size
    pkg.latestVersion = version;
    pkg.size = formatSize(req.file.size);
    if (pkg.status === "draft") pkg.status = "active";
    await pkgRepo.save(pkg);

    return res.status(201).json(pv);
  } catch (err) {
    console.error("POST /packages/:id/versions error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/packages/:id/versions/:versionId ── Update version metadata (promote, deprecate, set rollback)
router.put("/:id/versions/:versionId", async (req, res) => {
  try {
    const pvRepo = AppDataSource.getRepository(PackageVersion);
    const pv = await pvRepo.findOneBy({ id: req.params.versionId, packageId: req.params.id });
    if (!pv) {
      return res.status(404).json({ error: "Version not found" });
    }

    const { status, isRollbackTarget } = req.body;
    if (status !== undefined) pv.status = status;
    if (isRollbackTarget !== undefined) {
      // If setting as rollback target, unset all others for this package
      if (isRollbackTarget) {
        await pvRepo
          .createQueryBuilder()
          .update()
          .set({ isRollbackTarget: false })
          .where("packageId = :pid", { pid: req.params.id })
          .execute();
      }
      pv.isRollbackTarget = isRollbackTarget;
    }

    await pvRepo.save(pv);
    return res.json(pv);
  } catch (err) {
    console.error("PUT /packages/:id/versions/:versionId error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/packages/:id/versions/:versionId/download ── Download a version's file
router.get("/:id/versions/:versionId/download", async (req, res) => {
  try {
    const pv = await AppDataSource.getRepository(PackageVersion).findOneBy({
      id: req.params.versionId,
      packageId: req.params.id,
    });
    if (!pv) {
      return res.status(404).json({ error: "Version not found" });
    }
    if (!pv.filePath || !fs.existsSync(pv.filePath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    const filename = pv.originalFilename || `${req.params.id}-${pv.version}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    const stream = fs.createReadStream(pv.filePath);
    stream.pipe(res);
  } catch (err) {
    console.error("GET /packages/:id/versions/:versionId/download error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
