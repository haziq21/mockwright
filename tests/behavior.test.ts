import { describe, expect, it } from "vite-plus/test";
import { deliver } from "../src/behavior";

describe("deliver", () => {
  it("returns synchronously for `return`", () => {
    expect(deliver({ type: "return", value: 42 })).toBe(42);
  });

  it("throws synchronously for `throw`", () => {
    expect(() => deliver({ type: "throw", value: new Error("boom") })).toThrow("boom");
  });

  it("resolves for `resolve`", async () => {
    await expect(deliver({ type: "resolve", value: 42 })).resolves.toBe(42);
  });

  it("rejects for `reject`", async () => {
    await expect(deliver({ type: "reject", value: new Error("boom") })).rejects.toThrow("boom");
  });
});
