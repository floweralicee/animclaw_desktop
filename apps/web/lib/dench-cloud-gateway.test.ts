import { describe, expect, it } from "vitest";
import { normalizeDenchCloudModelForGateway } from "./dench-cloud-gateway";

describe("normalizeDenchCloudModelForGateway", () => {
  it("maps dench-cloud stable ids to gateway provider/model", () => {
    expect(normalizeDenchCloudModelForGateway("dench-cloud/anthropic.claude-opus-4-6-v1")).toBe(
      "anthropic/claude-4-opus-20250514",
    );
    expect(normalizeDenchCloudModelForGateway("dench-cloud/anthropic.claude-sonnet-4-6-v1")).toBe(
      "anthropic/claude-sonnet-4-20250514",
    );
    expect(normalizeDenchCloudModelForGateway("dench-cloud/gpt-5.4")).toBe("openai/gpt-4.1");
  });

  it("strips mistaken dench/ prefix before anthropic or openai", () => {
    expect(normalizeDenchCloudModelForGateway("dench/anthropic/claude-opus-4.6")).toBe(
      "anthropic/claude-4-opus-20250514",
    );
  });

  it("strips vercel-ai-gateway prefix", () => {
    expect(normalizeDenchCloudModelForGateway("vercel-ai-gateway/anthropic/claude-opus-4.6")).toBe(
      "anthropic/claude-4-opus-20250514",
    );
  });

  it("passes through already-normal gateway ids", () => {
    expect(normalizeDenchCloudModelForGateway("anthropic/claude-sonnet-4-20250514")).toBe(
      "anthropic/claude-sonnet-4-20250514",
    );
    expect(normalizeDenchCloudModelForGateway("openai/gpt-4o")).toBe("openai/gpt-4o");
  });
});
