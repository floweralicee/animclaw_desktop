import { spawn, type StdioOptions } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { confirm, isCancel, note, password, select, spinner } from "@clack/prompts";
import { isTruthyEnvValue } from "../infra/env.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { readTelemetryConfig, markNoticeShown } from "../telemetry/config.js";
import { track } from "../telemetry/telemetry.js";
import { stylePromptMessage } from "../terminal/prompt-style.js";
import { theme } from "../terminal/theme.js";
import { VERSION } from "../version.js";
import { applyCliProfileEnv } from "./profile.js";
import {
  DEFAULT_WEB_APP_PORT,
  ensureManagedWebRuntime,
  resolveCliPackageRoot,
  resolveProfileStateDir,
} from "./web-runtime.js";
import { seedWorkspaceFromAssets, type WorkspaceSeedResult } from "./workspace-seed.js";

const DEFAULT_DENCHCLAW_PROFILE = "animclaw";
const DENCHCLAW_GATEWAY_PORT_START = 20001;
const MAX_PORT_SCAN_ATTEMPTS = 100;
const DEFAULT_BOOTSTRAP_ROLLOUT_STAGE = "default";
const DEFAULT_GATEWAY_LAUNCH_AGENT_LABEL = "ai.openclaw.gateway";
const REQUIRED_TOOLS_PROFILE = "full";
/** Stale install-check entries are ignored after this age (plan: 24h). */
const OPENCLAW_CLI_CHECK_CACHE_TTL_MS = 24 * 60 * 60_000;
const OPENCLAW_UPDATE_PROMPT_SUPPRESS_AFTER_INSTALL_MS = 5 * 60_000;
const OPENCLAW_CLI_CHECK_CACHE_FILE = "openclaw-cli-check.json";
const OPENCLAW_SETUP_PROGRESS_BAR_WIDTH = 16;

type MediaApiKeyDef = { envKey: string; label: string; configPath: string };

type LlmProviderDef = {
  value: string;
  label: string;
  envKey: string;
  keyHint: string;
  defaultModel: string;
};

const LLM_PROVIDERS: readonly LlmProviderDef[] = [
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    keyHint: "sk-ant-...",
    defaultModel: "anthropic/claude-3.5-sonnet-20241022",
  },
  {
    value: "openai",
    label: "OpenAI (GPT-4o)",
    envKey: "OPENAI_API_KEY",
    keyHint: "sk-...",
    defaultModel: "openai/gpt-4o",
  },
] as const;

// configPath uses the `env.*` namespace so openclaw injects the key as an
// environment variable into the gateway process (the correct storage for
// third-party provider tokens).  The old `media.apiKeys.*` namespace is not
// recognized by the current openclaw CLI and causes a validation error.
const IMAGE_PROVIDERS: readonly MediaApiKeyDef[] = [
  { envKey: "FAL_KEY", label: "fal.ai (Nano Banana, FLUX, etc.)", configPath: "env.FAL_KEY" },
  { envKey: "STABILITY_API_KEY", label: "Stability AI (Stable Diffusion)", configPath: "env.STABILITY_API_KEY" },
  { envKey: "OPENAI_API_KEY", label: "OpenAI / DALL-E", configPath: "env.OPENAI_API_KEY" },
  { envKey: "REPLICATE_API_TOKEN", label: "Replicate", configPath: "env.REPLICATE_API_TOKEN" },
] as const;

const VIDEO_PROVIDERS: readonly MediaApiKeyDef[] = [
  { envKey: "FAL_KEY", label: "fal.ai (Veo, Kling, etc.)", configPath: "env.FAL_KEY" },
  { envKey: "RUNWAY_API_KEY", label: "Runway (Gen-3)", configPath: "env.RUNWAY_API_KEY" },
  { envKey: "REPLICATE_API_TOKEN", label: "Replicate", configPath: "env.REPLICATE_API_TOKEN" },
] as const;

const MODELING_PROVIDERS: readonly MediaApiKeyDef[] = [
  { envKey: "MESHY_API_KEY", label: "Meshy AI (Image-to-3D)", configPath: "env.MESHY_API_KEY" },
] as const;

const MEDIA_API_KEYS: readonly MediaApiKeyDef[] = (() => {
  const seen = new Set<string>();
  const merged: MediaApiKeyDef[] = [];
  for (const p of [...IMAGE_PROVIDERS, ...VIDEO_PROVIDERS, ...MODELING_PROVIDERS]) {
    if (!seen.has(p.envKey)) {
      seen.add(p.envKey);
      merged.push(p);
    }
  }
  return merged;
})();

type BootstrapRolloutStage = "internal" | "beta" | "default";
type BootstrapCheckStatus = "pass" | "warn" | "fail";

export type BootstrapCheck = {
  id:
    | "openclaw-cli"
    | "profile"
    | "gateway"
    | "agent-auth"
    | "web-ui"
    | "state-isolation"
    | "daemon-label"
    | "rollout-stage"
    | "cutover-gates"
    | "posthog-analytics";
  status: BootstrapCheckStatus;
  detail: string;
  remediation?: string;
};

export type BootstrapDiagnostics = {
  rolloutStage: BootstrapRolloutStage;
  legacyFallbackEnabled: boolean;
  checks: BootstrapCheck[];
  hasFailures: boolean;
};

export type BootstrapOptions = {
  profile?: string;
  yes?: boolean;
  nonInteractive?: boolean;
  forceOnboard?: boolean;
  skipUpdate?: boolean;
  updateNow?: boolean;
  noOpen?: boolean;
  json?: boolean;
  gatewayPort?: string | number;
  webPort?: string | number;
};

type BootstrapSummary = {
  profile: string;
  onboarded: boolean;
  installedOpenClawCli: boolean;
  openClawCliAvailable: boolean;
  openClawVersion?: string;
  gatewayUrl: string;
  gatewayReachable: boolean;
  gatewayAutoFix?: {
    attempted: boolean;
    recovered: boolean;
    steps: GatewayAutoFixStep[];
    failureSummary?: string;
    logExcerpts: GatewayLogExcerpt[];
  };
  workspaceSeed?: WorkspaceSeedResult;
  webUrl: string;
  webReachable: boolean;
  webOpened: boolean;
  diagnostics: BootstrapDiagnostics;
};

type SpawnResult = {
  stdout: string;
  stderr: string;
  code: number;
};

type OpenClawCliAvailability = {
  available: boolean;
  installed: boolean;
  installedAt?: number;
  version?: string;
  command: string;
  globalBinDir?: string;
  shellCommandPath?: string;
};

type OutputLineHandler = (line: string, stream: "stdout" | "stderr") => void;

type OpenClawCliCheckCache = {
  checkedAt: number;
  pathEnv: string;
  available: boolean;
  command: string;
  version?: string;
  globalBinDir?: string;
  shellCommandPath?: string;
  installedAt?: number;
};

type OpenClawSetupProgress = {
  startStage: (label: string) => void;
  output: (line: string) => void;
  completeStage: (suffix?: string) => void;
  finish: (message: string) => void;
  fail: (message: string) => void;
};

type GatewayAutoFixStep = {
  name: string;
  ok: boolean;
  detail?: string;
};

type GatewayLogExcerpt = {
  path: string;
  excerpt: string;
};

type GatewayAutoFixResult = {
  attempted: boolean;
  recovered: boolean;
  steps: GatewayAutoFixStep[];
  finalProbe: { ok: boolean; detail?: string };
  failureSummary?: string;
  logExcerpts: GatewayLogExcerpt[];
};

function resolveCommandForPlatform(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }
  if (path.extname(command)) {
    return command;
  }
  const normalized = path.basename(command).toLowerCase();
  if (
    normalized === "npm" ||
    normalized === "pnpm" ||
    normalized === "npx" ||
    normalized === "yarn"
  ) {
    return `${command}.cmd`;
  }
  return command;
}

async function runCommandWithTimeout(
  argv: string[],
  options: {
    timeoutMs: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    ioMode?: "capture" | "inherit";
    onOutputLine?: OutputLineHandler;
  },
): Promise<SpawnResult> {
  const [command, ...args] = argv;
  if (!command) {
    return { code: 1, stdout: "", stderr: "missing command" };
  }
  const stdio: StdioOptions = options.ioMode === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"];
  return await new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(resolveCommandForPlatform(command), args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      stdout += text;
      if (options.onOutputLine) {
        for (const segment of text.split(/\r?\n/)) {
          const line = segment.trim();
          if (line.length > 0) {
            options.onOutputLine(line, "stdout");
          }
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      stderr += text;
      if (options.onOutputLine) {
        for (const segment of text.split(/\r?\n/)) {
          const line = segment.trim();
          if (line.length > 0) {
            options.onOutputLine(line, "stderr");
          }
        }
      }
    });
    child.once("error", (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: typeof code === "number" ? code : 1,
        stdout,
        stderr,
      });
    });
  });
}

function parseOptionalPort(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const raw = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return raw;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

import { createConnection } from "node:net";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createConnection({ port, host: "127.0.0.1" }, () => {
      // Connection succeeded, port is in use
      server.end();
      resolve(false);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") {
        // Port is available (nothing listening)
        resolve(true);
      } else if (err.code === "EADDRNOTAVAIL") {
        // Address not available
        resolve(false);
      } else {
        // Other errors, assume port is not available
        resolve(false);
      }
    });
    server.setTimeout(1000, () => {
      server.destroy();
      resolve(false);
    });
  });
}

async function findAvailablePort(
  startPort: number,
  maxAttempts: number,
): Promise<number | undefined> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return undefined;
}

/**
 * Port 18789 belongs to the host OpenClaw installation.  A persisted config
 * that drifted to that value (e.g. bootstrap ran while OpenClaw was down)
 * must be rejected to prevent service hijack on launchd restart.
 */
export function isPersistedPortAcceptable(port: number | undefined): port is number {
  return typeof port === "number" && port > 0 && port !== 18789;
}

export function readExistingGatewayPort(stateDir: string): number | undefined {
  for (const name of ["openclaw.json", "config.json"]) {
    try {
      const raw = JSON.parse(readFileSync(path.join(stateDir, name), "utf-8")) as {
        gateway?: { port?: unknown };
      };
      const port =
        typeof raw.gateway?.port === "number"
          ? raw.gateway.port
          : typeof raw.gateway?.port === "string"
            ? Number.parseInt(raw.gateway.port, 10)
            : undefined;
      if (typeof port === "number" && Number.isFinite(port) && port > 0) {
        return port;
      }
    } catch {
      // Config file missing or malformed — try next candidate.
    }
  }
  return undefined;
}

