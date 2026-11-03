import { describe, expect, it } from "vite-plus/test";
import { Mockwright } from "../src";
import { codec } from "../src/transport";

class Service {
  create() {
    return "real";
  }
}

const { stringify } = codec({});

function setup() {
  const mockwright = new Mockwright<{ service: Service }>();
  const service = mockwright.wrap(new Service(), "service", "t1");
  const set = (behavior: string, value: unknown) =>
    mockwright.handle(
      { action: "set", path: "service.create", behavior, value: stringify(value) },
      "t1",
    );
  return { mockwright, service, set };
}

describe("Mockwright", () => {
  it("skips without test id", () => {
    const service = new Service();
    expect(new Mockwright<{ service: Service }>().wrap(service, "service")).toBe(service);
  });

  it("applies behaviors", async () => {
    const { service, set } = setup();
    set("return", "returned");
    expect(service.create()).toBe("returned");
    set("throw", new Error("thrown"));
    expect(() => service.create()).toThrow("thrown");
    set("resolve", "resolved");
    await expect(service.create()).resolves.toBe("resolved");
    set("reject", new Error("rejected"));
    await expect(service.create()).rejects.toThrow("rejected");
  });

  it("restores", () => {
    const { mockwright, service, set } = setup();
    set("return", "mocked");
    expect(mockwright.handle({ action: "restore", path: "service.create" }, "t1")).toEqual({
      ok: true,
    });
    expect(service.create()).toBe("real");
  });

  it("resets", () => {
    const { mockwright, service, set } = setup();
    set("return", "mocked");
    expect(mockwright.handle({ action: "reset" }, "t1")).toEqual({ ok: true });
    expect(service.create()).toBe("real");
  });

  it("isolates tests", () => {
    const { mockwright, set } = setup();
    set("return", "mocked");
    expect(mockwright.wrap(new Service(), "service", "t2").create()).toBe("real");
  });

  it.each([
    [{ action: "reset" }, null, "missing test id"],
    [null, "t1", "unknown action"],
    [{ action: "nope" }, "t1", "unknown action"],
    [{ action: "restore" }, "t1", "missing path"],
    [{ action: "set", behavior: "return", value: "1" }, "t1", "missing path"],
    [{ action: "set", path: "p", behavior: "toString", value: "1" }, "t1", "unknown behavior"],
    [{ action: "set", path: "p", behavior: "return" }, "t1", "missing value"],
    [{ action: "set", path: "p", behavior: "return", value: "{" }, "t1", "unparsable value"],
  ])("rejects %j", (message, testId, error) => {
    expect(new Mockwright().handle(message, testId)).toEqual({ ok: false, error });
  });
});
