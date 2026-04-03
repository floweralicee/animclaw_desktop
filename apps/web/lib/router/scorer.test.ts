import { describe, expect, it } from "vitest";
import { isAutoModel, scoreRequest } from "./scorer";

describe("isAutoModel", () => {
  it("recognizes auto aliases", () => {
    expect(isAutoModel("auto")).toBe(true);
    expect(isAutoModel("manifest/auto")).toBe(true);
    expect(isAutoModel("AUTO")).toBe(true);
    expect(isAutoModel("gpt-4o")).toBe(false);
  });
});

describe("scoreRequest", () => {
  it("routes trivial prompts toward simple tier", () => {
    const r = scoreRequest({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(["simple", "standard"]).toContain(r.tier);
  });

  it("bumps tier when tools are present", () => {
    const r = scoreRequest({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "x" } }],
    });
    expect(r.tier).not.toBe("simple");
  });
});
