import type { NextConfig } from "next";
import { createRequire } from "node:module";
import path from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
	loadEnvConfig: (dir: string) => void;
};

// Load repository root `.env` so shared keys (e.g. `DENCH_API_KEY` for gateway auth) are
// available when dev runs with cwd `apps/web` (`pnpm desktop:dev`, `pnpm web:dev`).
loadEnvConfig(path.join(import.meta.dirname, "..", ".."));

const nextConfig: NextConfig = {
  // Produce a self-contained standalone build so npm global installs
  // can run the web app with `node server.js` — no npm install or
  // next build required at runtime.
  output: "standalone",

  // Required for pnpm monorepos: trace dependencies from the workspace
  // root so the standalone build bundles its own node_modules correctly
  // instead of resolving through pnpm's virtual store symlinks.
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),

  // Externalize packages with native addons so webpack doesn't break them
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate", "node-pty"],

  // Transpile ESM-only packages so webpack can bundle them
  transpilePackages: ["react-markdown", "remark-gfm"],

  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      // html-to-docx references Node-only modules that should not be resolved in browser bundles.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        encoding: false,
      };
    }
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/.next/**",
          path.join(homedir(), ".openclaw", "**"),
          path.join(homedir(), ".openclaw-*", "**"),
        ],
        poll: 1500,
      };
    }
    return config;
  },
};

export default nextConfig;
