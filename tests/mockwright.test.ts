import * as devalue from "devalue";
import { describe, expect, it } from "vite-plus/test";
import { Mockwright } from "../src/mockwright";
import { toDevalueFormat, type Transport } from "../src/transport";

class PaymentFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentFailedError";
  }
}

class PaymentsService {
  createPaymentIntent(_order: { orderId: string; totalCents: number }): string {
    return "pi_src_123";
  }
  charge(): never {
    throw new PaymentFailedError("real-decline");
  }
}

describe("Mockwright", () => {
  it("returns the dep untouched when no testId is given", () => {
    const mockwright = new Mockwright<{ payments: PaymentsService }>();
    const payments = new PaymentsService();
    expect(mockwright.wrap(payments, "payments")).toBe(payments);
  });

  it("wraps the dep and delivers behaviors set through handle", async () => {
    const mockwright = new Mockwright<{ payments: PaymentsService }>();
    const wrapped = mockwright.wrap(new PaymentsService(), "payments", "t1");
    const value = devalue.stringify("pi_test_123");
    expect(
      mockwright.handle(
        { action: "set", key: "payments.createPaymentIntent", type: "return", value },
        "t1",
      ),
    ).toEqual({ ok: true });
    expect(wrapped.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_test_123");
  });

  it("restores a single behavior", () => {
    const mockwright = new Mockwright<{ payments: PaymentsService }>();
    const wrapped = mockwright.wrap(new PaymentsService(), "payments", "t1");
    const value = devalue.stringify("pi_test_123");
    mockwright.handle(
      { action: "set", key: "payments.createPaymentIntent", type: "return", value },
      "t1",
    );
    mockwright.handle({ action: "restore", key: "payments.createPaymentIntent" }, "t1");
    expect(wrapped.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_src_123");
  });

  it("resets a test scope", () => {
    const mockwright = new Mockwright<{ payments: PaymentsService }>();
    const wrapped = mockwright.wrap(new PaymentsService(), "payments", "t1");
    const value = devalue.stringify("pi_test_123");
    mockwright.handle(
      { action: "set", key: "payments.createPaymentIntent", type: "return", value },
      "t1",
    );
    mockwright.handle({ action: "reset" }, "t1");
    expect(wrapped.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_src_123");
  });

  it("keeps test scopes isolated", () => {
    const mockwright = new Mockwright<{ payments: PaymentsService }>();
    const a = mockwright.wrap(new PaymentsService(), "payments", "a");
    const b = mockwright.wrap(new PaymentsService(), "payments", "b");
    mockwright.handle(
      {
        action: "set",
        key: "payments.createPaymentIntent",
        type: "return",
        value: devalue.stringify("pi_test_a"),
      },
      "a",
    );
    expect(a.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_test_a");
    expect(b.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_src_123");
  });

  it("revives errors with the configured transports", () => {
    const transports: Record<string, Transport> = {
      PaymentFailedError: {
        reduce: (value: unknown) =>
          value instanceof PaymentFailedError &&
          ([value.name, value.message, value.stack] as const),
        revive: ([name, message, stack]) => {
          const error = new PaymentFailedError(message);
          error.name = name;
          if (stack !== undefined) error.stack = stack;
          return error;
        },
      },
    };
    const mockwright = new Mockwright<{ payments: PaymentsService }>(transports);
    const wrapped = mockwright.wrap(new PaymentsService(), "payments", "t1");
    const value = devalue.stringify(
      new PaymentFailedError("declined"),
      toDevalueFormat(transports).reducers,
    );
    mockwright.handle({ action: "set", key: "payments.charge", type: "reject", value }, "t1");
    return expect(wrapped.charge()).rejects.toBeInstanceOf(PaymentFailedError);
  });

  it("mocks a function-valued dependency", () => {
    function sendEmail(_orderId: string): string {
      return "sent-src-ok";
    }
    const mockwright = new Mockwright<{ sendEmail: typeof sendEmail }>();
    mockwright.handle(
      { action: "set", key: "sendEmail", type: "return", value: devalue.stringify("sent-test-ok") },
      "t1",
    );
    const wrapped = mockwright.wrap(sendEmail, "sendEmail", "t1");
    expect(wrapped("o1")).toBe("sent-test-ok");
  });

  it("reports invalid control messages", () => {
    const mockwright = new Mockwright<{ payments: PaymentsService }>();
    expect(mockwright.handle({ action: "reset" }, undefined)).toEqual({
      ok: false,
      error: "missing test id",
    });
    expect(mockwright.handle({ action: "nope" } as never, "t1")).toEqual({
      ok: false,
      error: "unknown action",
    });
    expect(
      mockwright.handle(
        { action: "set", key: "payments.charge", type: "toString", value: "1" } as never,
        "t1",
      ),
    ).toEqual({ ok: false, error: "unknown behavior type" });
    expect(mockwright.handle({ action: "restore" } as never, "t1")).toEqual({
      ok: false,
      error: "missing key",
    });
    expect(
      mockwright.handle(
        { action: "set", key: "payments.createPaymentIntent", type: "bogus", value: "1" } as never,
        "t1",
      ),
    ).toEqual({ ok: false, error: "unknown behavior type" });
    expect(
      mockwright.handle(
        {
          action: "set",
          key: "payments.createPaymentIntent",
          type: "return",
          value: "not-devalue",
        },
        "t1",
      ),
    ).toEqual({ ok: false, error: "unparsable value" });
  });
});
