export const behaviors = {
  return: (value: unknown) => value,
  throw: (value: unknown) => {
    throw value;
  },
  resolve: (value: unknown) => Promise.resolve(value),
  reject: (value: unknown) => Promise.reject(value),
};

export type Behavior = keyof typeof behaviors;

export function isBehavior(value: unknown): value is Behavior {
  return typeof value === "string" && Object.hasOwn(behaviors, value);
}
