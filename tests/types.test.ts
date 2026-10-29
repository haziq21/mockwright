import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  Mockwright,
  type HandleResult,
  type MockControlMessage,
  type MockHandle,
  type MockValue,
  type Mw,
} from "../src";
import type { Paths, MwCallable } from "../src/types";

class PaymentsService {
  createPaymentIntent(_order: { orderId: string; totalCents: number }): string {
    return "pi_src_123";
  }
}

interface Deps {
  payments: PaymentsService;
  deep: { nested: { method(): Promise<string> } };
  queued: Promise<unknown>;
}

const instance = new Mockwright<Deps>();

describe("types", () => {
  it("derives dotted key paths", () => {
    expectTypeOf<Paths<Deps>>().toEqualTypeOf<
      | "payments"
      | "payments.createPaymentIntent"
      | "deep"
      | "deep.nested"
      | "deep.nested.method"
      | "queued"
    >();
  });

  it("derives value types from a method path", () => {
    expectTypeOf<MockValue<Deps, "payments.createPaymentIntent">>().toEqualTypeOf<string>();
    expectTypeOf<MockValue<Deps, "deep.nested.method">>().toEqualTypeOf<Promise<string>>();
  });

  it("types mockReturnValue as the raw return and mockResolvedValue as the awaited return", () => {
    type Handle = MockHandle<Deps, "deep.nested.method">;
    expectTypeOf<Parameters<Handle["mockReturnValue"]>[0]>().toEqualTypeOf<Promise<string>>();
    expectTypeOf<Parameters<Handle["mockResolvedValue"]>[0]>().toEqualTypeOf<string>();
  });

  it("derives property types from a leaf/getter path", () => {
    expectTypeOf<MockValue<Deps, "queued">>().toEqualTypeOf<Promise<unknown>>();
  });

  it("extracts the fixture callable from the instance", () => {
    expectTypeOf<Mw<typeof instance>>().toEqualTypeOf<MwCallable<Deps>>();
  });

  it("constraint-checks wrap names against the registry", () => {
    // @ts-expect-error name must be a key of the registry type
    void instance.wrap(new PaymentsService(), "nope", "t1");
    expectTypeOf(
      instance.wrap(new PaymentsService(), "payments", "t1"),
    ).toEqualTypeOf<PaymentsService>();
  });

  it("accepts a header-derived test id (string | null)", () => {
    const header: string | null = "t1";
    expectTypeOf(
      instance.wrap(new PaymentsService(), "payments", header),
    ).toEqualTypeOf<PaymentsService>();
    expectTypeOf(
      instance.wrap(new PaymentsService(), "payments", null),
    ).toEqualTypeOf<PaymentsService>();
  });

  it("models control messages", () => {
    const _message: MockControlMessage = {
      action: "set",
      key: "payments.createPaymentIntent",
      type: "resolve",
      value: "1",
    };
    expectTypeOf<MockControlMessage["action"]>().toEqualTypeOf<"set" | "restore" | "reset">();
    expectTypeOf<HandleResult>().toMatchTypeOf<{ ok: boolean }>();
  });
});