function normalizeBootstrapRolloutStage(raw: string | undefined): BootstrapRolloutStage {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "internal" || normalized === "beta" || normalized === "default") {
    return normalized;
  }
  return DEFAULT_BOOTSTRAP_ROLLOUT_STAGE;
}

export function resolveBootstrapRolloutStage(
  env: NodeJS.ProcessEnv = process.env,
): BootstrapRolloutStage {
  return normalizeBootstrapRolloutStage(
    env.ANIMCLAW_BOOTSTRAP_ROLLOUT ?? env.OPENCLAW_BOOTSTRAP_ROLLOUT,
  );
}

export function isLegacyFallbackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isTruthyEnvValue(env.ANIMCLAW_BOOTSTRAP_LEGACY_FALLBACK) ||
    isTruthyEnvValue(env.OPENCLAW_BOOTSTRAP_LEGACY_FALLBACK)
  );
}

function normalizeVersionOutput(raw: string | undefined): string | undefined {
  const first = raw
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first && first.length > 0 ? first : undefined;
}

function firstNonEmptyLine(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const first = value
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) {
      return first;
    }
  }
  return undefined;
}

function resolveGatewayLaunchAgentLabel(profile: string): string {
  const normalized = profile.trim().toLowerCase();
  if (!normalized || normalized === "default") {
    return DEFAULT_GATEWAY_LAUNCH_AGENT_LABEL;
  }
  return `ai.openclaw.${normalized}`;
}

async function installBundledPlugins(params: {
  openclawCommand: string;
  profile: string;
  stateDir: string;
  posthogKey: string;
}): Promise<boolean> {
  try {
    const pluginSrc = path.join(resolveCliPackageRoot(), "extensions", "posthog-analytics");
    if (!existsSync(pluginSrc)) return false;

    const pluginDest = path.join(params.stateDir, "extensions", "posthog-analytics");
    mkdirSync(path.dirname(pluginDest), { recursive: true });
    cpSync(pluginSrc, pluginDest, { recursive: true, force: true });

    await runOpenClawOrThrow({
      openclawCommand: params.openclawCommand,
      args: [
        "--profile",
        params.profile,
        "config",
        "set",
        "plugins.allow",
        '["posthog-analytics"]',
      ],
      timeoutMs: 30_000,
      errorMessage: "Failed to set plugins.allow for posthog-analytics.",
    });

    await runOpenClawOrThrow({
      openclawCommand: params.openclawCommand,
      args: [
        "--profile",
        params.profile,
        "config",
        "set",
        "plugins.load.paths",
        JSON.stringify([pluginDest]),
      ],
      timeoutMs: 30_000,
      errorMessage: "Failed to set plugins.load.paths for posthog-analytics.",
    });

    if (params.posthogKey) {
      await runOpenClawOrThrow({
        openclawCommand: params.openclawCommand,
        args: [
          "--profile",
          params.profile,
          "config",
          "set",
          "plugins.entries.posthog-analytics.enabled",
          "true",
        ],
        timeoutMs: 30_000,
        errorMessage: "Failed to enable posthog-analytics plugin.",
      });
      await runOpenClawOrThrow({
        openclawCommand: params.openclawCommand,
        args: [
          "--profile",
          params.profile,
          "config",
          "set",
          "plugins.entries.posthog-analytics.config.apiKey",
          params.posthogKey,
        ],
        timeoutMs: 30_000,
        errorMessage: "Failed to set posthog-analytics API key.",
      });
    }

    // Restart the gateway so it loads the new/updated plugin.
    // On first bootstrap the gateway isn't running yet, so this
    // is a harmless no-op caught by the outer try/catch.
    try {
      await runOpenClawOrThrow({
        openclawCommand: params.openclawCommand,
        args: ["--profile", params.profile, "gateway", "restart"],
        timeoutMs: 60_000,
        errorMessage: "Failed to restart gateway after plugin install.",
      });
    } catch {
      // Gateway may not be running yet (first bootstrap) — ignore.
    }

    return true;
  } catch {
    return false;
  }
}

async function ensureGatewayModeLocal(openclawCommand: string, profile: string): Promise<void> {
  const result = await runOpenClaw(
    openclawCommand,
    ["--profile", profile, "config", "get", "gateway.mode"],
    10_000,
  );
  const currentMode = result.stdout.trim();
  if (currentMode === "local") {
    return;
  }
  await runOpenClawOrThrow({
    openclawCommand,
    args: ["--profile", profile, "config", "set", "gateway.mode", "local"],
    timeoutMs: 10_000,
    errorMessage: "Failed to set gateway.mode=local.",
  });
}

async function ensureGatewayPort(
  openclawCommand: string,
  profile: string,
  gatewayPort: number,
): Promise<void> {
  await runOpenClawOrThrow({
    openclawCommand,
    args: ["--profile", profile, "config", "set", "gateway.port", String(gatewayPort)],
    timeoutMs: 10_000,
    errorMessage: `Failed to set gateway.port=${gatewayPort}.`,
  });
}

async function ensureDefaultWorkspacePath(
  openclawCommand: string,
  profile: string,
  workspaceDir: string,
): Promise<void> {
  await runOpenClawOrThrow({
    openclawCommand,
    args: ["--profile", profile, "config", "set", "agents.defaults.workspace", workspaceDir],
    timeoutMs: 10_000,
    errorMessage: `Failed to set agents.defaults.workspace=${workspaceDir}.`,
  });
}

async function ensureSubagentDefaults(openclawCommand: string, profile: string): Promise<void> {
  const settings: Array<[string, string]> = [
    ["agents.defaults.subagents.maxConcurrent", "8"],
    ["agents.defaults.subagents.maxSpawnDepth", "2"],
    ["agents.defaults.subagents.maxChildrenPerAgent", "10"],
    ["agents.defaults.subagents.archiveAfterMinutes", "180"],
    ["agents.defaults.subagents.runTimeoutSeconds", "0"],
    ["tools.subagents.tools.deny", "[]"],
  ];
  for (const [key, value] of settings) {
    await runOpenClawOrThrow({
      openclawCommand,
      args: ["--profile", profile, "config", "set", key, value],
      timeoutMs: 10_000,
      errorMessage: `Failed to set ${key}=${value}.`,
    });
  }
}

async function ensureToolsProfile(openclawCommand: string, profile: string): Promise<void> {
  await runOpenClawOrThrow({
    openclawCommand,
    args: ["--profile", profile, "config", "set", "tools.profile", REQUIRED_TOOLS_PROFILE],
    timeoutMs: 10_000,
    errorMessage: `Failed to set tools.profile=${REQUIRED_TOOLS_PROFILE}.`,
  });
}

type MediaKeyResult = { envKey: string; label: string; configured: boolean; source: "env" | "prompt" | "skipped" };

async function persistMediaKey(
  params: { openclawCommand: string; profile: string; runtime: RuntimeEnv },
  keyDef: MediaApiKeyDef,
  configuredKeys: Set<string>,
): Promise<MediaKeyResult> {
  const existingEnvValue = process.env[keyDef.envKey]?.trim();
  if (existingEnvValue) {
    try {
      await runOpenClawOrThrow({
        openclawCommand: params.openclawCommand,
        args: ["--profile", params.profile, "config", "set", keyDef.configPath, existingEnvValue],
        timeoutMs: 10_000,
        errorMessage: `Failed to persist ${keyDef.envKey} from environment.`,
      });
      configuredKeys.add(keyDef.envKey);
      params.runtime.log(
        theme.muted(`  ${keyDef.label}: detected from ${keyDef.envKey} environment variable.`),
      );
      return { envKey: keyDef.envKey, label: keyDef.label, configured: true, source: "env" };
    } catch {
      return { envKey: keyDef.envKey, label: keyDef.label, configured: false, source: "env" };
    }
  }

  if (configuredKeys.has(keyDef.envKey)) {
    params.runtime.log(theme.muted(`  ${keyDef.label}: already configured (shared key).`));
    return { envKey: keyDef.envKey, label: keyDef.label, configured: true, source: "env" };
  }

  const value = await password({
    message: stylePromptMessage(`${keyDef.label} API key (${keyDef.envKey})`),
  });

  if (isCancel(value) || !value || !value.trim()) {
    return { envKey: keyDef.envKey, label: keyDef.label, configured: false, source: "skipped" };
  }

  try {
    await runOpenClawOrThrow({
      openclawCommand: params.openclawCommand,
      args: ["--profile", params.profile, "config", "set", keyDef.configPath, value.trim()],
      timeoutMs: 10_000,
      errorMessage: `Failed to save ${keyDef.envKey}.`,
    });
    configuredKeys.add(keyDef.envKey);
    return { envKey: keyDef.envKey, label: keyDef.label, configured: true, source: "prompt" };
  } catch {
    return { envKey: keyDef.envKey, label: keyDef.label, configured: false, source: "prompt" };
  }
}

/**
 * Prompt the user to select an LLM provider (Anthropic or OpenAI) and enter
 * their API key when bringing their own keys. Configures:
 *   - gateway.provider
 *   - gateway.apiKey
 *   - agents.defaults.model.primary (sensible default for the chosen provider)
 */
