import * as devalue from "devalue";

export interface Transport {
  reduce(value: unknown): unknown;
  revive(data: any): unknown;
}

const errorTransport: Transport = {
  reduce(value) {
    if (!(value instanceof Error)) return false;
    const { name, message, stack, cause, ...extras } = value;
    return [name, message, stack, cause, extras];
  },
  revive([name, message, stack, cause, extras]: [string, string, string?, unknown?, object?]) {
    const error = new Error(message, cause === undefined ? undefined : { cause });
    Object.assign(error, extras, { name });
    if (stack !== undefined) error.stack = stack;
    return error;
  },
};

export type Codec = ReturnType<typeof codec>;

export function codec(transports: Record<string, Transport>) {
  // devalue tries reducers in order, so `Error` must come after its subclasses.
  const entries = Object.entries({ ...transports, Error: transports.Error ?? errorTransport });
  const reducers = Object.fromEntries(
    entries.map(([name, transport]) => [name, (value: unknown) => transport.reduce(value)]),
  );
  const revivers = Object.fromEntries(
    entries.map(([name, transport]) => [name, (data: unknown) => transport.revive(data)]),
  );
  return {
    stringify: (value: unknown) => devalue.stringify(value, reducers),
    parse: (text: string): unknown => devalue.parse(text, revivers),
  };
}
