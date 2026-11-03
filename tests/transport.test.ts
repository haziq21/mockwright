import { describe, expect, it } from "vite-plus/test";
import { codec } from "../src/transport";

class CardError extends Error {
  override name = "CardError";
}

class ResponseError extends Error {
  constructor(public response: Response) {
    super(response.statusText);
  }
}

const roundTrip = (value: unknown, transports = {}) => {
  const { stringify, parse } = codec(transports);
  return parse(stringify(value)) as any;
};

describe("codec", () => {
  it("round-trips errors", () => {
    const error = roundTrip(Object.assign(new Error("boom"), { code: 42 }));
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "Error", message: "boom", code: 42 });
  });

  it("keeps unregistered subclass names", () => {
    const error = roundTrip(new CardError("declined"));
    expect(error).not.toBeInstanceOf(CardError);
    expect(error.name).toBe("CardError");
  });

  it("round-trips causes", () => {
    const error = roundTrip(new Error("outer", { cause: new Error("inner", { cause: "root" }) }));
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause.cause).toBe("root");
    expect("cause" in roundTrip(new Error("plain"))).toBe(false);
  });

  it("uses custom transports", () => {
    const error = roundTrip(new ResponseError(new Response(null, { status: 500 })), {
      ResponseError: {
        reduce: (value: unknown) => value instanceof ResponseError && value.response.status,
        revive: (status: number) => new ResponseError(new Response(null, { status })),
      },
    });
    expect(error).toBeInstanceOf(ResponseError);
    expect(error.response.status).toBe(500);
  });
});
