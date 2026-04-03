/**
 * Lightweight request scorer for auto model routing (Manifest-inspired tiers).
 * Produces a 0–100 score mapped to tiers: simple, standard, complex, reasoning.
 */

export type Tier = "simple" | "standard" | "complex" | "reasoning";

export type ScoreResult = {
  tier: Tier;
  /** Raw score 0–100 before overrides */
  score: number;
  /** How decisive the signals were (0–1) */
  confidence: number;
};

const TIER_THRESHOLDS = {
  simple: 25,
  standard: 50,
  complex: 75,
  reasoning: 100,
} as const;

function bucketTier(score: number): Tier {
  if (score <= TIER_THRESHOLDS.simple) return "simple";
  if (score <= TIER_THRESHOLDS.standard) return "standard";
  if (score <= TIER_THRESHOLDS.complex) return "complex";
  return "reasoning";
}

function normalizeText(messages: Array<{ role: string; content: unknown }>): string {
  const parts: string[] = [];
  for (const m of messages) {
    const c = m.content;
    if (typeof c === "string") {
      parts.push(c);
    } else if (Array.isArray(c)) {
      for (const part of c) {
        if (typeof part === "object" && part !== null && "text" in part) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") parts.push(t);
        }
      }
    }
  }
  return parts.join("\n").toLowerCase();
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function keywordScore(text: string): number {
  let s = 0;
  const patterns: Array<[RegExp, number]> = [
    [/\b(prove|theorem|lemma|inductive|formal verification)\b/i, 28],
    [/\b(write a function|implement|refactor|debug|stack trace)\b/i, 22],
    [/\b(compare|contrast|evaluate tradeoffs|pros and cons)\b/i, 16],
    [/\b(analyze|deep dive|critique|research synthesis)\b/i, 18],
    [/\b(translate|summarize|what is|define)\b/i, 6],
  ];
  for (const [re, w] of patterns) {
    if (re.test(text)) s += w;
  }
  return Math.min(40, s);
}

function structuralScore(text: string, messageCount: number): number {
  let s = 0;
  const codeBlocks = (text.match(/```/g) ?? []).length / 2;
  if (codeBlocks >= 1) s += 18;
  if (codeBlocks >= 3) s += 12;
  const tok = estimateTokens(text);
  if (tok > 50_000) s += 35;
  else if (tok > 12_000) s += 22;
  else if (tok > 4_000) s += 12;
  else if (tok > 1_500) s += 6;
  const nesting =
    (text.match(/\{/g) ?? []).length + (text.match(/\(/g) ?? []).length;
  if (nesting > 80) s += 10;
  if (messageCount > 24) s += 8;
  else if (messageCount > 12) s += 4;
  return Math.min(45, s);
}

function contextualScore(
  hasTools: boolean,
  maxOut: number | undefined,
  messageCount: number,
): number {
  let s = 0;
  if (hasTools) s += 20;
  if (maxOut !== undefined && maxOut > 8_192) s += 14;
  else if (maxOut !== undefined && maxOut > 4_096) s += 8;
  if (messageCount > 30) s += 6;
  return Math.min(30, s);
}

function computeConfidence(
  kw: number,
  struct: number,
  ctx: number,
): number {
  const dims = [kw / 40, struct / 45, ctx / 30];
  const mean = dims.reduce((a, b) => a + b, 0) / 3;
  const variance =
    dims.reduce((acc, d) => acc + (d - mean) ** 2, 0) / dims.length;
  const spread = Math.sqrt(variance);
  return Math.max(0.35, Math.min(1, 0.55 + (1 - spread) * 0.45));
}

export type ScoreRequestInput = {
  messages: Array<{ role: string; content: unknown }>;
  /** OpenAI-style tools array from the request body */
  tools?: unknown;
  maxTokens?: number;
};

/**
 * Score a chat completion request and assign a routing tier.
 */
export function scoreRequest(input: ScoreRequestInput): ScoreResult {
  const text = normalizeText(input.messages);
  const messageCount = input.messages.length;
  const hasTools = Array.isArray(input.tools) && input.tools.length > 0;

  const kw = keywordScore(text);
  const struct = structuralScore(text, messageCount);
  const ctx = contextualScore(hasTools, input.maxTokens, messageCount);

  let score = Math.min(100, kw + struct + ctx);

  // Minimum-tier overrides (Manifest-style)
  if (hasTools && bucketTier(score) === "simple") {
    score = Math.max(score, TIER_THRESHOLDS.simple + 1);
  }
  if (estimateTokens(text) > 50_000) {
    score = Math.max(score, TIER_THRESHOLDS.complex + 1);
  }
  if (/\b(prove|theorem|formal verification|z3|lean|coq)\b/i.test(text)) {
    score = Math.max(score, TIER_THRESHOLDS.complex + 1);
  }

  const tier = bucketTier(score);
  const confidence = computeConfidence(kw, struct, ctx);

  return { tier, score, confidence };
}

export function isAutoModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m === "auto" || m === "manifest/auto";
}
