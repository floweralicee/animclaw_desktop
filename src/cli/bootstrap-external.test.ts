import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildBootstrapDiagnostics,
  checkAgentAuth,
  isPersistedPortAcceptable,
  parsePendingDeviceCount,
  readExistingGatewayPort,
  resolveBootstrapRolloutStage,
  isLegacyFallbackEnabled,
  isPluginLoadOnlyError,
  type BootstrapDiagnostics,
} from "./bootstrap-external.js";

function getCheck(
  diagnostics: BootstrapDiagnostics,
  id: BootstrapDiagnostics["checks"][number]["id"],
) {
  const check = diagnostics.checks.find((item) => item.id === id);
  expect(check).toBeDefined();
  return check!;
}

function createTempStateDir(): string {
  const homeDir = path.join(
    tmpdir(),
    `animclaw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const stateDir = path.join(homeDir, ".openclaw-animclaw");
  mkdirSync(stateDir, { recursive: true });
  return stateDir;
}

function writeConfig(stateDir: string, config: Record<string, unknown>): void {
  writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(config));
}

function writeAuthProfiles(stateDir: string, profiles: Record<string, unknown>): void {
  const agentDir = path.join(stateDir, "agents", "main", "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(path.join(agentDir, "auth-profiles.json"), JSON.stringify(profiles));
}

describe("bootstrap-external diagnostics", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = createTempStateDir();
    writeConfig(stateDir, {
      agents: { defaults: { model: { primary: "vercel-ai-gateway/anthropic/claude-opus-4.6" } } },
    });
    writeAuthProfiles(stateDir, {
      version: 1,
      profiles: {
        "vercel-ai-gateway:default": {
          type: "api_key",
          provider: "vercel-ai-gateway",
          key: "vck_test_key_1234567890",
        },
      },
    });
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  const baseParams = (dir: string) => ({
    profile: "animclaw",
    openClawCliAvailable: true,
    openClawVersion: "2026.3.1",
    gatewayPort: 20001,
    gatewayUrl: "ws://127.0.0.1:20001",
    gatewayProbe: { ok: true as const },
    webPort: 4200,
    webReachable: true,
    rolloutStage: "default" as const,
    legacyFallbackEnabled: false,
    stateDir: dir,
    env: { HOME: path.dirname(dir), OPENCLAW_HOME: path.dirname(dir) },
  });

  it("reports passing checks including agent-auth when config and keys exist", () => {
    const diagnostics = buildBootstrapDiagnostics(baseParams(stateDir));

    expect(getCheck(diagnostics, "profile").status).toBe("pass");
    expect(getCheck(diagnostics, "gateway").status).toBe("pass");
    expect(getCheck(diagnostics, "agent-auth").status).toBe("pass");
    expect(getCheck(diagnostics, "web-ui").status).toBe("pass");
    expect(diagnostics.hasFailures).toBe(false);
  });

  it("fails agent-auth when auth-profiles.json is missing (catches missing onboard)", () => {
    const emptyDir = createTempStateDir();
    writeConfig(emptyDir, {
      agents: { defaults: { model: { primary: "vercel-ai-gateway/anthropic/claude-4" } } },
    });

    try {
      const diagnostics = buildBootstrapDiagnostics(baseParams(emptyDir));
      const auth = getCheck(diagnostics, "agent-auth");
      expect(auth.status).toBe("fail");
      expect(auth.detail).toContain("auth-profiles.json");
      expect(auth.remediation).toContain("onboard --install-daemon");
      expect(diagnostics.hasFailures).toBe(true);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("fails agent-auth when key exists for wrong provider (catches provider mismatch)", () => {
    const dir = createTempStateDir();
    writeConfig(dir, {
      agents: { defaults: { model: { primary: "anthropic/claude-4" } } },
    });
    writeAuthProfiles(dir, {
      profiles: {
        "openai:default": { provider: "openai", key: "sk-test" },
      },
    });

    try {
      const diagnostics = buildBootstrapDiagnostics(baseParams(dir));
      const auth = getCheck(diagnostics, "agent-auth");
      expect(auth.status).toBe("fail");
      expect(auth.detail).toContain('"anthropic"');
      expect(auth.remediation).toContain("onboard --install-daemon");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails agent-auth when no model provider is configured", () => {
    const dir = createTempStateDir();
    writeConfig(dir, { agents: {} });

    try {
      const diagnostics = buildBootstrapDiagnostics(baseParams(dir));
      const auth = getCheck(diagnostics, "agent-auth");
      expect(auth.status).toBe("fail");
      expect(auth.detail).toContain("No model provider configured");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces actionable remediation for gateway auth failures", () => {
    const diagnostics = buildBootstrapDiagnostics({
      ...baseParams(stateDir),
      gatewayProbe: { ok: false as const, detail: "Unauthorized: token mismatch" },
    });

    const gateway = getCheck(diagnostics, "gateway");
    expect(gateway.status).toBe("fail");
    expect(String(gateway.remediation)).toContain("onboard");
    expect(String(gateway.remediation)).not.toContain("dangerouslyDisableDeviceAuth");
    expect(diagnostics.hasFailures).toBe(true);
  });

  it("includes break-glass guidance only for device signature/token mismatch failures", () => {
    const diagnostics = buildBootstrapDiagnostics({
      ...baseParams(stateDir),
      gatewayProbe: {
        ok: false as const,
        detail: "gateway connect failed: device signature invalid",
      },
    });

    const gateway = getCheck(diagnostics, "gateway");
    expect(gateway.status).toBe("fail");
    expect(String(gateway.remediation)).toContain("dangerouslyDisableDeviceAuth true");
    expect(String(gateway.remediation)).toContain("dangerouslyDisableDeviceAuth false");
    expect(String(gateway.remediation)).toContain("--profile animclaw");
  });

  it("marks rollout-stage as warning for beta and includes opt-in guidance", () => {
    const diagnostics = buildBootstrapDiagnostics({
      ...baseParams(stateDir),
      rolloutStage: "beta",
    });

    const rollout = getCheck(diagnostics, "rollout-stage");
    expect(rollout.status).toBe("warn");
    expect(String(rollout.remediation)).toContain("ANIMCLAW_BOOTSTRAP_BETA_OPT_IN");
  });

  it("fails cutover-gates when enforcement is enabled without gate envs", () => {
    const diagnostics = buildBootstrapDiagnostics({
      ...baseParams(stateDir),
      env: {
        HOME: path.dirname(stateDir),
        OPENCLAW_HOME: path.dirname(stateDir),
        ANIMCLAW_BOOTSTRAP_ENFORCE_SAFETY_GATES: "1",
      },
    });

    expect(getCheck(diagnostics, "cutover-gates").status).toBe("fail");
    expect(diagnostics.hasFailures).toBe(true);
  });

  it("passes cutover-gates when both required gate envs are set", () => {
    const diagnostics = buildBootstrapDiagnostics({
      ...baseParams(stateDir),
      env: {
        HOME: path.dirname(stateDir),
        OPENCLAW_HOME: path.dirname(stateDir),
        ANIMCLAW_BOOTSTRAP_MIGRATION_SUITE_OK: "1",
        ANIMCLAW_BOOTSTRAP_ONBOARDING_E2E_OK: "1",
      },
    });

    expect(getCheck(diagnostics, "cutover-gates").status).toBe("pass");
  });

  it("reports posthog-analytics pass when plugin is installed", () => {
    const diagnostics = buildBootstrapDiagnostics({
      ...baseParams(stateDir),
      posthogPluginInstalled: true,
    });
    expect(getCheck(diagnostics, "posthog-analytics").status).toBe("pass");
    expect(getCheck(diagnostics, "posthog-analytics").detail).toContain("installed");
  });

  it("reports posthog-analytics warn when plugin is not installed", () => {
    const diagnostics = buildBootstrapDiagnostics({
      ...baseParams(stateDir),
      posthogPluginInstalled: false,
    });
    expect(getCheck(diagnostics, "posthog-analytics").status).toBe("warn");
  });

  it("omits posthog-analytics check when param is not provided", () => {
    const diagnostics = buildBootstrapDiagnostics(baseParams(stateDir));
    const check = diagnostics.checks.find((c) => c.id === "posthog-analytics");
    expect(check).toBeUndefined();
  });
});

describe("checkAgentAuth", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = createTempStateDir();
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("returns ok when a valid key exists for the requested provider", () => {
    writeAuthProfiles(stateDir, {
      profiles: {
        "vercel-ai-gateway:default": {
          provider: "vercel-ai-gateway",
          key: "vck_valid_key",
        },
      },
    });
    const result = checkAgentAuth(stateDir, "vercel-ai-gateway");
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("vercel-ai-gateway");
  });

  it("returns not ok when auth-profiles.json does not exist", () => {
    const result = checkAgentAuth(stateDir, "vercel-ai-gateway");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("auth-profiles.json");
  });

  it("returns not ok when key exists for a different provider", () => {
    writeAuthProfiles(stateDir, {
      profiles: {
        "openai:default": { provider: "openai", key: "sk-test" },
      },
    });
    const result = checkAgentAuth(stateDir, "anthropic");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('"anthropic"');
  });

  it("returns not ok when key string is empty", () => {
    writeAuthProfiles(stateDir, {
      profiles: {
        "vercel-ai-gateway:default": { provider: "vercel-ai-gateway", key: "" },
      },
    });
    const result = checkAgentAuth(stateDir, "vercel-ai-gateway");
    expect(result.ok).toBe(false);
  });

  it("returns not ok when provider is undefined", () => {
    const result = checkAgentAuth(stateDir, undefined);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("No model provider configured");
  });

  it("returns not ok when profiles object is empty", () => {
    writeAuthProfiles(stateDir, { profiles: {} });
    const result = checkAgentAuth(stateDir, "vercel-ai-gateway");
    expect(result.ok).toBe(false);
  });
});

describe("bootstrap-external rollout env helpers", () => {
  it("resolves rollout stage from animclaw/openclaw env vars", () => {
    expect(resolveBootstrapRolloutStage({ ANIMCLAW_BOOTSTRAP_ROLLOUT: "beta" })).toBe("beta");
    expect(resolveBootstrapRolloutStage({ OPENCLAW_BOOTSTRAP_ROLLOUT: "internal" })).toBe(
      "internal",
    );
    expect(resolveBootstrapRolloutStage({ ANIMCLAW_BOOTSTRAP_ROLLOUT: "invalid" })).toBe("default");
  });

  it("detects legacy fallback via either env namespace", () => {
    expect(isLegacyFallbackEnabled({ ANIMCLAW_BOOTSTRAP_LEGACY_FALLBACK: "1" })).toBe(true);
    expect(isLegacyFallbackEnabled({ OPENCLAW_BOOTSTRAP_LEGACY_FALLBACK: "true" })).toBe(true);
    expect(isLegacyFallbackEnabled({})).toBe(false);
  });
});

describe("readExistingGatewayPort", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = createTempStateDir();
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("reads numeric port from openclaw.json (normal config path)", () => {
    writeConfig(stateDir, { gateway: { port: 20001 } });
    expect(readExistingGatewayPort(stateDir)).toBe(20001);
  });

  it("falls back to config.json when openclaw.json is absent (legacy config support)", () => {
    writeFileSync(path.join(stateDir, "config.json"), JSON.stringify({ gateway: { port: 20005 } }));
    expect(readExistingGatewayPort(stateDir)).toBe(20005);
  });

  it("prefers openclaw.json over config.json when both exist (config precedence)", () => {
    writeConfig(stateDir, { gateway: { port: 20001 } });
    writeFileSync(path.join(stateDir, "config.json"), JSON.stringify({ gateway: { port: 20099 } }));
    expect(readExistingGatewayPort(stateDir)).toBe(20001);
  });

  it("returns undefined when no config files exist (fresh install)", () => {
    expect(readExistingGatewayPort(stateDir)).toBeUndefined();
  });

  it("returns undefined when config has no gateway section (incomplete config)", () => {
    writeConfig(stateDir, { agents: {} });
    expect(readExistingGatewayPort(stateDir)).toBeUndefined();
  });

  it("parses string port values (handles config.set serialization)", () => {
    writeConfig(stateDir, { gateway: { port: "20001" } });
    expect(readExistingGatewayPort(stateDir)).toBe(20001);
  });

  it("rejects zero and negative ports (invalid port values)", () => {
    writeConfig(stateDir, { gateway: { port: 0 } });
    expect(readExistingGatewayPort(stateDir)).toBeUndefined();

    writeConfig(stateDir, { gateway: { port: -1 } });
    expect(readExistingGatewayPort(stateDir)).toBeUndefined();
  });

  it("returns undefined for malformed JSON (handles corrupt config gracefully)", () => {
    writeFileSync(path.join(stateDir, "openclaw.json"), "not valid json{{{");
    expect(readExistingGatewayPort(stateDir)).toBeUndefined();
  });

  it("returns 18789 when config has it (reader does not filter; caller must guard)", () => {
    writeConfig(stateDir, { gateway: { port: 18789 } });
    expect(readExistingGatewayPort(stateDir)).toBe(18789);
  });
});

describe("isPluginLoadOnlyError", () => {
  it("returns true for a single Telegram ENOENT plugin error line", () => {
    const stderr =
      'Error: bundled plugin entry "./src/channel.setup.js" failed to open from ' +
      '"/home/user/.nvm/versions/node/v24.1.0/lib/node_modules/openclaw/dist/extensions/telegram/setup-entry.js" ' +
      '(resolved "...telegram/src/channel.setup.js", plugin root "...telegram", reason "path"): ' +
      "ENOENT: no such file or directory, lstat '/...telegram/src/channel.setup.js'";
    expect(isPluginLoadOnlyError(stderr)).toBe(true);
  });

  it("returns true when all lines match plugin load failure patterns", () => {
    const stderr = [
      'Error: bundled plugin entry "./src/channel.setup.js" failed to open from "...telegram/setup-entry.js"',
      "ENOENT: no such file or directory, lstat '/path/to/file'",
      'plugin root "...telegram", reason "path"',
    ].join("\n");
    expect(isPluginLoadOnlyError(stderr)).toBe(true);
  });

  it("returns false when stderr contains a real error mixed with a plugin error", () => {
    const stderr = [
      'Error: bundled plugin entry "./src/channel.setup.js" failed to open',
      "Error: Failed to initialize gateway daemon",
    ].join("\n");
    expect(isPluginLoadOnlyError(stderr)).toBe(false);
  });

  it("returns false for empty stderr", () => {
    expect(isPluginLoadOnlyError("")).toBe(false);
    expect(isPluginLoadOnlyError("   \n  \n")).toBe(false);
  });

  it("returns false for a generic error unrelated to plugins", () => {
    expect(isPluginLoadOnlyError("Error: ECONNREFUSED 127.0.0.1:20001")).toBe(false);
  });

  it("returns false when one line is a real error beside plugin errors", () => {
    const stderr = [
      'Error: bundled plugin entry "./src/foo.js" failed to open from "...setup-entry.js"',
      "Error: Cannot find module 'some-core-module'",
    ].join("\n");
    expect(isPluginLoadOnlyError(stderr)).toBe(false);
  });
});

describe("isPersistedPortAcceptable", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = createTempStateDir();
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("rejects 18789 (prevents OpenClaw port hijack on launchd restart)", () => {
    expect(isPersistedPortAcceptable(18789)).toBe(false);
  });

  it("accepts AnimClaw's own port range (normal operation)", () => {
    expect(isPersistedPortAcceptable(20001)).toBe(true);
    expect(isPersistedPortAcceptable(20002)).toBe(true);
    expect(isPersistedPortAcceptable(20100)).toBe(true);
  });

  it("rejects undefined (no persisted port to reuse)", () => {
    expect(isPersistedPortAcceptable(undefined)).toBe(false);
  });

  it("rejects zero and negative values (invalid ports)", () => {
    expect(isPersistedPortAcceptable(0)).toBe(false);
    expect(isPersistedPortAcceptable(-1)).toBe(false);
  });

  it("rejects corrupted 18789 from config (end-to-end: read + guard prevents port hijack)", () => {
    writeConfig(stateDir, { gateway: { port: 18789 } });
    const port = readExistingGatewayPort(stateDir);
    expect(port).toBe(18789);
    expect(isPersistedPortAcceptable(port)).toBe(false);
  });

  it("accepts valid 20001 from config (end-to-end: read + guard allows AnimClaw port)", () => {
    writeConfig(stateDir, { gateway: { port: 20001 } });
    const port = readExistingGatewayPort(stateDir);
    expect(port).toBe(20001);
    expect(isPersistedPortAcceptable(port)).toBe(true);
  });
});

// ── parsePendingDeviceCount ───────────────────────────────────────────────────

describe("parsePendingDeviceCount", () => {
  it("returns 0 for empty or non-JSON input", () => {
    expect(parsePendingDeviceCount("")).toBe(0);
    expect(parsePendingDeviceCount("   ")).toBe(0);
    expect(parsePendingDeviceCount("not json")).toBe(0);
  });

  it("returns 0 when no pending devices in root array", () => {
    const output = JSON.stringify([
      { id: "dev-1", status: "approved" },
      { id: "dev-2", status: "approved" },
    ]);
    expect(parsePendingDeviceCount(output)).toBe(0);
  });

  it("counts pending devices in root array format", () => {
    const output = JSON.stringify([
      { id: "dev-1", status: "approved" },
      { id: "dev-2", status: "pending" },
    ]);
    expect(parsePendingDeviceCount(output)).toBe(1);
  });

  it("counts multiple pending in root array", () => {
    const output = JSON.stringify([
      { id: "dev-1", status: "pending" },
      { id: "dev-2", status: "pending" },
    ]);
    expect(parsePendingDeviceCount(output)).toBe(2);
  });

  it("handles { pending: [...] } format (all items are pending by definition)", () => {
    const output = JSON.stringify({
      pending: [{ id: "req-1" }, { id: "req-2" }],
    });
    expect(parsePendingDeviceCount(output)).toBe(2);
  });

  it("handles { devices: [...] } format with status field", () => {
    const output = JSON.stringify({
      devices: [
        { id: "dev-1", status: "approved" },
        { id: "dev-2", status: "pending" },
      ],
    });
    expect(parsePendingDeviceCount(output)).toBe(1);
  });

  it("handles { requests: [...] } format", () => {
    const output = JSON.stringify({
      requests: [{ id: "req-1", status: "pending" }],
    });
    expect(parsePendingDeviceCount(output)).toBe(1);
  });

  it("treats approved=false as pending", () => {
    const output = JSON.stringify([
      { id: "dev-1", approved: true },
      { id: "dev-2", approved: false },
    ]);
    expect(parsePendingDeviceCount(output)).toBe(1);
  });

  it("parses plain-text '1 pending' output as fallback", () => {
    expect(parsePendingDeviceCount("1 pending request")).toBe(1);
    expect(parsePendingDeviceCount("3 pending device(s) waiting for approval")).toBe(3);
  });

  it("returns 0 for JSON object with no recognized device keys", () => {
    expect(parsePendingDeviceCount(JSON.stringify({ foo: "bar" }))).toBe(0);
  });
});
