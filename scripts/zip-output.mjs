#!/usr/bin/env node
import { createWriteStream, existsSync } from "node:fs";
import { rm, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "out");
const distDir = path.join(projectRoot, "dist");
const stagingDir = path.join(distDir, "upload");
const zipName = "esvierneshoy.zip";
const zipPath = path.join(distDir, zipName);

async function ensureDistFolder() {
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true, force: true });
  }
  await mkdir(distDir, { recursive: true });
}

async function createZip() {
  if (!existsSync(outDir)) {
    console.error("The out/ directory does not exist. Run `npm run build` first.");
    process.exit(1);
  }

  await ensureDistFolder();
  await mkdir(stagingDir, { recursive: true });

  await cp(outDir, stagingDir, { recursive: true });

  const extraFiles = [
    ["php/config.php", "config.php"],
    ["php/stats.php", "stats.php"],
    ["php/schema.sql", "schema.sql"],
  ];

  for (const [sourceRel, targetRel] of extraFiles) {
    const source = path.join(projectRoot, sourceRel);
    if (existsSync(source)) {
      await cp(source, path.join(stagingDir, targetRel), { recursive: true });
    }
  }

  const statsDir = path.join(projectRoot, "php", "stats");
  if (existsSync(statsDir)) {
    await cp(statsDir, path.join(stagingDir, "stats"), { recursive: true });
  }

  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(stagingDir + "/", false);
    archive.finalize();
  });
}

try {
  await createZip();
  console.log(`Created ${path.relative(projectRoot, zipPath)}`);
  await rm(stagingDir, { recursive: true, force: true });
} catch (error) {
  console.error("Failed to create zip:", error);
  process.exit(1);
}
