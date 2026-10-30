export type Mock = () => unknown;
export type Lookup = (path: string) => Mock | undefined;

function isGetter(target: object, prop: string): boolean {
  for (let current: object | null = target; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, prop);
    if (descriptor) return descriptor.get !== undefined;
  }
  return false;
}

function proxyFunction<F extends Function>(fn: F, path: string, lookup: Lookup, self?: object): F {
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      const mock = lookup(path);
      return mock ? mock() : Reflect.apply(target, self ?? thisArg, args);
    },
  });
}

export function proxy<T extends object>(dep: T, path: string, lookup: Lookup): T {
  if (typeof dep === "function") return proxyFunction(dep, path, lookup);

  const cache = new Map<string, { source: unknown; proxied: unknown }>();
  const cached = (prop: string, source: unknown, create: () => unknown) => {
    const hit = cache.get(prop);
    if (hit && hit.source === source) return hit.proxied;
    const proxied = create();
    cache.set(prop, { source, proxied });
    return proxied;
  };

  return new Proxy(dep, {
    get(target, prop) {
      if (typeof prop === "symbol") return Reflect.get(target, prop);

      const childPath = `${path}.${prop}`;
      const mock = lookup(childPath);
      if (isGetter(target, prop)) return mock ? mock() : Reflect.get(target, prop);

      const child = Reflect.get(target, prop);
      if (typeof child === "function") {
        return cached(prop, child, () => proxyFunction(child, childPath, lookup, target));
      }
      if (mock) return mock();
      if (typeof child !== "object" || child === null || child instanceof Promise) return child;
      return cached(prop, child, () => proxy(child, childPath, lookup));
    },
  });
}
