import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

interface WindowState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

const STATE_FILE = path.join(app.getPath("userData"), "window-state.json");

export function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as WindowState;
  } catch {
    return {};
  }
}

export function saveWindowState(bounds: Electron.Rectangle): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(bounds), "utf-8");
  } catch {
    // Non-critical — ignore write failures
  }
}
