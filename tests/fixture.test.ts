import type { TestInfo } from "@playwright/test";
import { describe, expect, it } from "vite-plus/test";
import { Mockwright } from "../src/mockwright";
import type { MockControlMessage } from "../src/types";

class PaymentsService {
  createPaymentIntent(_orderId: string) {
    return "pi_src_123";
  }
}

interface Deps {
  payments: PaymentsService;
}

const mockwright = new Mockwright<Deps>();

type Respond = {
  ok: () => boolean;
  json: () => Promise<unknown>;
  statusText: () => string;
  status: () => number;
};

function fakes(respond: Respond) {
  const posts: Array<{ url: string; data: unknown; headers: Record<string, string> }> = [];
  const headers: Record<string, string> = {};
  const request = {
    post: async (url: string, options: { data: unknown; headers: Record<string, string> }) => {
      posts.push({ url, data: options.data, headers: options.headers });
      return respond;
    },
  };
  const context = {
    setExtraHTTPHeaders: async (value: Record<string, string>) => {
      Object.assign(headers, value);
    },
  };
  return { posts, headers, request, context };
}

const okRespond: Respond = {
  ok: () => true,
  json: async () => ({ ok: true }),
  statusText: () => "OK",
  status: () => 200,
};

describe("fixture", () => {
  it("sets the test id header, sends mocks, and resets", async () => {
    const { request, context, headers, posts } = fakes(okRespond);
    const fixture = mockwright.fixture();
    await fixture(
      { request: request as never, context: context as never },
      async (mw) => {
        expect(headers["x-test-id"]).toBe("t1");
        await mw("payments.createPaymentIntent").mockReturnValue("pi_test_123");
      },
      { testId: "t1" } as TestInfo,
    );
    expect(posts).toHaveLength(2);
    expect(posts[0]?.url).toBe("/_mockwright");
    expect(posts[0]?.headers["x-test-id"]).toBe("t1");
    expect((posts[0]?.data as MockControlMessage | undefined)?.action).toBe("set");
    expect((posts[1]?.data as MockControlMessage | undefined)?.action).toBe("reset");
  });

  it("keeps sending the test-id header on every mock call", async () => {
    const { request, context, posts } = fakes(okRespond);
    const fixture = mockwright.fixture();
    await fixture(
      { request: request as never, context: context as never },
      async (mw) => {
        await mw("payments.createPaymentIntent").mockReturnValue("pi_test_123");
        await mw("payments.createPaymentIntent").mockRestore();
      },
      { testId: "t1" } as TestInfo,
    );
    expect(posts).toHaveLength(3);
    const restore = posts[1]?.data as Extract<MockControlMessage, { action: "restore" }>;
    expect(restore.action).toBe("restore");
    expect(restore.key).toBe("payments.createPaymentIntent");
    expect(posts[1]?.headers["x-test-id"]).toBe("t1");
  });

  it("fails on ok:false inside a 200 body", async () => {
    const { request, context } = fakes({
      ...okRespond,
      json: async () => ({ ok: false, error: "unknown behavior type" }),
    });
    const fixture = mockwright.fixture();
    await expect(
      fixture(
        { request: request as never, context: context as never },
        async (mw) => {
          await mw("payments.createPaymentIntent").mockReturnValue("pi_test_123");
        },
        { testId: "t1" } as TestInfo,
      ),
    ).rejects.toThrow("mockwright: unknown behavior type");
  });

  it("fails on non-JSON bodies, stating the endpoint and status", async () => {
    const { request, context } = fakes({
      ...okRespond,
      ok: () => false,
      status: () => 404,
      json: async () => JSON.parse("<html>Not Found</html>"),
    });
    const fixture = mockwright.fixture();
    await expect(
      fixture({ request: request as never, context: context as never }, async () => {}, {
        testId: "t1",
      } as TestInfo),
    ).rejects.toThrow("mockwright: /_mockwright returned non-JSON (404)");
  });

  it("falls back to the status text when a failing body has no error", async () => {
    const { request, context } = fakes({
      ...okRespond,
      ok: () => false,
      statusText: () => "Bad Request",
      json: async () => ({}),
    });
    const fixture = mockwright.fixture();
    await expect(
      fixture({ request: request as never, context: context as never }, async () => {}, {
        testId: "t1",
      } as TestInfo),
    ).rejects.toThrow("mockwright: Bad Request");
  });
});
