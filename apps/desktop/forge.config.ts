import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerDeb } from "@electron-forge/maker-deb";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";

const config: ForgeConfig = {
  packagerConfig: {
    name: "AnimClaw",
    executableName: "animclaw",
    icon: "./icons/icon",
    asar: true,
    extraResource: [
      "../../apps/web/.next/standalone",
      "./vendor-bin",
      "../../dist",
      "../../animclaw.mjs",
      "../../extensions",
      "../../skills",
      "../../assets",
    ],
  },
  makers: [
    new MakerSquirrel({
      name: "AnimClaw",
      setupIcon: "./icons/icon.ico",
    }),
    new MakerDMG({
      name: "AnimClaw",
      icon: "./icons/icon.icns",
      format: "ULFO",
    }),
    new MakerDeb({
      options: {
        name: "animclaw",
        productName: "AnimClaw",
        icon: "./icons/icon.png",
        maintainer: "AnimClaw",
        homepage: "https://github.com/floweralicee/animclaw_desktop",
        categories: ["Utility", "Development"],
      },
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: "floweralicee",
        name: "animclaw_desktop",
      },
      prerelease: false,
      draft: true,
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [],
    }),
  ],
};

export default config;
