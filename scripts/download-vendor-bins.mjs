#!/usr/bin/env node

/**
 * Downloads portable Node.js, OpenClaw CLI, and DuckDB CLI binaries for the
 * target platform so they can be bundled inside the Electron app as extraResource.
 *
 * Usage:
 *   node scripts/download-vendor-bins.mjs [--platform <platform>] [--arch <arch>]
 *
 * Defaults to the current platform/arch when flags are omitted.
 * Output: apps/desktop/vendor-bin/<platform>-<arch>/
 */

import { createWriteStream, existsSync, mkdirSync, chmodSync, readdirSync, renameSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createGunzip } from "node:zlib";

const NODE_VERSION = "22.16.0";
const DUCKDB_VERSION = "1.3.0";

function parseArgs() {
  const args = process.argv.slice(2);
  let platform = os.platform();
  let arch = os.arch();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platform" && args[i + 1]) platform = args[++i];
    if (args[i] === "--arch" && args[i + 1]) arch = args[++i];
  }
  return { platform, arch };
}

const { platform, arch } = parseArgs();
const targetKey = `${platform}-${arch}`;
const ROOT = path.resolve(import.meta.dirname, "..");
const VENDOR_DIR = path.join(ROOT, "apps", "desktop", "vendor-bin", targetKey);
const TMP_DIR = path.join(ROOT, "apps", "desktop", "vendor-bin", ".tmp");

console.log(`\n=== Downloading vendor binaries for ${targetKey} ===\n`);

mkdirSync(VENDOR_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function download(url, destPath) {
  console.log(`  GET ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, createWriteStream(destPath));
}

function exec(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", ...opts });
}

// ---------------------------------------------------------------------------
// 1. Node.js
// ---------------------------------------------------------------------------

async function downloadNode() {
  const nodeDir = path.join(VENDOR_DIR, "node");
  if (existsSync(nodeDir)) {
    console.log("[node] Already present, skipping.");
    return;
  }
  console.log(`[node] Downloading Node.js v${NODE_VERSION} for ${targetKey}...`);

  if (platform === "win32") {
    const zipName = `node-v${NODE_VERSION}-win-${arch === "arm64" ? "arm64" : "x64"}.zip`;
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${zipName}`;
    const zipPath = path.join(TMP_DIR, zipName);
    await download(url, zipPath);
    exec(`unzip -qo "${zipPath}" -d "${TMP_DIR}"`);
    const extracted = path.join(TMP_DIR, zipName.replace(".zip", ""));
    renameSync(extracted, nodeDir);
  } else {
    const platLabel = platform === "darwin" ? "darwin" : "linux";
    const archLabel = arch === "arm64" ? "arm64" : "x64";
    const tarName = `node-v${NODE_VERSION}-${platLabel}-${archLabel}.tar.gz`;
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${tarName}`;
    const tarPath = path.join(TMP_DIR, tarName);
    await download(url, tarPath);
    exec(`tar -xzf "${tarPath}" -C "${TMP_DIR}"`);
    const extracted = path.join(TMP_DIR, tarName.replace(".tar.gz", ""));
    renameSync(extracted, nodeDir);
  }

  console.log("[node] Done.");
}

// ---------------------------------------------------------------------------
// 2. OpenClaw CLI (from npm registry)
// ---------------------------------------------------------------------------

async function downloadOpenClaw() {
  const dest = platform === "win32"
    ? path.join(VENDOR_DIR, "openclaw.cmd")
    : path.join(VENDOR_DIR, "openclaw");

  if (existsSync(dest)) {
    console.log("[openclaw] Already present, skipping.");
    return;
  }
  console.log("[openclaw] Installing openclaw@latest from npm...");

  const installDir = path.join(TMP_DIR, "openclaw-install");
  mkdirSync(installDir, { recursive: true });

  exec(`npm init -y`, { cwd: installDir, stdio: "pipe" });
  exec(`npm install openclaw@latest --save`, { cwd: installDir });

  const openclawPkg = path.join(installDir, "node_modules", "openclaw");
  const openclawPkgJson = JSON.parse(
    (await import("node:fs")).readFileSync(path.join(openclawPkg, "package.json"), "utf-8"),
  );

  const binEntry = typeof openclawPkgJson.bin === "string"
    ? openclawPkgJson.bin
    : openclawPkgJson.bin?.openclaw;

  if (!binEntry) {
    throw new Error("Could not resolve openclaw bin entry from package.json");
  }

  // Copy the entire openclaw package into vendor-bin so the JS entry + deps work
  const openclawVendor = path.join(VENDOR_DIR, "openclaw-pkg");
  if (existsSync(openclawVendor)) rmSync(openclawVendor, { recursive: true });
  exec(`cp -r "${path.join(installDir, "node_modules")}" "${openclawVendor}"`);

  // Create a wrapper script that invokes the bundled node + openclaw entry
  const binAbsolute = path.resolve(openclawPkg, binEntry);
  const binRelative = path.relative(openclawPkg, binAbsolute);

  if (platform === "win32") {
    const script = `@echo off\r\n"%~dp0\\node\\node.exe" "%~dp0\\openclaw-pkg\\openclaw\\${binRelative.replace(/\//g, "\\")}" %*\r\n`;
    (await import("node:fs")).writeFileSync(dest, script, "utf-8");
  } else {
    const script = `#!/bin/sh\nexec "$(dirname "$0")/node/bin/node" "$(dirname "$0")/openclaw-pkg/openclaw/${binRelative}" "$@"\n`;
    (await import("node:fs")).writeFileSync(dest, script, "utf-8");
    chmodSync(dest, 0o755);
  }

  console.log("[openclaw] Done.");
}

// ---------------------------------------------------------------------------
// 3. DuckDB CLI
// ---------------------------------------------------------------------------

async function downloadDuckDB() {
  const dest = platform === "win32"
    ? path.join(VENDOR_DIR, "duckdb.exe")
    : path.join(VENDOR_DIR, "duckdb");

  if (existsSync(dest)) {
    console.log("[duckdb] Already present, skipping.");
    return;
  }
  console.log(`[duckdb] Downloading DuckDB CLI v${DUCKDB_VERSION} for ${targetKey}...`);

  let assetName;
  if (platform === "darwin") {
    assetName = "duckdb_cli-osx-universal.zip";
  } else if (platform === "linux") {
    assetName = arch === "arm64" ? "duckdb_cli-linux-aarch64.zip" : "duckdb_cli-linux-amd64.zip";
  } else {
    assetName = "duckdb_cli-windows-amd64.zip";
  }

  const url = `https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VERSION}/${assetName}`;
  const zipPath = path.join(TMP_DIR, assetName);
  await download(url, zipPath);
  exec(`unzip -qo "${zipPath}" -d "${TMP_DIR}/duckdb-extract"`);

  const extractedBin = platform === "win32"
    ? path.join(TMP_DIR, "duckdb-extract", "duckdb.exe")
    : path.join(TMP_DIR, "duckdb-extract", "duckdb");

  renameSync(extractedBin, dest);
  if (platform !== "win32") chmodSync(dest, 0o755);

  console.log("[duckdb] Done.");
}

// ---------------------------------------------------------------------------
// Run all downloads
// ---------------------------------------------------------------------------

try {
  await downloadNode();
  await downloadOpenClaw();
  await downloadDuckDB();
  // Cleanup temp
  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`\n=== All vendor binaries ready in ${VENDOR_DIR} ===\n`);
} catch (err) {
  console.error("\nFatal error downloading vendor binaries:", err);
  process.exit(1);
}
