import type { Command } from "commander";
import process from "node:process";
import { applyCliProfileEnv } from "../profile.js";
import { clearOpenClawCliCheckCache } from "../bootstrap-external.js";

export function registerCleanCacheCommand(program: Command) {
  program
    .command("clean-cache")
    .description("Remove cached OpenClaw CLI install check (forces a fresh probe on next bootstrap)")
    .option(
      "--profile <name>",
      "Compatibility flag; non-animclaw values are ignored with a warning",
    )
    .action((opts: { profile?: string }) => {
      const applied = applyCliProfileEnv({ profile: opts.profile });
      if (applied.warning) {
        console.warn(`[animclaw] ${applied.warning}`);
      }
      const { removed, path: cachePath } = clearOpenClawCliCheckCache(applied.stateDir);
      if (removed) {
        console.log(`[animclaw] Removed OpenClaw CLI check cache:\n  ${cachePath}`);
      } else {
        console.log(`[animclaw] No cache file at:\n  ${cachePath}`);
      }
      process.exitCode = 0;
    });
}
