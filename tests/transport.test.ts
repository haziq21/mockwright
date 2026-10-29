import * as devalue from "devalue";
import { describe, expect, it } from "vite-plus/test";
import { errorTransport, toDevalueFormat } from "../src/transport";

class StripeCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeCardError";
  }
}

class UnexpectedResponseError extends Error {
  response: Response | undefined;
  constructor(message: string, options?: { response?: Response }) {
    super(message);
    this.name = "UnexpectedResponseError";
    this.response = options?.response;
  }
}

describe("serialization", () => {
  it("round-trips a plain Error by default", () => {
    const { reducers, revivers } = toDevalueFormat({ Error: errorTransport });
    const revived = devalue.parse(devalue.stringify(new Error("boom"), reducers), revivers);
    expect(revived).toBeInstanceOf(Error);
    expect(revived.message).toBe("boom");
    expect(revived.name).toBe("Error");
  });

  it("revives unregistered subclasses as base Error with name preserved", () => {
    const { reducers, revivers } = toDevalueFormat({ Error: errorTransport });
    const revived = devalue.parse(
      devalue.stringify(new StripeCardError("declined"), reducers),
      revivers,
    );
    expect(revived).toBeInstanceOf(Error);
    expect(revived.name).toBe("StripeCardError");
    expect(revived).not.toBeInstanceOf(StripeCardError);
  });

  it("round-trips an error's cause, including a nested error", () => {
    const { reducers, revivers } = toDevalueFormat({ Error: errorTransport });
    const original = new Error("outer", { cause: new Error("inner", { cause: "root" }) });
    const revived = devalue.parse(devalue.stringify(original, reducers), revivers);
    expect(revived.cause).toBeInstanceOf(Error);
    expect(revived.cause.message).toBe("inner");
    expect(revived.cause.cause).toBe("root");
    expect("cause" in new Error("plain")).toBe(false);
    expect(
      "cause" in devalue.parse(devalue.stringify(new Error("plain"), reducers), revivers),
    ).toBe(false);
  });

  it("supports a custom transport for types with un-serializable members", () => {
    const { reducers, revivers } = toDevalueFormat({
      UnexpectedResponseError: {
        reduce: (value: unknown) =>
          value instanceof UnexpectedResponseError &&
          ([
            value.name,
            value.message,
            value.stack,
            value.response?.status,
            value.response?.statusText,
          ] as const),
        revive: ([name, message, stack, status, statusText]) => {
          const error = new UnexpectedResponseError(message);
          error.name = name;
          if (stack !== undefined) error.stack = stack;
          if (status !== undefined) {
            error.response = new Response(
              null,
              statusText === undefined ? { status } : { status, statusText },
            );
          }
          return error;
        },
      },
    });

    const original = new UnexpectedResponseError("Received 500", {
      response: new Response(null, { status: 500, statusText: "Server Error" }),
    });
    const revived = devalue.parse(devalue.stringify(original, reducers), revivers);
    expect(revived).toBeInstanceOf(UnexpectedResponseError);
    expect((revived as UnexpectedResponseError).response?.status).toBe(500);
  });
});
