import type { MockBehavior } from "./behavior";

export class Store {
  #scopes = new Map<string, Map<string, MockBehavior>>();

  get(testId: string, key: string): MockBehavior | undefined {
    return this.#scopes.get(testId)?.get(key);
  }

  set(testId: string, key: string, behavior: MockBehavior): void {
    let scope = this.#scopes.get(testId);
    if (!scope) {
      scope = new Map();
      this.#scopes.set(testId, scope);
    }
    scope.set(key, behavior);
  }

  restore(testId: string, key: string): void {
    this.#scopes.get(testId)?.delete(key);
  }

  reset(testId: string): void {
    this.#scopes.delete(testId);
  }
}
