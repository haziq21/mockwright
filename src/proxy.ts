import { deliver } from "./behavior";
import type { Store } from "./store";

const getterCache = new WeakMap<object, Map<string, boolean>>();

function hasGetter(target: object, prop: string): boolean {
  let props = getterCache.get(target);
  if (!props) {
    props = new Map();
    getterCache.set(target, props);
  }
  let result = props.get(prop);
  if (result === undefined) {
    result = false;
    for (let current: object | null = target; current; current = Object.getPrototypeOf(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, prop);
      if (descriptor) {
        result = descriptor.get !== undefined;
        break;
      }
    }
    props.set(prop, result);
  }
  return result;
}

function join(parent: string, prop: string): string {
  return parent ? `${parent}.${prop}` : prop;
}

function wrapFunction<F extends Function>(
  fn: F,
  receiver: object | undefined,
  path: string,
  testId: string,
  store: Store,
): F {
  return new Proxy(fn, {
    apply(target, _thisArg, args) {
      const behavior = store.get(testId, path);
      return behavior ? deliver(behavior) : Reflect.apply(target, receiver, args);
    },
  });
}

export function wrapObject<T extends object>(
  dep: T,
  root: string,
  testId: string,
  store: Store,
): T {
  if (typeof dep === "function") return wrapFunction(dep, undefined, root, testId, store);

  // Wrapped children are reused while the underlying value is unchanged, so `a.b === a.b`.
  const children = new Map<string, { source: unknown; wrapped: unknown }>();
  const wrapChild = (prop: string, source: unknown, wrap: () => unknown): unknown => {
    const entry = children.get(prop);
    if (entry && entry.source === source) return entry.wrapped;
    const wrapped = wrap();
    children.set(prop, { source, wrapped });
    return wrapped;
  };

  return new Proxy(dep, {
    // No receiver is passed to Reflect.get: getters must run against the real target, or built-ins
    // (Map#size) and #private fields throw on the proxy.
    get(target, prop) {
      if (typeof prop === "symbol") return Reflect.get(target, prop);

      const path = join(root, prop);

      if (hasGetter(target, prop)) {
        const behavior = store.get(testId, path);
        return behavior ? deliver(behavior) : Reflect.get(target, prop);
      }

      const child = Reflect.get(target, prop);

      if (typeof child === "function") {
        return wrapChild(prop, child, () => wrapFunction(child, target, path, testId, store));
      }

      const behavior = store.get(testId, path);
      if (behavior) return deliver(behavior);

      if (child instanceof Promise) return child;

      if (child !== null && typeof child === "object") {
        return wrapChild(prop, child, () => wrapObject(child, path, testId, store));
      }

      return child;
    },
  });
}
