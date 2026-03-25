import { describe, it, expect } from "vitest";
import {
  rewriteBareArgvToBootstrap,
  shouldHideCliBanner,
  shouldEnableBootstrapCutover,
  shouldEnsureCliPath,
  shouldDelegateToGlobalOpenClaw,
} from "./run-main.js";

describe("run-main bootstrap cutover", () => {
  it("rewrites bare animclaw invocations to bootstrap by default", () => {
    const argv = ["node", "animclaw"];
    expect(rewriteBareArgvToBootstrap(argv, {})).toEqual(["node", "animclaw", "bootstrap"]);
  });

  it("does not rewrite when a command already exists", () => {
    const argv = ["node", "animclaw", "chat"];
    expect(rewriteBareArgvToBootstrap(argv, {})).toEqual(argv);
  });

  it("does not rewrite non-animclaw CLIs", () => {
    const argv = ["node", "openclaw"];
    expect(rewriteBareArgvToBootstrap(argv, {})).toEqual(argv);
  });

  it("disables cutover in legacy rollout stage", () => {
    const env = { ANIMCLAW_BOOTSTRAP_ROLLOUT: "legacy" };
    expect(shouldEnableBootstrapCutover(env)).toBe(false);
    expect(rewriteBareArgvToBootstrap(["node", "animclaw"], env)).toEqual(["node", "animclaw"]);
  });

  it("requires opt-in for beta rollout stage", () => {
    const envNoOptIn = { ANIMCLAW_BOOTSTRAP_ROLLOUT: "beta" };
    const envOptIn = {
      ANIMCLAW_BOOTSTRAP_ROLLOUT: "beta",
      ANIMCLAW_BOOTSTRAP_BETA_OPT_IN: "1",
    };

    expect(shouldEnableBootstrapCutover(envNoOptIn)).toBe(false);
    expect(shouldEnableBootstrapCutover(envOptIn)).toBe(true);
  });

  it("honors explicit legacy fallback override", () => {
    const env = { ANIMCLAW_BOOTSTRAP_LEGACY_FALLBACK: "1" };
    expect(shouldEnableBootstrapCutover(env)).toBe(false);
    expect(rewriteBareArgvToBootstrap(["node", "animclaw"], env)).toEqual(["node", "animclaw"]);
  });
});

describe("run-main delegation and path guards", () => {
  it("skips CLI path bootstrap for read-only status/help commands", () => {
    expect(shouldEnsureCliPath(["node", "animclaw", "--help"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "animclaw", "status"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "animclaw", "health"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "animclaw", "sessions"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "animclaw", "config", "get"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "animclaw", "models", "list"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "animclaw", "chat", "send"])).toBe(true);
  });

  it("delegates non-core commands to OpenClaw and never delegates core CLI commands", () => {
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "chat"])).toBe(true);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "bootstrap"])).toBe(false);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "update"])).toBe(false);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "stop"])).toBe(false);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "start"])).toBe(false);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "restart"])).toBe(false);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "telemetry"])).toBe(false);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw"])).toBe(false);
  });

  it("does not delegate telemetry subcommands to OpenClaw (prevents 'unknown command' error)", () => {
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "telemetry", "status"])).toBe(false);
    expect(shouldDelegateToGlobalOpenClaw(["node", "animclaw", "telemetry", "privacy", "on"])).toBe(
      false,
    );
    expect(
      shouldDelegateToGlobalOpenClaw(["node", "animclaw", "telemetry", "privacy", "off"]),
    ).toBe(false);
  });

  it("disables delegation when explicit env disable flag is set", () => {
    expect(
      shouldDelegateToGlobalOpenClaw(["node", "animclaw", "chat"], {
        ANIMCLAW_DISABLE_OPENCLAW_DELEGATION: "1",
      }),
    ).toBe(false);
    expect(
      shouldDelegateToGlobalOpenClaw(["node", "animclaw", "chat"], {
        OPENCLAW_DISABLE_OPENCLAW_DELEGATION: "true",
      }),
    ).toBe(false);
  });
});

describe("run-main banner visibility", () => {
  it("keeps banner visible for update/start/stop lifecycle commands", () => {
    expect(shouldHideCliBanner(["node", "animclaw", "update"])).toBe(false);
    expect(shouldHideCliBanner(["node", "animclaw", "start"])).toBe(false);
    expect(shouldHideCliBanner(["node", "animclaw", "stop"])).toBe(false);
  });

  it("hides banner only for completion and plugin-update helper commands", () => {
    expect(shouldHideCliBanner(["node", "animclaw", "completion"])).toBe(true);
    expect(shouldHideCliBanner(["node", "animclaw", "plugins", "update"])).toBe(true);
    expect(shouldHideCliBanner(["node", "animclaw", "chat"])).toBe(false);
  });
});
