const DELIVER = {
  return: (value: unknown) => value,
  throw: (value: unknown) => {
    throw value;
  },
  resolve: (value: unknown) => Promise.resolve(value),
  reject: (value: unknown) => Promise.reject(value),
};

export type MockBehaviorType = keyof typeof DELIVER;

export interface MockBehavior {
  type: MockBehaviorType;
  value: unknown;
}

export function isBehaviorType(type: unknown): type is MockBehaviorType {
  return typeof type === "string" && Object.hasOwn(DELIVER, type);
}

export function deliver({ type, value }: MockBehavior): unknown {
  return DELIVER[type](value);
}
