/**
 * Parse a .env file into key→value pairs (same rules as src/cli/web-runtime.ts).
 * Used so the packaged Electron app can inject AI_GATEWAY_API_KEY and Supabase
 * secrets into the Next.js standalone child process (production mode does not
 * auto-load apps/web/.env.local).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export function parseDotEnvFile(filePath: string): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return result;
  }
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key) continue;
    let value = line.slice(eqIdx + 1);
    const firstChar = value.trim()[0];
    if (firstChar === '"' || firstChar === "'") {
      const closeIdx = value.indexOf(firstChar, 1);
      value = closeIdx !== -1 ? value.slice(1, closeIdx) : value.slice(1);
    } else {
      value = value.split("#")[0]!.trim();
    }
    result[key] = value;
  }
  return result;
}

/**
 * Extra env vars for the Next.js standalone server (Vercel AI Gateway, Supabase, etc.).
 *
 * Resolution order (later merges override earlier):
 * 1. `ANIMCLAW_WEB_ENV` — absolute path to a .env file (optional override)
 * 2. `~/.openclaw-animclaw/web-app.env` — same format as apps/web/.env.local
 */
export function loadExtraWebServerEnv(): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = {};

  const override = process.env.ANIMCLAW_WEB_ENV?.trim();
  if (override) {
    const p = path.isAbsolute(override) ? override : path.join(os.homedir(), override);
    if (existsSync(p)) {
      Object.assign(merged, parseDotEnvFile(p));
    }
  }

  const homeDefault = path.join(os.homedir(), ".openclaw-animclaw", "web-app.env");
  if (existsSync(homeDefault)) {
    Object.assign(merged, parseDotEnvFile(homeDefault));
  }

  return merged;
}
