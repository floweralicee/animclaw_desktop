/**
 * Tier → concrete model ids (cheapest capable first). Uses models from gateway-models pricing.
 */

import type { Tier } from "./scorer";

export const TIER_ORDER: Tier[] = ["simple", "standard", "complex", "reasoning"];

/** Models per tier, ordered by typical cost (cheapest first). */
const TIER_MODELS: Record<Tier, readonly string[]> = {
  simple: ["gpt-4.1-nano", "claude-3.5-haiku-20241022"],
  standard: ["gpt-4o-mini", "gpt-4.1-mini"],
  complex: ["gpt-4o", "claude-sonnet-4-20250514"],
  reasoning: ["o3-mini", "o4-mini", "o3"],
};

/**
 * Full ordered candidate list: all models in the assigned tier, then escalated tiers.
 */
export function buildAutoRouteCandidates(startTier: Tier): string[] {
  const startIdx = TIER_ORDER.indexOf(startTier);
  const out: string[] = [];
  for (let i = startIdx; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i]!;
    out.push(...TIER_MODELS[tier]);
  }
  return [...new Set(out)];
}
