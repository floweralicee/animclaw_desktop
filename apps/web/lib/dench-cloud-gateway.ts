/**
 * Dench Cloud model IDs (OpenClaw `agents.defaults.model.primary` uses
 * `dench-cloud/<stableId>`). Maps to Vercel AI Gateway `provider/modelId` strings.
 *
 * Stable IDs align with DenchClaw's catalog fallbacks:
 * https://github.com/DenchHQ/DenchClaw/blob/main/src/cli/dench-cloud.ts
 */

export type GatewayProvider = "openai" | "anthropic";

/** Dench Cloud catalog stableId → gateway routing. */
export const DENCH_CLOUD_STABLE_ID_TO_GATEWAY: Record<
  string,
  { provider: GatewayProvider; modelId: string }
> = {
  "anthropic.claude-opus-4-6-v1": {
    provider: "anthropic",
    modelId: "claude-4-opus-20250514",
  },
  "anthropic.claude-sonnet-4-6-v1": {
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
  },
  /** Dench catalog id; closest tracked OpenAI model for gateway + pricing. */
  "gpt-5.4": { provider: "openai", modelId: "gpt-4.1" },
};

/** Short public ids (catalog `id` field) → gateway model. */
const DENCH_CATALOG_SHORT_ID: Record<string, { provider: GatewayProvider; modelId: string }> = {
  "claude-opus-4.6": { provider: "anthropic", modelId: "claude-4-opus-20250514" },
  "claude-sonnet-4.6": { provider: "anthropic", modelId: "claude-sonnet-4-20250514" },
};

const GATEWAY_PREFIXES = [
  "vercel-ai-gateway",
  "dench-cloud",
] as const;

function isKnownGatewayPrefix(first: string): boolean {
  return (GATEWAY_PREFIXES as readonly string[]).includes(first);
}

/**
 * Normalize Dench Cloud / multi-segment OpenClaw model strings to
 * `openai/<model>` or `anthropic/<model>` for the AI Gateway.
 */
export function normalizeDenchCloudModelForGateway(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return model;
  }

  // dench-cloud/<stableId> (DenchClaw primary model)
  if (trimmed.startsWith("dench-cloud/")) {
    const stableId = trimmed.slice("dench-cloud/".length);
    const mapped = DENCH_CLOUD_STABLE_ID_TO_GATEWAY[stableId];
    if (mapped) {
      return `${mapped.provider}/${mapped.modelId}`;
    }
    return trimmed;
  }

  // Mistaken short prefix: dench/anthropic/... or dench/openai/...
  if (trimmed.startsWith("dench/")) {
    const rest = trimmed.slice("dench/".length);
    const segments = rest.split("/").filter(Boolean);
    if (segments.length >= 2 && (segments[0] === "anthropic" || segments[0] === "openai")) {
      const provider = segments[0] as GatewayProvider;
      const tail = segments.slice(1).join("/");
      const short = DENCH_CATALOG_SHORT_ID[tail];
      if (short && short.provider === provider) {
        return `${short.provider}/${short.modelId}`;
      }
      return `${provider}/${tail}`;
    }
  }

  // <gateway>/anthropic/<model> or <gateway>/openai/<model> (e.g. vercel-ai-gateway)
  const parts = trimmed.split("/");
  if (
    parts.length === 3 &&
    isKnownGatewayPrefix(parts[0]!) &&
    (parts[1] === "anthropic" || parts[1] === "openai")
  ) {
    const provider = parts[1] as GatewayProvider;
    const tail = parts[2]!;
    const short = DENCH_CATALOG_SHORT_ID[tail];
    if (short && short.provider === provider) {
      return `${short.provider}/${short.modelId}`;
    }
    return `${provider}/${tail}`;
  }

  // anthropic/claude-opus-4.6 (short id without Dench prefix)
  if (parts.length === 2 && parts[0] === "anthropic") {
    const short = DENCH_CATALOG_SHORT_ID[parts[1]!];
    if (short) {
      return `${short.provider}/${short.modelId}`;
    }
  }

  return trimmed;
}
