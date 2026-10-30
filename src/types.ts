import type { Behavior } from "./behavior";
import type { Mockwright } from "./mockwright";

export type ControlMessage =
  | { action: "set"; path: string; behavior: Behavior; value: string }
  | { action: "restore"; path: string }
  | { action: "reset" };

export type HandleResult = { ok: true } | { ok: false; error: string };

export type Paths<T, Depth extends unknown[] = []> = Depth["length"] extends 5
  ? never
  : {
      [K in keyof T & string]:
        | K
        | (T[K] extends Function | Promise<unknown>
            ? never
            : T[K] extends object
              ? `${K}.${Paths<T[K], [...Depth, unknown]>}`
              : never);
    }[keyof T & string];

type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

export type MockValue<T, P extends string> =
  PathValue<T, P> extends (...args: any[]) => infer R ? R : PathValue<T, P>;

export interface MockHandle<T, P extends string> {
  mockReturnValue(value: MockValue<T, P>): Promise<void>;
  mockThrownValue(error: unknown): Promise<void>;
  mockResolvedValue(value: Awaited<MockValue<T, P>>): Promise<void>;
  mockRejectedValue(error: unknown): Promise<void>;
  mockRestore(): Promise<void>;
}

export type MwFor<Deps> = <P extends Paths<Deps>>(path: P) => MockHandle<Deps, P>;

export type Mw<W extends Mockwright<any>> = W extends Mockwright<infer Deps> ? MwFor<Deps> : never;
