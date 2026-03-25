import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  autoUpdater,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import { loadWindowState, saveWindowState } from "./window-state";

if (require("electron-squirrel-startup")) app.quit();

const NEXT_PORT = 3100;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;
const IS_DEV = !app.isPackaged;

// ---------------------------------------------------------------------------
// Bundled vendor binaries: prepend to PATH so spawned child processes
// (openclaw, duckdb, node) resolve to the binaries shipped with the app.
// ---------------------------------------------------------------------------

function setupBundledEnvironment(): void {
  if (IS_DEV) return;

  const targetKey = `${process.platform}-${process.arch}`;
  const vendorBinDir = path.join(process.resourcesPath, "vendor-bin", targetKey);
  const vendorNodeBinDir = path.join(vendorBinDir, "node", "bin");

  const pathDirs: string[] = [];
  if (existsSync(vendorBinDir)) pathDirs.push(vendorBinDir);
  if (existsSync(vendorNodeBinDir)) pathDirs.push(vendorNodeBinDir);

  if (pathDirs.length > 0) {
    const sep = process.platform === "win32" ? ";" : ":";
    process.env.PATH = pathDirs.join(sep) + sep + (process.env.PATH ?? "");
  }

  process.env.ANIMCLAW_BUNDLED = "1";

  const cliRoot = path.join(process.resourcesPath);
  process.env.ANIMCLAW_CLI_ROOT = cliRoot;
  process.env.ANIMCLAW_VENDOR_BIN = vendorBinDir;
}

setupBundledEnvironment();

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;

function getStandalonePath(): string {
  if (IS_DEV) {
    return path.join(__dirname, "..", "..", "..", "apps", "web", ".next", "standalone", "apps", "web", "server.js");
  }
  return path.join(process.resourcesPath, "standalone", "apps", "web", "server.js");
}

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            retry();
          }
        })
        .on("error", retry);
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} did not start within ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 200);
    };

    check();
  });
}

function startNextServer(): ChildProcess {
  const serverPath = getStandalonePath();
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(NEXT_PORT),
      HOSTNAME: "localhost",
      NODE_ENV: IS_DEV ? "development" : "production",
    },
    stdio: "pipe",
  });

  child.stdout?.on("data", (data) => {
    console.log(`[next] ${data}`);
  });
  child.stderr?.on("data", (data) => {
    console.error(`[next] ${data}`);
  });
  child.on("exit", (code) => {
    console.log(`[next] exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      nextProcess = null;
    }
  });

  return child;
}

function createWindow(): BrowserWindow {
  const state = loadWindowState();

  const win = new BrowserWindow({
    width: state.width ?? 1280,
    height: state.height ?? 820,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: "#eff1f5",
  });

  win.once("ready-to-show", () => win.show());

  win.on("close", () => {
    saveWindowState(win.getBounds());
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupProtocolHandler(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("animclaw", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("animclaw");
  }
}

function setupAutoUpdater(): void {
  if (IS_DEV) return;

  const feedUrl = `https://github.com/floweralicee/animclaw_desktop/releases/latest/download`;

  try {
    autoUpdater.setFeedURL({ url: feedUrl });
    autoUpdater.checkForUpdates();
  } catch {
    // Auto-updater not available on this platform
  }

  autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Available",
        message: `A new version${releaseName ? ` (${releaseName})` : ""} is ready to install.`,
        detail: "The update will be applied when you restart the app.",
        buttons: ["Restart Now", "Later"],
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err);
  });
}

app.on("open-url", (_event, url) => {
  if (url.startsWith("animclaw://auth/callback")) {
    const parsed = new URL(url);
    const redirectUrl = `${NEXT_URL}/api/auth/callback/google${parsed.search}`;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(redirectUrl);
    }
  }
});

app.whenReady().then(async () => {
  setupProtocolHandler();
  buildMenu();

  app.setAboutPanelOptions({
    applicationName: "AnimClaw",
    applicationVersion: app.getVersion(),
    copyright: "Copyright AnimClaw",
  });

  if (!IS_DEV) {
    nextProcess = startNextServer();
    try {
      await waitForServer(NEXT_URL);
    } catch (err) {
      dialog.showErrorBox(
        "Startup Error",
        `Could not start the application server.\n\n${err}`,
      );
      app.quit();
      return;
    }
  }

  mainWindow = createWindow();
  mainWindow.loadURL(NEXT_URL);

  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    mainWindow.loadURL(NEXT_URL);
  }
});

app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});
