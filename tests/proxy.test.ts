import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MockBehavior } from "../src/behavior";
import { Store } from "../src/store";
import { wrapObject } from "../src/proxy";

let store: Store;
beforeEach(() => {
  store = new Store();
});

const behavior = (value: unknown): MockBehavior => ({ type: "return", value });

class Customers {
  retrieve() {
    return "cus_src_ok";
  }
}

class PaymentsService {
  customers = new Customers();
  createPaymentIntent(this: void) {
    return "pi_src_ok";
  }
  async createPaymentIntentAsync() {
    return "pi_src_async";
  }
}

describe("wrapObject", () => {
  it("derives dotted keys and delivers mocked values", () => {
    store.set("t", "payments.createPaymentIntent", behavior("pi_test_ok"));
    const wrapped = wrapObject(new PaymentsService(), "payments", "t", store);
    expect(wrapped.createPaymentIntent()).toBe("pi_test_ok");
  });

  it("passes through to the real method when unmocked", () => {
    const wrapped = wrapObject(new PaymentsService(), "payments", "t", store);
    expect(wrapped.createPaymentIntent()).toBe("pi_src_ok");
  });

  it("traverses nested namespaces", () => {
    store.set("t", "payments.customers.retrieve", behavior("cus_test_ok"));
    const wrapped = wrapObject(new PaymentsService(), "payments", "t", store);
    expect(wrapped.customers.retrieve()).toBe("cus_test_ok");
  });

  it("delivers async behaviors", async () => {
    store.set("t", "payments.createPaymentIntentAsync", {
      type: "resolve",
      value: "pi_test_async",
    });
    const wrapped = wrapObject(new PaymentsService(), "payments", "t", store);
    await expect(wrapped.createPaymentIntentAsync()).resolves.toBe("pi_test_async");
  });

  it("keeps identity stable per property", () => {
    const wrapped = wrapObject(new PaymentsService(), "payments", "t", store);
    expect(wrapped.customers).toBe(wrapped.customers);
    expect(wrapped.createPaymentIntent).toBe(wrapped.createPaymentIntent);
  });

  it("does not invoke a getter when it is mocked", () => {
    const spy = vi.fn(() => "real-getter");
    class WithGetter {
      get thing() {
        return spy();
      }
    }
    store.set("t", "payments.thing", behavior("pi_test_getter"));
    const wrapped = wrapObject(new WithGetter(), "payments", "t", store);
    expect(wrapped.thing).toBe("pi_test_getter");
    expect(spy).not.toHaveBeenCalled();
  });

  it("invokes an unmocked getter and returns its value unwrapped", () => {
    const deep = { nested: () => "real-nested" };
    class WithGetter {
      get thing() {
        return deep;
      }
    }
    const wrapped = wrapObject(new WithGetter(), "payments", "t", store);
    expect(wrapped.thing).toBe(deep);
  });

  it("treats promise-valued properties as leaves", () => {
    class WithPromise {
      charge = Promise.resolve("real");
    }
    const dep = new WithPromise();
    const wrapped = wrapObject(dep, "payments", "t", store);
    expect(wrapped.charge).toBe(dep.charge);
  });

  it("passes symbols through unwrapped", () => {
    const iterator = () => "iter";
    class WithSymbol {
      [Symbol.iterator] = iterator;
    }
    const dep = new WithSymbol();
    const wrapped = wrapObject(dep, "payments", "t", store);
    expect(wrapped[Symbol.iterator]).toBe(iterator);
  });

  it("short-circuits a namespace when a behavior exists at its path", () => {
    const replacement = { retrieve: () => "customers_test_mocked" };
    store.set("t", "payments.customers", behavior(replacement));
    const wrapped = wrapObject(new PaymentsService(), "payments", "t", store);
    expect(wrapped.customers.retrieve()).toBe("customers_test_mocked");
  });

  it("does not wrap return values", () => {
    const returned = { intentId: "pi_x" };
    class WithReturn {
      get() {
        return returned;
      }
    }
    const wrapped = wrapObject(new WithReturn(), "payments", "t", store);
    expect(wrapped.get()).toBe(returned);
  });

  it("applies a mock set after a namespace was first read", () => {
    const wrapped = wrapObject(new PaymentsService(), "payments", "t", store);
    void wrapped.customers;
    const replacement = { retrieve: () => "customers_test_mocked" };
    store.set("t", "payments.customers", behavior(replacement));
    expect(wrapped.customers.retrieve()).toBe("customers_test_mocked");
  });

  it("follows a property that is reassigned on the dependency", () => {
    const dep = new PaymentsService();
    const wrapped = wrapObject(dep, "payments", "t", store);
    void wrapped.customers;
    const next = new Customers();
    next.retrieve = () => "cus_next";
    dep.customers = next;
    expect(wrapped.customers.retrieve()).toBe("cus_next");
  });

  it("runs getters against the real target", () => {
    class WithPrivate {
      #id = "cus_private";
      map = new Map([[1, 2]]);
      get id() {
        return this.#id;
      }
    }
    const wrapped = wrapObject(new WithPrivate(), "payments", "t", store);
    expect(wrapped.id).toBe("cus_private");
    expect(wrapped.map.size).toBe(1);
  });

  it("preserves own properties and constructability of function dependencies", () => {
    function Sender(this: { id?: string }) {
      this.id = "made";
    }
    Sender.retry = () => "retried";
    const wrapped = wrapObject(Sender, "send", "t", store);
    expect(wrapped.retry()).toBe("retried");
    expect(new (wrapped as unknown as new () => { id: string })().id).toBe("made");
  });
});
