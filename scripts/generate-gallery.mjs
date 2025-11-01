#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const PUBLIC_AI_DIR = path.join(PROJECT_ROOT, "public", "ai");

const moods = [
  { key: "friday", dir: "friday" },
  { key: "notFriday", dir: "not-friday" },
];

const seasons = ["winter", "spring", "summer", "autumn"];

const manifest = {
  generatedAt: new Date().toISOString(),
  hemisphereDefault: process.env.NEXT_PUBLIC_HEMISPHERE ?? "north",
};

function collectImages(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file))
    .map((file) => {
      const absolute = path.join(dir, file);
      const relative = path.relative(path.join(PROJECT_ROOT, "public"), absolute).replace(/\\/g, "/");
      return `/${relative}`;
    })
    .sort((a, b) => a.localeCompare(b));
}

for (const mood of moods) {
  const baseDir = path.join(PUBLIC_AI_DIR, mood.dir);
  const baseImages = collectImages(baseDir);
  const seasonImages = {};

  for (const season of seasons) {
    seasonImages[season] = collectImages(path.join(baseDir, season));
  }

  manifest[mood.key] = {
    base: baseImages,
    seasons: seasonImages,
  };
}

const outputPath = path.join(PUBLIC_AI_DIR, "gallery-manifest.json");
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
console.log(`gallery-manifest.json generated (${manifest.generatedAt})`);
