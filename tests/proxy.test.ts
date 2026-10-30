import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { proxy, type Mock } from "../src/proxy";

let mocks: Map<string, Mock>;
beforeEach(() => {
  mocks = new Map();
});

const mock = (path: string, value: unknown) => mocks.set(path, () => value);
const wrap = <T extends object>(dep: T) => proxy(dep, "dep", (path) => mocks.get(path));

class Customers {
  retrieve() {
    return "real";
  }
}

class Service {
  customers = new Customers();
  create(this: void) {
    return "real";
  }
}

describe("proxy", () => {
  it("mocks methods", () => {
    mock("dep.create", "mocked");
    expect(wrap(new Service()).create()).toBe("mocked");
  });

  it("passes through", () => {
    expect(wrap(new Service()).create()).toBe("real");
  });

  it("mocks nested methods", () => {
    mock("dep.customers.retrieve", "mocked");
    expect(wrap(new Service()).customers.retrieve()).toBe("mocked");
  });

  it("mocks namespaces", () => {
    const service = wrap(new Service());
    void service.customers;
    mock("dep.customers", { retrieve: () => "mocked" });
    expect(service.customers.retrieve()).toBe("mocked");
  });

  it("keeps identity", () => {
    const service = wrap(new Service());
    expect(service.customers).toBe(service.customers);
    expect(service.create).toBe(service.create);
  });

  it("follows reassignment", () => {
    const service = new Service();
    const wrapped = wrap(service);
    void wrapped.customers;
    service.customers = { retrieve: () => "next" };
    expect(wrapped.customers.retrieve()).toBe("next");
  });

  it("skips mocked getters", () => {
    const getter = vi.fn();
    mock("dep.value", "mocked");
    expect(
      wrap({
        get value() {
          return getter();
        },
      }).value,
    ).toBe("mocked");
    expect(getter).not.toHaveBeenCalled();
  });

  it("leaves getter values unwrapped", () => {
    const value = {};
    expect(
      wrap({
        get value() {
          return value;
        },
      }).value,
    ).toBe(value);
  });

  it("runs getters on target", () => {
    class Private {
      #id = "id";
      map = new Map([[1, 2]]);
      get id() {
        return this.#id;
      }
    }
    const wrapped = wrap(new Private());
    expect(wrapped.id).toBe("id");
    expect(wrapped.map.size).toBe(1);
  });

  it("leaves promises, symbols and return values unwrapped", () => {
    const value = {};
    const dep = { promise: Promise.resolve(), [Symbol.iterator]: () => value, get: () => value };
    const wrapped = wrap(dep);
    expect(wrapped.promise).toBe(dep.promise);
    expect(wrapped[Symbol.iterator]).toBe(dep[Symbol.iterator]);
    expect(wrapped.get()).toBe(value);
  });

  it("mocks functions", () => {
    mock("dep", "mocked");
    expect(wrap(() => "real")()).toBe("mocked");
  });

  it("keeps function properties and construction", () => {
    function Sender(this: { id?: string }) {
      this.id = "made";
    }
    Sender.retry = () => "retried";
    const wrapped = wrap(Sender);
    expect(wrapped.retry()).toBe("retried");
    expect(new (wrapped as unknown as new () => { id: string })().id).toBe("made");
  });
});
