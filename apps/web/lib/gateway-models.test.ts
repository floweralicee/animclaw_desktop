import { describe, expect, it } from "vitest";
import { resolveModel } from "./gateway-models";

describe("resolveModel", () => {
  it("resolves dench-cloud stable ids to anthropic pricing", () => {
    const r = resolveModel("dench-cloud/anthropic.claude-opus-4-6-v1");
    expect(r.provider).toBe("anthropic");
    expect(r.modelId).toBe("claude-4-opus-20250514");
    expect(r.pricing.provider).toBe("anthropic");
  });

  it("resolves mistaken dench/anthropic/ short ids", () => {
    const r = resolveModel("dench/anthropic/claude-opus-4.6");
    expect(r.provider).toBe("anthropic");
    expect(r.modelId).toBe("claude-4-opus-20250514");
  });

  it("throws for unknown dench-cloud stable id", () => {
    expect(() => resolveModel("dench-cloud/unknown.model-v99")).toThrow(/Unknown Dench Cloud model/);
  });
});
