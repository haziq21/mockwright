import { describe, expectTypeOf, it } from "vite-plus/test";
import { Mockwright, type MockHandle, type Mw } from "../src";
import type { MockValue, MwFor, Paths } from "../src/types";

class Payments {
  charge(_cents: number) {
    return "real";
  }
}

interface Deps {
  payments: Payments;
  deep: { nested: { method(): Promise<string> } };
  queued: Promise<unknown>;
}

const mockwright = new Mockwright<Deps>();

describe("types", () => {
  it("derives paths", () => {
    expectTypeOf<Paths<Deps>>().toEqualTypeOf<
      "payments" | "payments.charge" | "deep" | "deep.nested" | "deep.nested.method" | "queued"
    >();
  });

  it("derives values", () => {
    expectTypeOf<MockValue<Deps, "payments.charge">>().toEqualTypeOf<string>();
    expectTypeOf<MockValue<Deps, "deep.nested.method">>().toEqualTypeOf<Promise<string>>();
    expectTypeOf<MockValue<Deps, "queued">>().toEqualTypeOf<Promise<unknown>>();
  });

  it("awaits resolved values", () => {
    type Handle = MockHandle<Deps, "deep.nested.method">;
    expectTypeOf<Handle["mockReturnValue"]>().parameter(0).toEqualTypeOf<Promise<string>>();
    expectTypeOf<Handle["mockResolvedValue"]>().parameter(0).toEqualTypeOf<string>();
  });

  it("infers mw", () => {
    expectTypeOf<Mw<typeof mockwright>>().toEqualTypeOf<MwFor<Deps>>();
  });

  it("checks wrap names", () => {
    // @ts-expect-error
    void mockwright.wrap(new Payments(), "nope");
    expectTypeOf(mockwright.wrap(new Payments(), "payments", null)).toEqualTypeOf<Payments>();
  });
});
