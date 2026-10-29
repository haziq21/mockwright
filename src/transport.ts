export interface Transport {
  reduce(value: unknown): unknown;
  revive(data: any): unknown;
}

export const errorTransport: Transport = {
  reduce(value) {
    if (!(value instanceof Error)) return false;
    const { name, message, stack, cause, ...extras } = value;
    return [name, message, stack, cause, extras];
  },
  revive([name, message, stack, cause, extras]: [
    string,
    string,
    string | undefined,
    unknown,
    object,
  ]) {
    const error = Object.assign(
      cause === undefined ? new Error(message) : new Error(message, { cause }),
      extras,
      { name },
    );
    if (stack !== undefined) error.stack = stack;
    return error;
  },
};

export function toDevalueFormat(transports: Record<string, Transport>) {
  const reducers: Record<string, (value: any) => unknown> = {};
  const revivers: Record<string, (data: any) => unknown> = {};
  for (const [name, transport] of Object.entries(transports)) {
    // Wrap the functions to maintain `this`
    reducers[name] = (value) => transport.reduce(value);
    revivers[name] = (data) => transport.revive(data);
  }
  return { reducers, revivers };
}
