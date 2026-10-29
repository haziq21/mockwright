import type { MockBehaviorType } from "./behavior";
import type { Mockwright } from "./mockwright";

export type MockControlMessage =
  | { action: "set"; key: string; type: MockBehaviorType; value: string }
  | { action: "restore"; key: string }
  | { action: "reset" };

export type HandleResult = { ok: true } | { ok: false; error: string };

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7];

export type Paths<T, D extends number = 5> = D extends never
  ? never
  : {
      [K in keyof T & string]: T[K] extends Function | Promise<any>
        ? K
        : T[K] extends object
          ? K | `${K}.${Paths<T[K], Prev[D]>}`
          : K;
    }[keyof T & string];

export type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
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

export type MwCallable<D extends object> = <P extends Paths<D>>(path: P) => MockHandle<D, P>;

export type Mw<W extends Mockwright<any>> = W extends Mockwright<infer D> ? MwCallable<D> : never;
