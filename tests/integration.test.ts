import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { TestInfo, APIRequestContext } from "@playwright/test";
import { Mockwright } from "../src";
import type { MockControlMessage, MwCallable } from "../src/types";

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

interface Deps {
  payments: PaymentsService;
}

describe("integration", () => {
  const mockwright = new Mockwright<Deps>({
    PaymentFailedError: {
      reduce: (value: unknown) =>
        value instanceof PaymentFailedError && ([value.name, value.message, value.stack] as const),
      revive: ([name, message, stack]) => {
        const error = new PaymentFailedError(message);
        error.name = name;
        if (stack !== undefined) error.stack = stack;
        return error;
      },
    },
  });
  const wrapped = mockwright.wrap(new PaymentsService(), "payments", "e2e-1");
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as MockControlMessage;
        const result = mockwright.handle(body, req.headers["x-test-id"] as string);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(result));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  const request = {
    post: async (endpoint: unknown, opts: { data: unknown; headers: Record<string, string> }) =>
      await fetch(endpoint as string, {
        method: "POST",
        headers: opts.headers,
        body: JSON.stringify(opts.data),
      }),
  } as never as APIRequestContext;
  const context = { setExtraHTTPHeaders: async () => {} } as never as {
    setExtraHTTPHeaders: (value: Record<string, string>) => Promise<void>;
  };

  function through(body: (mw: MwCallable<Deps>) => Promise<void>): Promise<void> {
    const fixture = mockwright.fixture({
      endpoint: `http://localhost:${port}/_mockwright`,
      header: "x-test-id",
    });
    return fixture({ request, context } as never, body as never, { testId: "e2e-1" } as TestInfo);
  }

  it("mocks, passes through, and restores", async () => {
    expect(wrapped.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_src_123");

    await through(async (mw) => {
      await mw("payments.createPaymentIntent").mockReturnValue("pi_test_ok");
      expect(wrapped.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_test_ok");

      await mw("payments.createPaymentIntent").mockRestore();
      expect(wrapped.createPaymentIntent({ orderId: "o1", totalCents: 1999 })).toBe("pi_src_123");
    });
  });

  it("revives a custom error across the wire", async () => {
    await through(async (mw) => {
      await mw("payments.charge").mockRejectedValue(new PaymentFailedError("mocked-decline"));
      await expect(wrapped.charge()).rejects.toBeInstanceOf(PaymentFailedError);
      await expect(wrapped.charge()).rejects.toThrow("mocked-decline");
    });
  });
});