async function promptLlmProviderKey(params: {
  openclawCommand: string;
  profile: string;
  runtime: RuntimeEnv;
}): Promise<void> {
  note(
    [
      "AnimClaw needs an LLM API key to power chat and agent features.",
      "Choose a provider and enter your key below, or skip to configure later via:",
      "  openclaw --profile animclaw config set gateway.provider <provider>",
      "  openclaw --profile animclaw config set gateway.apiKey <key>",
    ].join("\n"),
    "LLM / Chat API Key",
  );

  // Check if an env var is already set for any provider.
  const envProvider = LLM_PROVIDERS.find(
    (p) => process.env[p.envKey]?.trim(),
  );

  let chosenProvider: LlmProviderDef | undefined;

  if (envProvider) {
    params.runtime.log(
      theme.muted(
        `  Detected ${envProvider.envKey} in environment — using ${envProvider.label}.`,
      ),
    );
    chosenProvider = envProvider;
  } else {
    const providerChoice = await select({
      message: stylePromptMessage("Which LLM provider would you like to use?"),
      options: [
        ...LLM_PROVIDERS.map((p) => ({ value: p.value, label: p.label, hint: p.keyHint })),
        { value: "skip", label: "Skip for now", hint: "Configure later" },
      ],
    });

    if (isCancel(providerChoice) || providerChoice === "skip") {
      return;
    }

    chosenProvider = LLM_PROVIDERS.find((p) => p.value === providerChoice);
    if (!chosenProvider) {return;}
  }

  // Resolve or prompt for the API key.
  const existingEnvKey = process.env[chosenProvider.envKey]?.trim();
  let apiKey: string | undefined = existingEnvKey;

  if (!apiKey) {
    const prompted = await password({
      message: stylePromptMessage(
        `${chosenProvider.label} API key (${chosenProvider.envKey})`,
      ),
    });
    if (isCancel(prompted) || !prompted || !prompted.trim()) {
      return;
    }
    apiKey = prompted.trim();
  }

  try {
    await runOpenClawOrThrow({
      openclawCommand: params.openclawCommand,
      args: ["--profile", params.profile, "config", "set", "gateway.provider", chosenProvider.value],
      timeoutMs: 10_000,
      errorMessage: "Failed to configure LLM gateway provider.",
    });
    await runOpenClawOrThrow({
      openclawCommand: params.openclawCommand,
      args: ["--profile", params.profile, "config", "set", "gateway.apiKey", apiKey],
      timeoutMs: 10_000,
      errorMessage: "Failed to configure LLM gateway API key.",
    });
    await runOpenClawOrThrow({
      openclawCommand: params.openclawCommand,
      args: [
        "--profile", params.profile,
        "config", "set",
        "agents.defaults.model.primary", chosenProvider.defaultModel,
      ],
      timeoutMs: 10_000,
      errorMessage: "Failed to set default LLM model.",
    });
    params.runtime.log(
      theme.muted(
        `${chosenProvider.label} configured (default model: ${chosenProvider.defaultModel}).`,
      ),
    );
  } catch (err) {
    params.runtime.log(
      theme.warn(
        `Failed to configure ${chosenProvider.label}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}

async function promptMediaGenerationKeys(params: {
  openclawCommand: string;
  profile: string;
  runtime: RuntimeEnv;
}): Promise<MediaKeyResult[]> {
  note(
    [
      "AnimClaw uses API keys for image, video, and 3D model generation.",
      "Select your preferred providers below, or skip to add them later via:",
      "  openclaw --profile animclaw config set media.apiKeys.<provider> <key>",
    ].join("\n"),
    "Media Generation API Keys",
  );

  const results: MediaKeyResult[] = [];
  const configuredKeys = new Set<string>();

  // Step 1: Image generation provider
  const imageChoice = await select({
    message: stylePromptMessage("Which image generation provider would you like to use?"),
    options: [
      ...IMAGE_PROVIDERS.map((p) => ({ value: p.envKey, label: p.label })),
      { value: "skip", label: "Skip for now" },
    ],
  });

  if (!isCancel(imageChoice) && imageChoice !== "skip") {
    const provider = IMAGE_PROVIDERS.find((p) => p.envKey === imageChoice);
    if (provider) {
      results.push(await persistMediaKey(params, provider, configuredKeys));
    }
  }

  // Step 2: Video generation provider
  const videoChoice = await select({
    message: stylePromptMessage("Which video generation provider would you like to use?"),
    options: [
      ...VIDEO_PROVIDERS.map((p) => ({ value: p.envKey, label: p.label })),
      { value: "skip", label: "Skip for now" },
    ],
  });

  if (!isCancel(videoChoice) && videoChoice !== "skip") {
    const provider = VIDEO_PROVIDERS.find((p) => p.envKey === videoChoice);
    if (provider) {
      results.push(await persistMediaKey(params, provider, configuredKeys));
    }
  }

  // Step 3: 3D modeling provider (for the 3D animation pipeline)
  const modelingChoice = await select({
    message: stylePromptMessage("Which 3D model generation provider would you like to use?"),
    options: [
      ...MODELING_PROVIDERS.map((p) => ({ value: p.envKey, label: p.label })),
      { value: "skip", label: "Skip for now" },
    ],
  });

  if (!isCancel(modelingChoice) && modelingChoice !== "skip") {
    const provider = MODELING_PROVIDERS.find((p) => p.envKey === modelingChoice);
    if (provider) {
      results.push(await persistMediaKey(params, provider, configuredKeys));
    }
  }

  return results;
}

async function runOpenClaw(
  openclawCommand: string,
  args: string[],
  timeoutMs: number,
  ioMode: "capture" | "inherit" = "capture",
  env?: NodeJS.ProcessEnv,
  onOutputLine?: OutputLineHandler,
): Promise<SpawnResult> {
  return await runCommandWithTimeout([openclawCommand, ...args], {
    timeoutMs,
    ioMode,
    env,
    onOutputLine,
  });
}

async function runOpenClawOrThrow(params: {
  openclawCommand: string;
  args: string[];
  timeoutMs: number;
  errorMessage: string;
}): Promise<SpawnResult> {
  const result = await runOpenClaw(params.openclawCommand, params.args, params.timeoutMs);
  if (result.code === 0) {
    return result;
  }
  const detail = firstNonEmptyLine(result.stderr, result.stdout);
  throw new Error(detail ? `${params.errorMessage}\n${detail}` : params.errorMessage);
}

/**
 * Runs an OpenClaw command attached to the current terminal.
 * Use this for interactive flows like `openclaw onboard`.
 */
/**
 * Returns true when every non-empty line in `stderr` is a known-benign plugin
 * load failure (e.g. the Telegram extension referencing an un-built source
 * file in the globally-installed openclaw package). These errors do not
 * indicate a real onboard failure — the wizard completes successfully before
 * they surface.
 */
export function isPluginLoadOnlyError(stderr: string): boolean {
  if (!stderr.trim()) return false;
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.every((line) =>
    /bundled plugin entry .* failed to open/.test(line) ||
    /ENOENT: no such file or directory/.test(line) ||
    /plugin root .* reason "path"/.test(line),
  );
}

/**
 * Run openclaw in interactive mode (stdin/stdout inherited so the user can
 * interact with prompts) while still capturing stderr so we can detect
 * known-benign plugin load errors (e.g. Telegram ENOENT) that should not
 * abort the bootstrap.
 */
async function runOpenClawInteractiveOrThrow(params: {
  openclawCommand: string;
  args: string[];
  timeoutMs: number;
  errorMessage: string;
  runtime?: RuntimeEnv;
}): Promise<SpawnResult> {
  const [command, ...args] = [params.openclawCommand, ...params.args];
  if (!command) {
    throw new Error(params.errorMessage);
  }

  const result = await new Promise<SpawnResult>((resolve, reject) => {
    // Inherit stdin + stdout so the user's interactive prompts work, but
    // pipe stderr so we can inspect it for known-benign errors.
    const child = spawn(resolveCommandForPlatform(command), args, {
      stdio: ["inherit", "inherit", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        child.kill("SIGKILL");
      }
    }, params.timeoutMs);

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      stderr += text;
      // Forward stderr to the terminal so the user still sees it.
      process.stderr.write(text);
    });

    child.once("error", (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: typeof code === "number" ? code : 1, stdout: "", stderr });
    });
  });

  if (result.code === 0) {
    return result;
  }

  // Non-zero exit: check whether the only errors are known-benign plugin load
  // failures that don't indicate a real onboard problem.
  if (isPluginLoadOnlyError(result.stderr)) {
    params.runtime?.log(
      theme.warn(
        "Warning: a bundled plugin failed to load (non-fatal). " +
        "Run `openclaw gateway restart` if you encounter issues.",
      ),
    );
    return result;
  }

  const detail = firstNonEmptyLine(result.stderr, result.stdout);
  throw new Error(detail ? `${params.errorMessage}\n${detail}` : params.errorMessage);
}

/**
 * Runs an openclaw sub-command with a visible spinner that streams progress
 * from the subprocess stdout/stderr into the spinner message.
 */
async function runOpenClawWithProgress(params: {
  openclawCommand: string;
  args: string[];
  timeoutMs: number;
  startMessage: string;
  successMessage: string;
  errorMessage: string;
}): Promise<SpawnResult> {
  const s = spinner();
  s.start(params.startMessage);

  const result = await new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(resolveCommandForPlatform(params.openclawCommand), params.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        child.kill("SIGKILL");
      }
    }, params.timeoutMs);

    const updateSpinner = (chunk: string) => {
      const line = chunk
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
      if (line) {
        s.message(line.length > 72 ? `${line.slice(0, 69)}...` : line);
      }
    };

    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      updateSpinner(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      updateSpinner(text);
    });
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ code: typeof code === "number" ? code : 1, stdout, stderr });
    });
  });

  if (result.code === 0) {
    s.stop(params.successMessage);
    return result;
  }

  const detail = firstNonEmptyLine(result.stderr, result.stdout);
  const stopMessage = detail ? `${params.errorMessage}: ${detail}` : params.errorMessage;
  s.stop(stopMessage);
  throw new Error(detail ? `${params.errorMessage}\n${detail}` : params.errorMessage);
}

function parseJsonPayload(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
}

function resolveOpenClawCliCheckCachePath(stateDir: string): string {
  return path.join(stateDir, "cache", OPENCLAW_CLI_CHECK_CACHE_FILE);
}

/**
 * Remove the persisted OpenClaw CLI install check cache so the next bootstrap
 * performs a fresh probe (`animclaw clean-cache`).
 */
export function clearOpenClawCliCheckCache(stateDir: string): { removed: boolean; path: string } {
  const cachePath = resolveOpenClawCliCheckCachePath(stateDir);
  if (!existsSync(cachePath)) {
    return { removed: false, path: cachePath };
  }
  try {
    unlinkSync(cachePath);
    return { removed: true, path: cachePath };
  } catch {
    return { removed: false, path: cachePath };
  }
}

function readOpenClawCliCheckCache(stateDir: string): OpenClawCliCheckCache | undefined {
  const cachePath = resolveOpenClawCliCheckCachePath(stateDir);
  if (!existsSync(cachePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf-8")) as Partial<OpenClawCliCheckCache>;
    if (
      typeof parsed.checkedAt !== "number" ||
      !Number.isFinite(parsed.checkedAt) ||
      typeof parsed.pathEnv !== "string" ||
      parsed.pathEnv !== (process.env.PATH ?? "") ||
      typeof parsed.available !== "boolean" ||
      !parsed.available ||
      typeof parsed.command !== "string" ||
      parsed.command.length === 0
    ) {
      return undefined;
    }
    const ageMs = Date.now() - parsed.checkedAt;
    if (ageMs < 0 || ageMs > OPENCLAW_CLI_CHECK_CACHE_TTL_MS) {
      return undefined;
    }
    const looksLikePath =
      parsed.command.includes(path.sep) ||
      parsed.command.includes("/") ||
      parsed.command.includes("\\");
    if (looksLikePath && !existsSync(parsed.command)) {
      return undefined;
    }
    return {
      checkedAt: parsed.checkedAt,
      pathEnv: parsed.pathEnv,
      available: parsed.available,
      command: parsed.command,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      globalBinDir: typeof parsed.globalBinDir === "string" ? parsed.globalBinDir : undefined,
      shellCommandPath:
        typeof parsed.shellCommandPath === "string" ? parsed.shellCommandPath : undefined,
      installedAt: typeof parsed.installedAt === "number" ? parsed.installedAt : undefined,
    };
  } catch {
    return undefined;
  }
}

function writeOpenClawCliCheckCache(
  stateDir: string,
  cache: Omit<OpenClawCliCheckCache, "checkedAt" | "pathEnv">,
): void {
  try {
    const cachePath = resolveOpenClawCliCheckCachePath(stateDir);
    mkdirSync(path.dirname(cachePath), { recursive: true });
    const payload: OpenClawCliCheckCache = {
      ...cache,
      checkedAt: Date.now(),
      pathEnv: process.env.PATH ?? "",
    };
    writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf-8");
  } catch {
    // Cache write failures should never block bootstrap.
  }
}

function createOpenClawSetupProgress(params: {
  enabled: boolean;
  totalStages: number;
}): OpenClawSetupProgress {
  if (!params.enabled || params.totalStages <= 0 || !process.stdout.isTTY) {
    const noop = () => undefined;
    return {
      startStage: noop,
      output: noop,
      completeStage: noop,
      finish: noop,
      fail: noop,
    };
  }

  const s = spinner();
  let completedStages = 0;
  let activeLabel = "";

  const renderBar = () => {
    const ratio = completedStages / params.totalStages;
    const filled = Math.max(
      0,
      Math.min(
        OPENCLAW_SETUP_PROGRESS_BAR_WIDTH,
        Math.round(ratio * OPENCLAW_SETUP_PROGRESS_BAR_WIDTH),
      ),
    );
    const bar = `${"#".repeat(filled)}${"-".repeat(OPENCLAW_SETUP_PROGRESS_BAR_WIDTH - filled)}`;
    return `[${bar}] ${completedStages}/${params.totalStages}`;
  };

  const truncate = (value: string, max = 84) =>
    value.length > max ? `${value.slice(0, max - 3)}...` : value;

  const renderStageLine = (detail?: string) => {
    const base = `${renderBar()} ${activeLabel}`.trim();
    if (!detail) {
      return base;
    }
    return truncate(`${base} -> ${detail}`);
  };

  return {
    startStage: (label: string) => {
      activeLabel = label;
      s.start(renderStageLine());
    },
    output: (line: string) => {
      if (!line) {
        return;
      }
      s.message(renderStageLine(line));
    },
    completeStage: (suffix?: string) => {
      completedStages = Math.min(params.totalStages, completedStages + 1);
      s.stop(renderStageLine(suffix ?? "done"));
    },
    finish: (message: string) => {
      completedStages = params.totalStages;
      s.stop(`${renderBar()} ${truncate(message)}`.trim());
    },
    fail: (message: string) => {
      s.stop(`${renderBar()} ${truncate(message)}`.trim());
    },
  };
}

/**
 * Returns a copy of `process.env` with `npm_config_*`, `npm_package_*`, and
 * npm lifecycle variables stripped. When animclaw is launched via `npx`, npm
 * injects environment variables (most critically `npm_config_prefix`) that
 * redirect `npm install -g` and `npm ls -g` to a temporary npx-managed
 * prefix instead of the user's real global npm directory. Stripping these
 * ensures child npm processes use the user's actual configuration.
 */
function cleanNpmGlobalEnv(): NodeJS.ProcessEnv {
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      key.startsWith("npm_config_") ||
      key.startsWith("npm_package_") ||
      key === "npm_lifecycle_event" ||
      key === "npm_lifecycle_script"
    ) {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

async function detectGlobalOpenClawInstall(
  onOutputLine?: OutputLineHandler,
): Promise<{ installed: boolean; version?: string }> {
  const result = await runCommandWithTimeout(
    ["npm", "ls", "-g", "openclaw", "--depth=0", "--json", "--silent"],
    {
      timeoutMs: 15_000,
      onOutputLine,
      env: cleanNpmGlobalEnv(),
    },
  ).catch(() => null);

  const parsed = parseJsonPayload(result?.stdout ?? result?.stderr);
  const dependencies = parsed?.dependencies as
    | Record<string, { version?: string } | undefined>
    | undefined;
  const installedVersion = dependencies?.openclaw?.version;
  if (typeof installedVersion === "string" && installedVersion.length > 0) {
    return { installed: true, version: installedVersion };
  }
  return { installed: false };
}

async function resolveNpmGlobalBinDir(
  onOutputLine?: OutputLineHandler,
): Promise<string | undefined> {
  const result = await runCommandWithTimeout(["npm", "prefix", "-g"], {
    timeoutMs: 8_000,
    env: cleanNpmGlobalEnv(),
    onOutputLine,
  }).catch(() => null);
  if (!result || result.code !== 0) {
    return undefined;
  }
  const prefix = firstNonEmptyLine(result.stdout);
  if (!prefix) {
    return undefined;
  }
  return process.platform === "win32" ? prefix : path.join(prefix, "bin");
}

function resolveGlobalOpenClawCommand(globalBinDir: string | undefined): string | undefined {
  if (!globalBinDir) {
    return undefined;
  }
  const candidates =
    process.platform === "win32"
      ? [path.join(globalBinDir, "openclaw.cmd"), path.join(globalBinDir, "openclaw.exe")]
      : [path.join(globalBinDir, "openclaw")];
  return candidates.find((candidate) => existsSync(candidate));
}

async function resolveShellOpenClawPath(
  onOutputLine?: OutputLineHandler,
): Promise<string | undefined> {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = await runCommandWithTimeout([locator, "openclaw"], {
    timeoutMs: 4_000,
    onOutputLine,
  }).catch(() => null);
  if (!result || result.code !== 0) {
    return undefined;
  }
  return firstNonEmptyLine(result.stdout);
}

function isProjectLocalOpenClawPath(commandPath: string | undefined): boolean {
  if (!commandPath) {
    return false;
  }
  const normalized = commandPath.replaceAll("\\", "/");
  return normalized.includes("/node_modules/.bin/openclaw");
}

function isBundledDesktopApp(): boolean {
  return (
    isTruthyEnvValue(process.env.ANIMCLAW_BUNDLED) &&
    typeof process.env.ANIMCLAW_VENDOR_BIN === "string" &&
    process.env.ANIMCLAW_VENDOR_BIN.length > 0
  );
}

async function ensureBundledOpenClaw(showProgress: boolean): Promise<OpenClawCliAvailability> {
  const vendorBin = process.env.ANIMCLAW_VENDOR_BIN!;
  const command = path.join(vendorBin, process.platform === "win32" ? "openclaw.cmd" : "openclaw");

  const progress = createOpenClawSetupProgress({ enabled: showProgress, totalStages: 1 });
  progress.startStage("Using bundled OpenClaw");

  const check = await runOpenClaw(command, ["--version"], 8_000).catch(() => null);
  const version = normalizeVersionOutput(check?.stdout || check?.stderr);

  if (check && check.code === 0) {
    progress.completeStage(version ? `bundled ${version}` : "bundled");
    return { available: true, installed: false, version, command };
  }

  // Fallback: try bare "openclaw" which should be on PATH from vendor-bin
  const fallback = await runOpenClaw("openclaw", ["--version"], 4_000).catch(() => null);
  const fallbackVersion = normalizeVersionOutput(fallback?.stdout || fallback?.stderr);
  if (fallback && fallback.code === 0) {
    progress.completeStage(fallbackVersion ? `path ${fallbackVersion}` : "path resolved");
    return { available: true, installed: false, version: fallbackVersion, command: "openclaw" };
  }

  progress.fail("Bundled OpenClaw not responding");
  return { available: false, installed: false, command };
}

async function ensureOpenClawCliAvailable(params: {
  stateDir: string;
  showProgress: boolean;
}): Promise<OpenClawCliAvailability> {
  if (isBundledDesktopApp()) {
    return ensureBundledOpenClaw(params.showProgress);
  }

  const cached = readOpenClawCliCheckCache(params.stateDir);
  if (cached) {
    const ageSeconds = Math.max(0, Math.floor((Date.now() - cached.checkedAt) / 1000));
    const progress = createOpenClawSetupProgress({
      enabled: params.showProgress,
      totalStages: 1,
    });
    progress.startStage("Reusing cached OpenClaw install check");
    progress.completeStage(`cache hit (${ageSeconds}s old)`);
    return {
      available: true,
      installed: false,
      installedAt: cached.installedAt,
      version: cached.version,
      command: cached.command,
      globalBinDir: cached.globalBinDir,
      shellCommandPath: cached.shellCommandPath,
    };
  }

  const progress = createOpenClawSetupProgress({
    enabled: params.showProgress,
    totalStages: 5,
  });
  progress.startStage("Checking global OpenClaw install");

  const globalBefore = await detectGlobalOpenClawInstall((line) => {
    progress.output(`npm ls: ${line}`);
  });
  progress.completeStage(
    globalBefore.installed ? `found ${globalBefore.version ?? "installed"}` : "missing",
  );

  let installed = false;
  let installedAt: number | undefined;
  progress.startStage("Ensuring openclaw@latest is installed globally");
  if (!globalBefore.installed) {
    const install = await runCommandWithTimeout(["npm", "install", "-g", "openclaw@latest"], {
      timeoutMs: 10 * 60_000,
      env: cleanNpmGlobalEnv(),
      onOutputLine: (line) => {
        progress.output(`npm install: ${line}`);
      },
    }).catch(() => null);
    if (!install || install.code !== 0) {
      progress.fail("OpenClaw global install failed.");
      return {
        available: false,
        installed: false,
        version: undefined,
        command: "openclaw",
      };
    }
    installed = true;
    installedAt = Date.now();
    progress.completeStage("installed openclaw@latest");
  } else {
    progress.completeStage("already installed; skipping install");
  }

  progress.startStage("Resolving global and shell OpenClaw paths");
  const [globalBinDir, shellCommandPath] = await Promise.all([
    resolveNpmGlobalBinDir((line) => {
      progress.output(`npm prefix: ${line}`);
    }),
    resolveShellOpenClawPath((line) => {
      progress.output(`${process.platform === "win32" ? "where" : "which"}: ${line}`);
    }),
  ]);
  progress.completeStage("path discovery complete");

  const globalAfter = installed ? { installed: true, version: globalBefore.version } : globalBefore;
  const globalCommand = resolveGlobalOpenClawCommand(globalBinDir);
  const command = globalCommand ?? "openclaw";
  progress.startStage("Verifying OpenClaw CLI responsiveness");
  const check = await runOpenClaw(command, ["--version"], 4_000, "capture", undefined, (line) => {
    progress.output(`openclaw --version: ${line}`);
  }).catch(() => null);
  progress.completeStage(
    check?.code === 0 ? "OpenClaw responded" : "OpenClaw version probe failed",
  );

  const version = normalizeVersionOutput(check?.stdout || check?.stderr || globalAfter.version);
  const available = Boolean(globalAfter.installed && check && check.code === 0);
  progress.startStage("Caching OpenClaw check result");
  if (available) {
    writeOpenClawCliCheckCache(params.stateDir, {
      available,
      command,
      version,
      globalBinDir,
      shellCommandPath,
      installedAt,
    });
    progress.completeStage(
      `saved (${Math.floor(OPENCLAW_CLI_CHECK_CACHE_TTL_MS / (60 * 60_000))}h TTL)`,
    );
  } else {
    progress.fail("OpenClaw CLI check failed (cache not written).");
  }

  return {
    available,
    installed,
    installedAt,
    version,
    command,
    globalBinDir,
    shellCommandPath,
  };
}

/**
 * Parses the number of pending device pairing requests from the JSON output
 * of `openclaw devices list --json`. Returns 0 if nothing pending is found.
 *
 * Handles several response shapes emitted by different OpenClaw releases:
 *   - root array:          [{ status: "pending", ... }]
 *   - top-level pending:   { pending: [{ id: "..." }] }
 *   - top-level devices:   { devices: [{ status: "pending", ... }] }
 *   - top-level requests:  { requests: [{ status: "pending", ... }] }
 */
export function parsePendingDeviceCount(raw: string): number {
  if (!raw?.trim()) return 0;
  try {
    const value: unknown = JSON.parse(raw.trim());

    const isPending = (item: unknown): boolean => {
      if (!item || typeof item !== "object") return false;
      const obj = item as Record<string, unknown>;
      return (
        obj.status === "pending" ||
        obj.state === "pending" ||
        obj.approved === false
      );
    };

    if (Array.isArray(value)) {
      return value.filter(isPending).length;
    }

    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.pending)) return obj.pending.length;
      if (Array.isArray(obj.devices)) return obj.devices.filter(isPending).length;
      if (Array.isArray(obj.requests)) return obj.requests.filter(isPending).length;
    }
  } catch {
    // Non-JSON output: look for "N pending" in plain text
    const match = /(\d+)\s+pending/i.exec(raw);
    if (match) return Number.parseInt(match[1], 10);
  }
  return 0;
}

/**
 * After `openclaw onboard`, the web runtime registers as a new device and its
 * pairing request may be left in "pending" state (common in OpenClaw ≥ 2026.4
 * which requires explicit device approval before granting operator.write).
 *
 * This function lists pending devices and, when exactly one is waiting,
 * approves it automatically. If multiple requests are pending it logs a
 * warning so the operator can resolve the ambiguity manually.
 */
async function tryAutoApproveDevicePairing(
  openclawCommand: string,
  profile: string,
  runtime: RuntimeEnv,
  showSpinner: boolean,
): Promise<{ attempted: boolean; approved: boolean; skippedReason?: string }> {
  const s = showSpinner ? spinner() : null;
  try {
    s?.start("Checking for pending device pairing requests…");

    const listResult = await runOpenClaw(
      openclawCommand,
      ["--profile", profile, "devices", "list", "--json"],
      15_000,
    ).catch(() => null);

    if (!listResult || listResult.code !== 0) {
      s?.stop(theme.muted("Device pairing check skipped (devices list unavailable)."));
      return { attempted: false, approved: false, skippedReason: "devices list failed" };
    }

    const pendingCount = parsePendingDeviceCount(listResult.stdout);

    if (pendingCount === 0) {
      s?.stop(theme.muted("No pending device pairing requests."));
      return { attempted: false, approved: false, skippedReason: "none pending" };
    }

    if (pendingCount > 1) {
      s?.stop(
        theme.warn(
          `${pendingCount} pending device pairing requests found. ` +
            `Review and approve manually: openclaw --profile ${profile} devices list`,
        ),
      );
      return {
        attempted: false,
        approved: false,
        skippedReason: "multiple pending — manual approval required",
      };
    }

    // Exactly one pending request — safe to auto-approve.
    s?.message("Approving pending device pairing request…");
    const approveResult = await runOpenClaw(
      openclawCommand,
      ["--profile", profile, "devices", "approve", "--latest"],
      15_000,
    ).catch(() => null);

    if (!approveResult || approveResult.code !== 0) {
      const detail = firstNonEmptyLine(approveResult?.stderr, approveResult?.stdout);
      s?.stop(
        theme.warn(`Device pairing auto-approve failed${detail ? `: ${detail}` : ""}.`),
      );
      return { attempted: true, approved: false, skippedReason: detail ?? "approve command failed" };
    }

    s?.stop(theme.muted("Device pairing approved — web runtime will connect with full operator scope."));
    return { attempted: true, approved: true };
  } catch (err) {
    s?.stop(theme.muted("Device pairing check failed (non-fatal)."));
    runtime.log(
      theme.muted(
        `Device pairing auto-approve error (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return { attempted: false, approved: false, skippedReason: "unexpected error" };
  }
}

async function probeGateway(
  openclawCommand: string,
  profile: string,
  gatewayPort?: number,
): Promise<{ ok: boolean; detail?: string }> {
  const env = gatewayPort
    ? { ...process.env, OPENCLAW_GATEWAY_PORT: String(gatewayPort) }
    : undefined;
  const result = await runOpenClaw(
    openclawCommand,
    ["--profile", profile, "health", "--json"],
    12_000,
    "capture",
    env,
  ).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 1,
      stdout: "",
      stderr: message,
    } as SpawnResult;
  });
  if (result.code === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    detail: firstNonEmptyLine(result.stderr, result.stdout),
  };
}

