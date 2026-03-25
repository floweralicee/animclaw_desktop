import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  appVersion:
    typeof process.env.npm_package_version === "string"
      ? process.env.npm_package_version
      : "dev",
});
