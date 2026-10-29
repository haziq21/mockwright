import type { APIRequestContext, BrowserContext, TestFixture } from "@playwright/test";
import * as devalue from "devalue";
import type { HandleResult, MockControlMessage, MwCallable } from "./types";
import { isBehaviorType, type MockBehaviorType } from "./behavior";
import { errorTransport, toDevalueFormat, type Transport } from "./transport";
import { wrapObject } from "./proxy";
import { Store } from "./store";

type FixtureArgs = { request: APIRequestContext; context: BrowserContext };

export class Mockwright<Deps extends object> {
  #store = new Store();
  #reducers: Record<string, (value: any) => unknown>;
  #revivers: Record<string, (data: any) => unknown>;

  constructor(transports: Record<string, Transport> = {}) {
    // `Error` goes last unless overridden: devalue tries reducers in order, and an earlier `Error`
    // would swallow custom subclasses.
    ({ reducers: this.#reducers, revivers: this.#revivers } = toDevalueFormat({
      ...transports,
      Error: transports.Error ?? errorTransport,
    }));
  }

  wrap<K extends keyof Deps & string>(
    dep: Deps[K] & object,
    name: K,
    testId?: string | null,
  ): Deps[K] {
    if (!testId) return dep;
    return wrapObject(dep, name, testId, this.#store) as Deps[K];
  }

  fixture(
    options: { endpoint?: string; header?: string } = {},
  ): TestFixture<MwCallable<Deps>, FixtureArgs> {
    const endpoint = options.endpoint ?? "/_mockwright";
    const header = options.header ?? "x-test-id";
    return async ({ request, context }, use, testInfo) => {
      const testId = testInfo.testId;
      await context.setExtraHTTPHeaders({ [header]: testId });

      const send = async (message: MockControlMessage): Promise<void> => {
        const response = await request.post(endpoint, {
          data: message,
          headers: { [header]: testId },
        });
        let body: HandleResult | undefined;
        try {
          body = (await response.json()) as HandleResult;
        } catch {
          throw new Error(`mockwright: ${endpoint} returned non-JSON (${response.status()})`);
        }
        if (!body?.ok) throw new Error(`mockwright: ${body?.error ?? response.statusText()}`);
      };

      await use(this.#client(send));
      await send({ action: "reset" });
    };
  }

  #client(send: (message: MockControlMessage) => Promise<void>): MwCallable<Deps> {
    const reducers = this.#reducers;
    return (path) => {
      const set = (type: MockBehaviorType) => (value: unknown) =>
        send({ action: "set", key: path, type, value: devalue.stringify(value, reducers) });
      return {
        mockReturnValue: set("return"),
        mockResolvedValue: set("resolve"),
        mockRejectedValue: set("reject"),
        mockThrownValue: set("throw"),
        mockRestore: () => send({ action: "restore", key: path }),
      };
    };
  }

  handle(body: MockControlMessage, testId: string | null | undefined): HandleResult {
    if (!testId) return { ok: false, error: "missing test id" };
    if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };

    switch (body.action) {
      case "set": {
        if (typeof body.key !== "string") return { ok: false, error: "missing key" };
        if (!isBehaviorType(body.type)) return { ok: false, error: "unknown behavior type" };
        if (typeof body.value !== "string") return { ok: false, error: "missing value" };

        let value: unknown;
        try {
          value = devalue.parse(body.value, this.#revivers);
        } catch {
          return { ok: false, error: "unparsable value" };
        }

        this.#store.set(testId, body.key, { type: body.type, value });
        return { ok: true };
      }
      case "restore": {
        if (typeof body.key !== "string") return { ok: false, error: "missing key" };
        this.#store.restore(testId, body.key);
        return { ok: true };
      }
      case "reset": {
        this.#store.reset(testId);
        return { ok: true };
      }
      default:
        return { ok: false, error: "unknown action" };
    }
  }
}