function readLogTail(logPath: string, maxLines = 16): string | undefined {
  if (!existsSync(logPath)) {
    return undefined;
  }
  try {
    const lines = readFileSync(logPath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return undefined;
    }
    return lines.slice(-maxLines).join("\n");
  } catch {
    return undefined;
  }
}

function resolveLatestRuntimeLogPath(): string | undefined {
  const runtimeLogDir = "/tmp/openclaw";
  if (!existsSync(runtimeLogDir)) {
    return undefined;
  }
  try {
    const files = readdirSync(runtimeLogDir)
      .filter((name) => /^openclaw-.*\.log$/u.test(name))
      .toSorted((a, b) => b.localeCompare(a));
    if (files.length === 0) {
      return undefined;
    }
    return path.join(runtimeLogDir, files[0]);
  } catch {
    return undefined;
  }
}

function collectGatewayLogExcerpts(stateDir: string): GatewayLogExcerpt[] {
  const candidates = [
    path.join(stateDir, "logs", "gateway.err.log"),
    path.join(stateDir, "logs", "gateway.log"),
    resolveLatestRuntimeLogPath(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const excerpts: GatewayLogExcerpt[] = [];
  for (const candidate of candidates) {
    const excerpt = readLogTail(candidate);
    if (!excerpt) {
      continue;
    }
    excerpts.push({ path: candidate, excerpt });
  }
  return excerpts;
}

function deriveGatewayFailureSummary(
  probeDetail: string | undefined,
  excerpts: GatewayLogExcerpt[],
): string | undefined {
  const combinedLines = excerpts.flatMap((entry) => entry.excerpt.split(/\r?\n/));
  const signalRegex =
    /(cannot find module|plugin not found|invalid config|unauthorized|token mismatch|device token mismatch|device signature invalid|device signature expired|device-signature|eaddrinuse|address already in use|error:|failed to|failovererror)/iu;
  const likely = [...combinedLines].toReversed().find((line) => signalRegex.test(line));
  if (likely) {
    return likely.length > 220 ? `${likely.slice(0, 217)}...` : likely;
  }
  return probeDetail;
}

async function attemptGatewayAutoFix(params: {
  openclawCommand: string;
  profile: string;
  stateDir: string;
  gatewayPort: number;
}): Promise<GatewayAutoFixResult> {
  const steps: GatewayAutoFixStep[] = [];
  const commands: Array<{
    name: string;
    args: string[];
    timeoutMs: number;
  }> = [
    {
      name: "openclaw gateway stop",
      args: ["--profile", params.profile, "gateway", "stop"],
      timeoutMs: 90_000,
    },
    {
      name: "openclaw doctor --fix",
      args: ["--profile", params.profile, "doctor", "--fix"],
      timeoutMs: 2 * 60_000,
    },
    {
      name: "openclaw gateway install --force",
      // Note: gateway port is already persisted in openclaw.json by ensureGatewayPort.
      // The `gateway install` subcommand does not accept a --port flag.
      args: ["--profile", params.profile, "gateway", "install", "--force"],
      timeoutMs: 2 * 60_000,
    },
    {
      name: "openclaw gateway start",
      // Note: `gateway start` does not accept a --port flag; port comes from config.
      args: ["--profile", params.profile, "gateway", "start"],
      timeoutMs: 2 * 60_000,
    },
  ];

  for (const command of commands) {
    const result = await runOpenClaw(params.openclawCommand, command.args, command.timeoutMs).catch(
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        return {
          code: 1,
          stdout: "",
          stderr: message,
        } as SpawnResult;
      },
    );
    steps.push({
      name: command.name,
      ok: result.code === 0,
      detail: result.code === 0 ? undefined : firstNonEmptyLine(result.stderr, result.stdout),
    });
  }

  let finalProbe = await probeGateway(params.openclawCommand, params.profile, params.gatewayPort);
  for (let attempt = 0; attempt < 2 && !finalProbe.ok; attempt += 1) {
    await sleep(1_200);
    finalProbe = await probeGateway(params.openclawCommand, params.profile, params.gatewayPort);
  }

  const logExcerpts = finalProbe.ok ? [] : collectGatewayLogExcerpts(params.stateDir);
  const failureSummary = finalProbe.ok
    ? undefined
    : deriveGatewayFailureSummary(finalProbe.detail, logExcerpts);

  return {
    attempted: true,
    recovered: finalProbe.ok,
    steps,
    finalProbe,
    failureSummary,
    logExcerpts,
  };
}

async function openUrl(url: string): Promise<boolean> {
  const argv =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  const result = await runCommandWithTimeout(argv, { timeoutMs: 5_000 }).catch(() => null);
  return Boolean(result && result.code === 0);
}

function remediationForGatewayFailure(
  detail: string | undefined,
  port: number,
  profile: string,
): string {
  const normalized = detail?.toLowerCase() ?? "";
  const isDeviceAuthMismatch =
    normalized.includes("device token mismatch") ||
    normalized.includes("device signature invalid") ||
    normalized.includes("device signature expired") ||
    normalized.includes("device-signature");
  if (isDeviceAuthMismatch) {
    return [
      `Gateway device-auth mismatch detected. Re-run \`openclaw --profile ${profile} onboard --install-daemon --reset\`.`,
      `Last resort (security downgrade): \`openclaw --profile ${profile} config set gateway.controlUi.dangerouslyDisableDeviceAuth true\`. Revert after recovery: \`openclaw --profile ${profile} config set gateway.controlUi.dangerouslyDisableDeviceAuth false\`.`,
    ].join(" ");
  }
  if (
    normalized.includes("unauthorized") ||
    normalized.includes("token") ||
    normalized.includes("password")
  ) {
    return `Gateway auth mismatch detected. Re-run \`openclaw --profile ${profile} onboard --install-daemon --reset\`.`;
  }
  if (normalized.includes("address already in use") || normalized.includes("eaddrinuse")) {
    return `Port ${port} is busy. The bootstrap will auto-assign an available port, or you can explicitly specify one with \`--gateway-port <port>\`.`;
  }
  return `Run \`openclaw --profile ${profile} doctor --fix\` and retry \`npx animclaw bootstrap\`.`;
}

function remediationForWebUiFailure(port: number): string {
  return [
    `Web UI did not respond on ${port}.`,
    `Run \`npx animclaw update --web-port ${port}\` to refresh the managed web runtime.`,
    `If the port is stuck, run \`npx animclaw stop --web-port ${port}\` first.`,
  ].join(" ");
}

function describeWorkspaceSeedResult(result: WorkspaceSeedResult): string {
  if (result.seeded) {
    return `seeded ${result.dbPath}`;
  }
  if (result.reason === "already-exists") {
    return `skipped; existing database found at ${result.dbPath}`;
  }
  if (result.reason === "seed-asset-missing") {
    return `skipped; seed asset missing at ${result.seedDbPath}`;
  }
  if (result.reason === "copy-failed") {
    return `failed to copy seed database: ${result.error ?? "unknown error"}`;
  }
  return `skipped; reason=${result.reason}`;
}

function createCheck(
  id: BootstrapCheck["id"],
  status: BootstrapCheckStatus,
  detail: string,
  remediation?: string,
): BootstrapCheck {
  return { id, status, detail, remediation };
}

/**
 * Load OpenClaw profile config from state dir.
 * Supports both openclaw.json (current) and config.json (legacy).
 */
function readBootstrapConfig(stateDir: string): Record<string, unknown> | undefined {
  for (const name of ["openclaw.json", "config.json"]) {
    const configPath = path.join(stateDir, name);
    if (!existsSync(configPath)) {
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      if (raw && typeof raw === "object") {
        return raw as Record<string, unknown>;
      }
    } catch {
      // Config unreadable; skip.
    }
  }
  return undefined;
}

function resolveBootstrapWorkspaceDir(stateDir: string): string {
  return path.join(stateDir, "workspace");
}

/**
 * Resolve the model provider prefix from the config's primary model string.
 * e.g. "vercel-ai-gateway/anthropic/claude-opus-4.6" → "vercel-ai-gateway"
 */
function resolveModelProvider(stateDir: string): string | undefined {
  const raw = readBootstrapConfig(stateDir);
  const model = (raw as { agents?: { defaults?: { model?: { primary?: string } | string } } })
    ?.agents?.defaults?.model;
  const modelName = typeof model === "string" ? model : model?.primary;
  if (typeof modelName === "string" && modelName.includes("/")) {
    return modelName.split("/")[0];
  }
  return undefined;
}

/**
 * Check if the agent auth store has at least one key for the given provider.
 */
export function checkAgentAuth(
  stateDir: string,
  provider: string | undefined,
): { ok: boolean; provider?: string; detail: string } {
  if (!provider) {
    return { ok: false, detail: "No model provider configured." };
  }
  const authPath = path.join(stateDir, "agents", "main", "agent", "auth-profiles.json");
  if (!existsSync(authPath)) {
    return {
      ok: false,
      provider,
      detail: `No auth-profiles.json found for agent (expected at ${authPath}).`,
    };
  }
  try {
    const raw = JSON.parse(readFileSync(authPath, "utf-8"));
    const profiles = raw?.profiles;
    if (!profiles || typeof profiles !== "object") {
      return { ok: false, provider, detail: `auth-profiles.json has no profiles configured.` };
    }
    const hasKey = Object.values(profiles).some(
      (p: unknown) =>
        p &&
        typeof p === "object" &&
        (p as Record<string, unknown>).provider === provider &&
        typeof (p as Record<string, unknown>).key === "string" &&
        ((p as Record<string, unknown>).key as string).length > 0,
    );
    if (!hasKey) {
      return {
        ok: false,
        provider,
        detail: `No API key for provider "${provider}" in agent auth store.`,
      };
    }
    return { ok: true, provider, detail: `API key configured for ${provider}.` };
  } catch {
    return { ok: false, provider, detail: `Failed to read auth-profiles.json.` };
  }
}

export function buildBootstrapDiagnostics(params: {
  profile: string;
  openClawCliAvailable: boolean;
  openClawVersion?: string;
  gatewayPort: number;
  gatewayUrl: string;
  gatewayProbe: { ok: boolean; detail?: string };
  webPort: number;
  webReachable: boolean;
  rolloutStage: BootstrapRolloutStage;
  legacyFallbackEnabled: boolean;
  stateDir?: string;
  env?: NodeJS.ProcessEnv;
  posthogPluginInstalled?: boolean;
}): BootstrapDiagnostics {
  const env = params.env ?? process.env;
  const checks: BootstrapCheck[] = [];

  if (params.openClawCliAvailable) {
    checks.push(
      createCheck(
        "openclaw-cli",
        "pass",
        `OpenClaw CLI detected${params.openClawVersion ? ` (${params.openClawVersion})` : ""}.`,
      ),
    );
  } else {
    checks.push(
      createCheck(
        "openclaw-cli",
        "fail",
        "OpenClaw CLI is missing.",
        "Install OpenClaw globally once: `npm install -g openclaw`.",
      ),
    );
  }

  if (params.profile === DEFAULT_DENCHCLAW_PROFILE) {
    checks.push(createCheck("profile", "pass", `Profile pinned: ${params.profile}.`));
  } else {
    checks.push(
      createCheck(
        "profile",
        "fail",
        `AnimClaw profile drift detected (${params.profile}).`,
        `AnimClaw requires \`--profile ${DEFAULT_DENCHCLAW_PROFILE}\`. Re-run bootstrap to repair environment defaults.`,
      ),
    );
  }

  if (params.gatewayProbe.ok) {
    checks.push(createCheck("gateway", "pass", `Gateway reachable at ${params.gatewayUrl}.`));
  } else {
    checks.push(
      createCheck(
        "gateway",
        "fail",
        `Gateway probe failed at ${params.gatewayUrl}${params.gatewayProbe.detail ? ` (${params.gatewayProbe.detail})` : ""}.`,
        remediationForGatewayFailure(
          params.gatewayProbe.detail,
          params.gatewayPort,
          params.profile,
        ),
      ),
    );
  }

  const stateDir = params.stateDir ?? resolveProfileStateDir(params.profile, env);
  const modelProvider = resolveModelProvider(stateDir);
  const authCheck = checkAgentAuth(stateDir, modelProvider);
  if (authCheck.ok) {
    checks.push(createCheck("agent-auth", "pass", authCheck.detail));
  } else {
    checks.push(
      createCheck(
        "agent-auth",
        "fail",
        authCheck.detail,
        `Run \`openclaw --profile ${DEFAULT_DENCHCLAW_PROFILE} onboard --install-daemon\` to configure API keys.`,
      ),
    );
  }

  if (params.webReachable) {
    checks.push(createCheck("web-ui", "pass", `Web UI reachable on port ${params.webPort}.`));
  } else {
    checks.push(
      createCheck(
        "web-ui",
        "fail",
        `Web UI is not reachable on port ${params.webPort}.`,
        remediationForWebUiFailure(params.webPort),
      ),
    );
  }

  const expectedStateDir = resolveProfileStateDir(DEFAULT_DENCHCLAW_PROFILE, env);
  const usesPinnedStateDir = path.resolve(stateDir) === path.resolve(expectedStateDir);
  if (usesPinnedStateDir) {
    checks.push(createCheck("state-isolation", "pass", `State dir pinned: ${stateDir}.`));
  } else {
    checks.push(
      createCheck(
        "state-isolation",
        "fail",
        `Unexpected state dir: ${stateDir}.`,
        `AnimClaw requires \`${expectedStateDir}\`. Re-run bootstrap to restore pinned defaults.`,
      ),
    );
  }

  const launchAgentLabel = resolveGatewayLaunchAgentLabel(params.profile);
  const expectedLaunchAgentLabel = resolveGatewayLaunchAgentLabel(DEFAULT_DENCHCLAW_PROFILE);
  if (launchAgentLabel === expectedLaunchAgentLabel) {
    checks.push(createCheck("daemon-label", "pass", `Gateway service label: ${launchAgentLabel}.`));
  } else {
    checks.push(
      createCheck(
        "daemon-label",
        "fail",
        `Gateway service label mismatch (${launchAgentLabel}).`,
        `AnimClaw requires launch agent label ${expectedLaunchAgentLabel}.`,
      ),
    );
  }

  checks.push(
    createCheck(
      "rollout-stage",
      params.rolloutStage === "default" ? "pass" : "warn",
      `Bootstrap rollout stage: ${params.rolloutStage}${params.legacyFallbackEnabled ? " (legacy fallback enabled)" : ""}.`,
      params.rolloutStage === "beta"
        ? "Enable beta cutover by setting ANIMCLAW_BOOTSTRAP_BETA_OPT_IN=1."
        : undefined,
    ),
  );

  const migrationSuiteOk = isTruthyEnvValue(env.ANIMCLAW_BOOTSTRAP_MIGRATION_SUITE_OK);
  const onboardingE2EOk = isTruthyEnvValue(env.ANIMCLAW_BOOTSTRAP_ONBOARDING_E2E_OK);
  const enforceCutoverGates = isTruthyEnvValue(env.ANIMCLAW_BOOTSTRAP_ENFORCE_SAFETY_GATES);
  const cutoverGatePassed = migrationSuiteOk && onboardingE2EOk;
  checks.push(
    createCheck(
      "cutover-gates",
      cutoverGatePassed ? "pass" : enforceCutoverGates ? "fail" : "warn",
      `Cutover gate: migrationSuite=${migrationSuiteOk ? "pass" : "missing"}, onboardingE2E=${onboardingE2EOk ? "pass" : "missing"}.`,
      cutoverGatePassed
        ? undefined
        : "Run migration contracts + onboarding E2E and set ANIMCLAW_BOOTSTRAP_MIGRATION_SUITE_OK=1 and ANIMCLAW_BOOTSTRAP_ONBOARDING_E2E_OK=1 before full cutover.",
    ),
  );

  if (params.posthogPluginInstalled != null) {
    checks.push(
      createCheck(
        "posthog-analytics",
        params.posthogPluginInstalled ? "pass" : "warn",
        params.posthogPluginInstalled
          ? "PostHog analytics plugin installed."
          : "PostHog analytics plugin not installed (POSTHOG_KEY missing or extension not bundled).",
      ),
    );
  }

  return {
    rolloutStage: params.rolloutStage,
    legacyFallbackEnabled: params.legacyFallbackEnabled,
    checks,
    hasFailures: checks.some((check) => check.status === "fail"),
  };
}

function formatCheckStatus(status: BootstrapCheckStatus): string {
  if (status === "pass") {
    return theme.success("[ok]");
  }
  if (status === "warn") {
    return theme.warn("[warn]");
  }
  return theme.error("[fail]");
}

function logBootstrapChecklist(diagnostics: BootstrapDiagnostics, runtime: RuntimeEnv) {
  runtime.log("");
  runtime.log(theme.heading("Bootstrap checklist"));
  for (const check of diagnostics.checks) {
    runtime.log(`${formatCheckStatus(check.status)} ${check.detail}`);
    if (check.status !== "pass" && check.remediation) {
      runtime.log(theme.muted(`       remediation: ${check.remediation}`));
    }
  }
}

async function shouldRunUpdate(params: {
  opts: BootstrapOptions;
  runtime: RuntimeEnv;
  installResult: OpenClawCliAvailability;
}): Promise<boolean> {
  if (params.opts.updateNow) {
    return true;
  }
  if (
    params.opts.skipUpdate ||
    params.opts.nonInteractive ||
    params.opts.json ||
    !process.stdin.isTTY
  ) {
    return false;
  }
  const installedRecently =
    params.installResult.installed ||
    (typeof params.installResult.installedAt === "number" &&
      Date.now() - params.installResult.installedAt <=
        OPENCLAW_UPDATE_PROMPT_SUPPRESS_AFTER_INSTALL_MS);
  if (installedRecently) {
    params.runtime.log(
      theme.muted("Skipping update prompt because OpenClaw was installed moments ago."),
    );
    return false;
  }
  const decision = await confirm({
    message: stylePromptMessage("Check and install OpenClaw updates now?"),
    initialValue: false,
  });
  if (isCancel(decision)) {
    params.runtime.log(theme.muted("Update check skipped."));
    return false;
  }
  return Boolean(decision);
}

export async function bootstrapCommand(
  opts: BootstrapOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<BootstrapSummary> {
  const nonInteractive = Boolean(opts.nonInteractive || opts.json);
  const rolloutStage = resolveBootstrapRolloutStage();
  const legacyFallbackEnabled = isLegacyFallbackEnabled();
  const appliedProfile = applyCliProfileEnv({ profile: opts.profile });
  const profile = appliedProfile.effectiveProfile;
  const stateDir = resolveProfileStateDir(profile);
  const workspaceDir = resolveBootstrapWorkspaceDir(stateDir);
  if (appliedProfile.warning && !opts.json) {
    runtime.log(theme.warn(appliedProfile.warning));
  }

  const bootstrapStartTime = Date.now();

  if (!opts.json) {
    const telemetryCfg = readTelemetryConfig();
    if (!telemetryCfg.noticeShown) {
      runtime.log(
        theme.muted(
          "AnimClaw collects anonymous telemetry to improve the product.\n" +
            "No personal data is ever collected. Disable anytime:\n" +
            "  npx animclaw telemetry disable\n" +
            "  ANIMCLAW_TELEMETRY_DISABLED=1\n" +
            "  DO_NOT_TRACK=1\n" +
            "Learn more: https://github.com/AnimClaw/AnimClaw/blob/main/TELEMETRY.md\n",
        ),
      );
      markNoticeShown();
    }
  }

  track("cli_bootstrap_started", { version: VERSION });

  const installResult = await ensureOpenClawCliAvailable({
    stateDir,
    showProgress: !opts.json,
  });
  if (!installResult.available) {
    throw new Error(
      [
        "OpenClaw CLI is required but unavailable.",
        "Install it with: npm install -g openclaw",
        installResult.globalBinDir
          ? `Expected global binary directory: ${installResult.globalBinDir}`
          : "",
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    );
  }
  const openclawCommand = installResult.command;

  if (await shouldRunUpdate({ opts, runtime, installResult })) {
    await runOpenClawWithProgress({
      openclawCommand,
      args: ["update", "--yes"],
      timeoutMs: 8 * 60_000,
      startMessage: "Checking for OpenClaw updates...",
      successMessage: "OpenClaw is up to date.",
      errorMessage: "OpenClaw update failed",
    });
  }

  // Determine gateway port: use explicit override, honour previously persisted
  // port, or find an available one in the AnimClaw range (19001+).
  // NEVER claim OpenClaw's default port (18789) — that belongs to the host
  // OpenClaw installation and sharing it causes port-hijack on restart.
  const explicitPort = parseOptionalPort(opts.gatewayPort);
  let gatewayPort: number;
  let portAutoAssigned = false;

  if (explicitPort) {
    gatewayPort = explicitPort;
  } else {
    const existingPort = readExistingGatewayPort(stateDir);
    if (isPersistedPortAcceptable(existingPort) && (await isPortAvailable(existingPort))) {
      gatewayPort = existingPort;
    } else if (await isPortAvailable(DENCHCLAW_GATEWAY_PORT_START)) {
      gatewayPort = DENCHCLAW_GATEWAY_PORT_START;
    } else {
      const availablePort = await findAvailablePort(
        DENCHCLAW_GATEWAY_PORT_START + 1,
        MAX_PORT_SCAN_ATTEMPTS,
      );
      if (!availablePort) {
        throw new Error(
          `Could not find an available gateway port between ${DENCHCLAW_GATEWAY_PORT_START} and ${DENCHCLAW_GATEWAY_PORT_START + MAX_PORT_SCAN_ATTEMPTS}. ` +
            `Please specify a port explicitly with --gateway-port.`,
        );
      }
      gatewayPort = availablePort;
      portAutoAssigned = true;
    }
  }

  if (portAutoAssigned && !opts.json) {
    runtime.log(
      theme.muted(
        `Default gateway port ${DENCHCLAW_GATEWAY_PORT_START} is in use. Using auto-assigned port ${gatewayPort}.`,
      ),
    );
  }

  // Pin OpenClaw to the managed default workspace before onboarding so bootstrap
  // never drifts into creating/using legacy workspace-* paths.
  await ensureDefaultWorkspacePath(openclawCommand, profile, workspaceDir);

  // ── Animclaw AI Gateway option ──────────────────────────────────────
  // In desktop mode (ANIMCLAW_BUNDLED), the gateway key is auto-configured
  // on login — skip the manual prompt entirely.
  let useAnimclawGateway = false;
  const isBundledDesktop = process.env.ANIMCLAW_BUNDLED === "1";

  if (isBundledDesktop) {
    useAnimclawGateway = true;
    runtime.log(
      theme.muted("Animclaw AI Gateway auto-configured by desktop app."),
    );
  } else if (!nonInteractive && !opts.json && process.stdin.isTTY) {
    const gatewayChoice = await select({
      message: stylePromptMessage("How would you like to connect to AI models?"),
      options: [
        {
          value: "animclaw-gateway",
          label: "Animclaw AI Gateway (recommended)",
          hint: "One API key, auto-configured when you sign in",
        },
        {
          value: "own-keys",
          label: "Use my own provider API keys",
          hint: "Configure OpenAI / Anthropic keys directly",
        },
      ],
    });

    if (isCancel(gatewayChoice)) {
      throw new Error("Bootstrap cancelled.");
    }

    useAnimclawGateway = gatewayChoice === "animclaw-gateway";

    if (useAnimclawGateway) {
      const gatewayApiKey = await password({
        message: stylePromptMessage(
          "Enter your Animclaw API key (starts with ac_).\n" +
          "  Get one at https://animclaw.com/dashboard/api",
        ),
        validate(value) {
          if (!value || !value.startsWith("ac_")) {
            return "API key must start with ac_";
          }
        },
      });

      if (isCancel(gatewayApiKey)) {
        throw new Error("Bootstrap cancelled.");
      }

      const animclawGatewayUrl = process.env.ANIMCLAW_GATEWAY_URL || "https://animclaw.com";

      await runOpenClawOrThrow({
        openclawCommand,
        args: [
          "--profile", profile,
          "config", "set", "gateway.provider", "openai-compatible",
        ],
        timeoutMs: 10_000,
        errorMessage: "Failed to configure gateway provider.",
      });
      await runOpenClawOrThrow({
        openclawCommand,
        args: [
          "--profile", profile,
          "config", "set", "gateway.baseUrl", `${animclawGatewayUrl}/api/v1`,
        ],
        timeoutMs: 10_000,
        errorMessage: "Failed to configure gateway base URL.",
      });
      await runOpenClawOrThrow({
        openclawCommand,
        args: [
          "--profile", profile,
          "config", "set", "gateway.apiKey", gatewayApiKey as string,
        ],
        timeoutMs: 10_000,
        errorMessage: "Failed to configure gateway API key.",
      });

      runtime.log(
        theme.muted("Animclaw AI Gateway configured."),
      );
    }
  }

  let mediaKeyResults: MediaKeyResult[] | undefined;
  if (!useAnimclawGateway && !nonInteractive && !opts.json && process.stdin.isTTY) {
    // First configure the LLM provider (chat/agent backbone), then media keys.
    await promptLlmProviderKey({ openclawCommand, profile, runtime });

    mediaKeyResults = await promptMediaGenerationKeys({
      openclawCommand,
      profile,
      runtime,
    });
    const configuredCount = mediaKeyResults.filter((r) => r.configured).length;
    if (configuredCount > 0) {
      runtime.log(
        theme.muted(
          `Configured ${configuredCount} media generation API key${configuredCount === 1 ? "" : "s"}.`,
        ),
      );
    }
  }

  const packageRoot = resolveCliPackageRoot();

  // Install bundled plugins BEFORE onboard so the gateway daemon starts with
  // plugins.allow already configured, suppressing "plugins.allow is empty" warnings.
  const posthogPluginInstalled = await installBundledPlugins({
    openclawCommand,
    profile,
    stateDir,
    posthogKey: process.env.POSTHOG_KEY || "",
  });

  const onboardArgv = [
    "--profile",
    profile,
    "onboard",
    "--install-daemon",
    "--gateway-bind",
    "loopback",
    "--gateway-port",
    String(gatewayPort),
  ];
  if (opts.forceOnboard) {
    onboardArgv.push("--reset");
  }
  if (nonInteractive) {
    onboardArgv.push("--non-interactive");
  }

  onboardArgv.push("--accept-risk", "--skip-ui");

  if (nonInteractive) {
    await runOpenClawOrThrow({
      openclawCommand,
      args: onboardArgv,
      timeoutMs: 12 * 60_000,
      errorMessage: "OpenClaw onboarding failed.",
    });
  } else {
    await runOpenClawInteractiveOrThrow({
      openclawCommand,
      args: onboardArgv,
      timeoutMs: 12 * 60_000,
      errorMessage: "OpenClaw onboarding failed.",
      runtime,
    });
  }

  // After onboarding, the web runtime registers as a new device. Auto-approve
  // a single pending pairing request so it gets operator.write immediately.
  await tryAutoApproveDevicePairing(openclawCommand, profile, runtime, !opts.json);

  const workspaceSeed = seedWorkspaceFromAssets({
    workspaceDir,
    packageRoot,
  });

  const postOnboardSpinner = !opts.json ? spinner() : null;
  postOnboardSpinner?.start("Finalizing configuration…");

  // Ensure gateway.mode=local so the gateway never drifts to remote mode.
  // Keep this post-onboard so we normalize any wizard defaults.
  await ensureGatewayModeLocal(openclawCommand, profile);
  postOnboardSpinner?.message("Configuring gateway port…");
  // Persist the assigned port so all runtime clients (including web) resolve
  // the same gateway target on subsequent requests.
  await ensureGatewayPort(openclawCommand, profile, gatewayPort);
  postOnboardSpinner?.message("Setting tools profile…");
  // AnimClaw requires the full tool profile; onboarding defaults can drift to
  // messaging-only, so enforce this on every bootstrap run.
  await ensureToolsProfile(openclawCommand, profile);

  postOnboardSpinner?.message("Configuring subagent defaults…");
  await ensureSubagentDefaults(openclawCommand, profile);

  postOnboardSpinner?.message("Probing gateway health…");
  let gatewayProbe = await probeGateway(openclawCommand, profile, gatewayPort);
  let gatewayAutoFix: GatewayAutoFixResult | undefined;
  if (!gatewayProbe.ok) {
    postOnboardSpinner?.message("Gateway unreachable, attempting auto-fix…");
    gatewayAutoFix = await attemptGatewayAutoFix({
      openclawCommand,
      profile,
      stateDir,
      gatewayPort,
    });
    gatewayProbe = gatewayAutoFix.finalProbe;
    if (!gatewayProbe.ok && gatewayAutoFix.failureSummary) {
      gatewayProbe = {
        ...gatewayProbe,
        detail: [gatewayProbe.detail, gatewayAutoFix.failureSummary]
          .filter((value, index, self) => value && self.indexOf(value) === index)
          .join(" | "),
      };
    }
  }
  const gatewayUrl = `ws://127.0.0.1:${gatewayPort}`;
  const preferredWebPort = parseOptionalPort(opts.webPort) ?? DEFAULT_WEB_APP_PORT;
  postOnboardSpinner?.message(`Starting web runtime on port ${preferredWebPort}…`);
  const webRuntimeStatus = await ensureManagedWebRuntime({
    stateDir,
    packageRoot,
    denchVersion: VERSION,
    port: preferredWebPort,
    gatewayPort,
  });
  postOnboardSpinner?.stop(
    webRuntimeStatus.ready
      ? "Post-onboard setup complete."
      : "Post-onboard setup complete (web runtime unhealthy).",
  );
  const webReachable = webRuntimeStatus.ready;
  const webUrl = `http://localhost:${preferredWebPort}`;
  const diagnostics = buildBootstrapDiagnostics({
    profile,
    openClawCliAvailable: installResult.available,
    openClawVersion: installResult.version,
    gatewayPort,
    gatewayUrl,
    gatewayProbe,
    webPort: preferredWebPort,
    webReachable,
    rolloutStage,
    legacyFallbackEnabled,
    stateDir,
    posthogPluginInstalled,
  });

  let opened = false;
  let openAttempted = false;
  if (!opts.noOpen && !opts.json && webReachable) {
    if (nonInteractive) {
      openAttempted = true;
      opened = await openUrl(webUrl);
    } else {
      const wantOpen = await confirm({
        message: stylePromptMessage(`Open ${webUrl} in your browser?`),
        initialValue: true,
      });
      if (!isCancel(wantOpen) && wantOpen) {
        openAttempted = true;
        opened = await openUrl(webUrl);
      }
    }
  }

  if (!opts.json) {
    if (!webRuntimeStatus.ready) {
      runtime.log(theme.warn(`Managed web runtime check failed: ${webRuntimeStatus.reason}`));
    }
    if (installResult.installed) {
      runtime.log(theme.muted("Installed global OpenClaw CLI via npm."));
    }
    if (isProjectLocalOpenClawPath(installResult.shellCommandPath)) {
      runtime.log(
        theme.warn(
          `\`openclaw\` currently resolves to a project-local binary (${installResult.shellCommandPath}).`,
        ),
      );
      runtime.log(
        theme.muted(
          `Bootstrap now uses the global binary (${openclawCommand}) to avoid repo-local drift.`,
        ),
      );
    } else if (!installResult.shellCommandPath && installResult.globalBinDir) {
      runtime.log(
        theme.warn("Global OpenClaw was installed, but `openclaw` is not on shell PATH."),
      );
      runtime.log(
        theme.muted(
          `Add this to your shell profile, then open a new terminal: export PATH="${installResult.globalBinDir}:$PATH"`,
        ),
      );
    }

    runtime.log(theme.muted(`Workspace seed: ${describeWorkspaceSeedResult(workspaceSeed)}`));
    if (gatewayAutoFix?.attempted) {
      runtime.log(
        theme.muted(
          `Gateway auto-fix ${gatewayAutoFix.recovered ? "recovered connectivity" : "ran but gateway is still unhealthy"}.`,
        ),
      );
      for (const step of gatewayAutoFix.steps) {
        runtime.log(
          theme.muted(
            `  ${step.ok ? "[ok]" : "[fail]"} ${step.name}${step.detail ? ` (${step.detail})` : ""}`,
          ),
        );
      }
      if (!gatewayAutoFix.recovered && gatewayAutoFix.failureSummary) {
        runtime.log(theme.error(`Likely gateway cause: ${gatewayAutoFix.failureSummary}`));
      }
      if (!gatewayAutoFix.recovered && gatewayAutoFix.logExcerpts.length > 0) {
        runtime.log(theme.muted("Recent gateway logs:"));
        for (const excerpt of gatewayAutoFix.logExcerpts) {
          runtime.log(theme.muted(`  ${excerpt.path}`));
          for (const line of excerpt.excerpt.split(/\r?\n/)) {
            runtime.log(theme.muted(`    ${line}`));
          }
        }
      }
    }
    logBootstrapChecklist(diagnostics, runtime);
    runtime.log("");
    runtime.log(theme.heading("AnimClaw ready"));
    runtime.log(`Profile: ${profile}`);
    runtime.log(`OpenClaw CLI: ${installResult.version ?? "detected"}`);
    runtime.log(`Gateway: ${gatewayProbe.ok ? "reachable" : "check failed"}`);
    runtime.log(`Web UI: ${webUrl}`);
    runtime.log(
      `Rollout stage: ${rolloutStage}${legacyFallbackEnabled ? " (legacy fallback enabled)" : ""}`,
    );
    if (mediaKeyResults) {
      const configured = mediaKeyResults.filter((r) => r.configured);
      if (configured.length > 0) {
        runtime.log(`Media API keys: ${configured.map((r) => r.label).join(", ")}`);
      } else {
        runtime.log(theme.muted("Media API keys: none configured (add later with openclaw config set)"));
      }
    }
    if (!opened && openAttempted) {
      runtime.log(theme.muted("Browser open failed; copy/paste the URL above."));
    }
    if (diagnostics.hasFailures) {
      runtime.log(
        theme.warn(
          "Bootstrap completed with failing checks. Address remediation items above before full cutover.",
        ),
      );
    }
  }

  const summary: BootstrapSummary = {
    profile,
    onboarded: true,
    installedOpenClawCli: installResult.installed,
    openClawCliAvailable: installResult.available,
    openClawVersion: installResult.version,
    gatewayUrl,
    gatewayReachable: gatewayProbe.ok,
    gatewayAutoFix: gatewayAutoFix
      ? {
          attempted: gatewayAutoFix.attempted,
          recovered: gatewayAutoFix.recovered,
          steps: gatewayAutoFix.steps,
          failureSummary: gatewayAutoFix.failureSummary,
          logExcerpts: gatewayAutoFix.logExcerpts,
        }
      : undefined,
    workspaceSeed,
    webUrl,
    webReachable,
    webOpened: opened,
    diagnostics,
  };
  track("cli_bootstrap_completed", {
    duration_ms: Date.now() - bootstrapStartTime,
    workspace_created: Boolean(workspaceSeed),
    gateway_reachable: gatewayProbe.ok,
    web_reachable: webReachable,
    media_keys_configured: mediaKeyResults?.filter((r) => r.configured).length ?? 0,
    version: VERSION,
  });

  if (opts.json) {
    runtime.log(JSON.stringify(summary, null, 2));
  }
  return summary;
}
