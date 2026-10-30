import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { request, type TestInfo } from "@playwright/test";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { Mockwright, type Mw } from "../src";

class PaymentError extends Error {
  override name = "PaymentError";
}

class Payments {
  async charge() {
    return "real";
  }
}

const mockwright = new Mockwright<{ payments: Payments }>({
  PaymentError: {
    reduce: (value: unknown) => value instanceof PaymentError && value.message,
    revive: (message: string) => new PaymentError(message),
  },
});
const payments = mockwright.wrap(new Payments(), "payments", "t1");

const routes: Record<string, (body: unknown, testId: string) => [number, string]> = {
  "/_mockwright": (body, testId) => [200, JSON.stringify(mockwright.handle(body, testId))],
  "/html": () => [404, "<html>"],
  "/error": () => [200, JSON.stringify({ ok: false, error: "nope" })],
  "/empty": () => [400, "{}"],
};

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const [status, text] = routes[req.url!]!(JSON.parse(body), req.headers["x-test-id"] as string);
  res.writeHead(status).end(text);
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const api = await request.newContext({
  baseURL: `http://localhost:${(server.address() as AddressInfo).port}`,
});

afterAll(async () => {
  await api.dispose();
  server.close();
});

async function run(body: (mw: Mw<typeof mockwright>) => Promise<void>, endpoint?: string) {
  const headers: Record<string, string> = {};
  const context = { setExtraHTTPHeaders: async (value: object) => Object.assign(headers, value) };
  await mockwright.fixture(endpoint ? { endpoint } : {})(
    { request: api, context: context as never },
    body,
    { testId: "t1" } as TestInfo,
  );
  return headers;
}

describe("fixture", () => {
  it("sets test id header", async () => {
    expect(await run(async () => {})).toEqual({ "x-test-id": "t1" });
  });

  it("mocks and resets", async () => {
    await run(async (mw) => {
      await mw("payments.charge").mockRejectedValue(new PaymentError("declined"));
      await expect(payments.charge()).rejects.toThrow(PaymentError);
      await mw("payments.charge").mockRestore();
      await expect(payments.charge()).resolves.toBe("real");
      await mw("payments.charge").mockResolvedValue("mocked");
    });
    await expect(payments.charge()).resolves.toBe("real");
  });

  it.each([
    ["/html", "mockwright: /html returned non-JSON (404)"],
    ["/error", "mockwright: nope"],
    ["/empty", "mockwright: Bad Request"],
  ])("fails on %s", async (endpoint, error) => {
    await expect(run(async () => {}, endpoint)).rejects.toThrow(error);
  });
});
