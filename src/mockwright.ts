import type { APIRequestContext, BrowserContext, TestFixture } from "@playwright/test";
import { behaviors, isBehavior, type Behavior } from "./behavior";
import { proxy, type Mock } from "./proxy";
import { codec, type Codec, type Transport } from "./transport";
import type { ControlMessage, HandleResult, MwFor } from "./types";

export class Mockwright<Deps extends object> {
  #codec: Codec;
  #mocks = new Map<string, Map<string, Mock>>();

  constructor(transports: Record<string, Transport> = {}) {
    this.#codec = codec(transports);
  }

  wrap<K extends keyof Deps & string>(
    dep: Deps[K] & object,
    name: K,
    testId?: string | null,
  ): Deps[K] {
    if (!testId) return dep;
    return proxy(dep, name, (path) => this.#mocks.get(testId)?.get(path));
  }

  fixture({ endpoint = "/_mockwright", header = "x-test-id" } = {}): TestFixture<
    MwFor<Deps>,
    { request: APIRequestContext; context: BrowserContext }
  > {
    return async ({ request, context }, use, { testId }) => {
      await context.setExtraHTTPHeaders({ [header]: testId });

      const send = async (message: ControlMessage) => {
        const response = await request.post(endpoint, {
          data: message,
          headers: { [header]: testId },
        });
        const result: HandleResult | null = await response.json().catch(() => {
          throw new Error(`mockwright: ${endpoint} returned non-JSON (${response.status()})`);
        });
        if (!result?.ok) throw new Error(`mockwright: ${result?.error ?? response.statusText()}`);
      };

      await use((path) => {
        const set = (behavior: Behavior) => (value: unknown) =>
          send({ action: "set", path, behavior, value: this.#codec.stringify(value) });
        return {
          mockReturnValue: set("return"),
          mockThrownValue: set("throw"),
          mockResolvedValue: set("resolve"),
          mockRejectedValue: set("reject"),
          mockRestore: () => send({ action: "restore", path }),
        };
      });
      await send({ action: "reset" });
    };
  }

  handle(message: unknown, testId?: string | null): HandleResult {
    if (!testId) return { ok: false, error: "missing test id" };
    const { action, path, behavior, value } = (message ?? {}) as Record<string, unknown>;

    switch (action) {
      case "set": {
        if (typeof path !== "string") return { ok: false, error: "missing path" };
        if (!isBehavior(behavior)) return { ok: false, error: "unknown behavior" };
        if (typeof value !== "string") return { ok: false, error: "missing value" };
        let parsed: unknown;
        try {
          parsed = this.#codec.parse(value);
        } catch {
          return { ok: false, error: "unparsable value" };
        }
        let mocks = this.#mocks.get(testId);
        if (!mocks) this.#mocks.set(testId, (mocks = new Map()));
        mocks.set(path, () => behaviors[behavior](parsed));
        return { ok: true };
      }
      case "restore":
        if (typeof path !== "string") return { ok: false, error: "missing path" };
        this.#mocks.get(testId)?.delete(path);
        return { ok: true };
      case "reset":
        this.#mocks.delete(testId);
        return { ok: true };
      default:
        return { ok: false, error: "unknown action" };
    }
  }
}
