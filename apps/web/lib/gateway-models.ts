/**
 * Model routing and per-model pricing for the Animclaw AI Gateway.
 *
 * Pricing is in microcents (1/10,000 of a cent) per token to avoid
 * floating-point drift during aggregation.
 */

import {
  DENCH_CLOUD_STABLE_ID_TO_GATEWAY,
  normalizeDenchCloudModelForGateway,
} from "./dench-cloud-gateway";

export type Provider = "openai" | "anthropic";

export type ModelPricing = {
  provider: Provider;
  promptMicrocentsPerToken: number;
  completionMicrocentsPerToken: number;
};

const OPENAI_MODELS: Record<string, ModelPricing> = {
  "gpt-4o": { provider: "openai", promptMicrocentsPerToken: 25, completionMicrocentsPerToken: 100 },
  "gpt-4o-mini": { provider: "openai", promptMicrocentsPerToken: 2, completionMicrocentsPerToken: 6 },
  "gpt-4.1": { provider: "openai", promptMicrocentsPerToken: 20, completionMicrocentsPerToken: 80 },
  "gpt-4.1-mini": { provider: "openai", promptMicrocentsPerToken: 4, completionMicrocentsPerToken: 16 },
  "gpt-4.1-nano": { provider: "openai", promptMicrocentsPerToken: 1, completionMicrocentsPerToken: 4 },
  "o3": { provider: "openai", promptMicrocentsPerToken: 100, completionMicrocentsPerToken: 400 },
  "o3-mini": { provider: "openai", promptMicrocentsPerToken: 11, completionMicrocentsPerToken: 44 },
  "o4-mini": { provider: "openai", promptMicrocentsPerToken: 11, completionMicrocentsPerToken: 44 },
};

const ANTHROPIC_MODELS: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": { provider: "anthropic", promptMicrocentsPerToken: 30, completionMicrocentsPerToken: 150 },
  "claude-4-opus-20250514": { provider: "anthropic", promptMicrocentsPerToken: 150, completionMicrocentsPerToken: 750 },
  "claude-3.5-haiku-20241022": { provider: "anthropic", promptMicrocentsPerToken: 8, completionMicrocentsPerToken: 40 },
  "claude-3.5-sonnet-20241022": { provider: "anthropic", promptMicrocentsPerToken: 30, completionMicrocentsPerToken: 150 },
};

const ALL_MODELS: Record<string, ModelPricing> = {
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS,
};

/**
 * Resolve a model string to its provider and pricing.
 *
 * Accepts bare names ("gpt-4o") or prefixed ("openai/gpt-4o", "anthropic/claude-sonnet-4-20250514").
 * Dench Cloud / OpenClaw multi-segment ids (`dench-cloud/<stableId>`, `vercel-ai-gateway/anthropic/...`)
 * are normalized first (see dench-cloud-gateway.ts).
 * Unknown models are routed by prefix heuristic with fallback pricing.
 */
export function resolveModel(model: string): { provider: Provider; modelId: string; pricing: ModelPricing } {
  const normalized = normalizeDenchCloudModelForGateway(model);
  if (normalized.startsWith("dench-cloud/")) {
    const stableId = normalized.slice("dench-cloud/".length);
    const known = Object.keys(DENCH_CLOUD_STABLE_ID_TO_GATEWAY).join(", ");
    throw new Error(
      `Unknown Dench Cloud model "${model}" (stableId: ${stableId}). Add it to DENCH_CLOUD_STABLE_ID_TO_GATEWAY. Known: ${known}`,
    );
  }

  let provider: Provider | undefined;
  let modelId = normalized;

  if (normalized.startsWith("openai/")) {
    provider = "openai";
    modelId = normalized.slice(7);
  } else if (normalized.startsWith("anthropic/")) {
    provider = "anthropic";
    modelId = normalized.slice(10);
  }

  const known = ALL_MODELS[modelId];
  if (known) {
    return { provider: known.provider, modelId, pricing: known };
  }

  if (!provider) {
    if (/^(gpt-|o[0-9]|chatgpt-)/.test(modelId)) {
      provider = "openai";
    } else if (/^claude-/.test(modelId)) {
      provider = "anthropic";
    }
  }

  if (!provider) {
    throw new Error(`Unknown model: ${model}. Use openai/ or anthropic/ prefix.`);
  }

  const fallback: ModelPricing = {
    provider,
    promptMicrocentsPerToken: 30,
    completionMicrocentsPerToken: 120,
  };

  return { provider, modelId, pricing: fallback };
}

export function calculateCost(
  pricing: ModelPricing,
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    pricing.promptMicrocentsPerToken * promptTokens +
    pricing.completionMicrocentsPerToken * completionTokens
  );
}

export function listAvailableModels(): Array<{ id: string; provider: Provider }> {
  return Object.entries(ALL_MODELS).map(([id, { provider }]) => ({ id, provider }));
}
