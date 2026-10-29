import { describe, expect, it } from "vite-plus/test";
import { Store } from "../src/store";

describe("Store", () => {
  it("stores and reads behaviors per test id", () => {
    const store = new Store();
    const behavior = { type: "return", value: 1 } as const;
    store.set("t1", "pl.getUser", behavior);
    expect(store.get("t1", "pl.getUser")).toBe(behavior);
    expect(store.get("t2", "pl.getUser")).toBeUndefined();
  });

  it("restores a single behavior", () => {
    const store = new Store();
    store.set("t1", "pl.getUser", { type: "return", value: 1 });
    store.restore("t1", "pl.getUser");
    expect(store.get("t1", "pl.getUser")).toBeUndefined();
  });

  it("resets an entire test scope", () => {
    const store = new Store();
    store.set("t1", "a", { type: "return", value: 1 });
    store.set("t1", "b", { type: "return", value: 2 });
    store.set("t2", "a", { type: "return", value: 3 });
    store.reset("t1");
    expect(store.get("t1", "a")).toBeUndefined();
    expect(store.get("t1", "b")).toBeUndefined();
    expect(store.get("t2", "a")).toEqual({ type: "return", value: 3 });
  });
});
