# Mockwright

Mockwright is a library for mocking server-side function calls in Playwright tests.

## Installation

```sh
npm i -D mockwright
```

## Usage

This example uses SvelteKit, but Mockwright works with any framework.

1. Instantiate `Mockwright`, typed against your mockable objects.

```ts
// src/lib/server/mockwright.ts
import { Mockwright } from "mockwright";
import type { Resend } from "resend";

type MockDeps = {
  resend: Resend;
};

export const mockwright = new Mockwright<MockDeps>();
```

2. Wrap your mockable objects with Mockwright's proxy.

```ts
// src/hooks.server.ts
import type { Handle } from "@sveltejs/kit";
import { Resend } from "resend";
import { env } from "$env/dynamic/private";
import { mockwright } from "$lib/server/mockwright";

export const handle: Handle = async ({ event, resolve }) => {
  const testId = event.request.headers.get("x-test-id");
  // App code should use locals.resend to access the Resend instance.
  event.locals.resend = mockwright.wrap(new Resend(env.RESEND_API_KEY), "resend", testId);
  return resolve(event);
};
```

3. Create the test-only endpoint for Mockwright to control server-side mocks.

```ts
// src/routes/_mockwright/+server.ts
import { dev } from "$app/environment";
import { json } from "@sveltejs/kit";
import { mockwright } from "$lib/server/mockwright";

export const POST = async ({ request }) => {
  if (!dev) return new Response(null, { status: 404 });
  const body = await request.json();
  return json(mockwright.handle(body, request.headers.get("x-test-id")));
};
```

4. Set up the `mw` Playwright fixture.

```ts
// tests/fixtures.ts
import { test as base } from "@playwright/test";
import { mockwright } from "$lib/server/mockwright";
import type { Mw } from "mockwright";

export const test = base.extend<{ mw: Mw<typeof mockwright> }>({ mw: mockwright.fixture() });
export { expect } from "@playwright/test";
```

5. Mock server-side calls.

```ts
// tests/checkout.spec.ts
import { test, expect } from "./fixtures";

test("sends the order confirmation email", async ({ mw, page }) => {
  await mw("resend.emails.send").mockResolvedValue({ data: { id: "re_test_789" }, error: null });

  await page.goto("/checkout");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Order confirmed")).toBeVisible();
});
```

Supported `mw(...)` methods:

- `mockReturnValue(value)`
- `mockResolvedValue(value)`
- `mockThrownValue(value)`
- `mockRejectedValue(value)`
- `mockRestore()`

Fixture behaviours are reset after each test. Note that `mw(...)` can be used in `test.beforeEach()` but not `test.beforeAll()`, since Mockwright needs `testInfo.testId`.

## Custom transports

Mocks cross the HTTP boundary and must therefore be serialisable. Mockwright uses [devalue](https://github.com/sveltejs/devalue) for (de)serialisation.

```ts
// src/lib/server/mockwright.ts
import { Mockwright } from "mockwright";
import type { Resend } from "resend";
import { RateLimitError } from "$lib/errors";

type MockDeps = {
  resend: Resend;
};

export const mockwright = new Mockwright<MockDeps>({
  RateLimitError: {
    reduce: (value) =>
      value instanceof RateLimitError && [value.name, value.message, value.stack, value.retryAfter],
    revive: ([name, message, stack, retryAfter]) => {
      const error = new RateLimitError(message, retryAfter);
      error.name = name;
      error.stack = stack;
      return error;
    },
  },
});
```

```ts
// tests/checkout.spec.ts
await mw("resend.emails.send").mockRejectedValue(new RateLimitError("Too many requests", 30));
```

Each transport pairs a `reduce` (return `false` for values it does not own) with a `revive`. Everything that devalue handles natively (plain JSON objects, `Date`, `Map`, `Set`, `BigInt`, `RegExp`, `undefined`) plus `Error` are supported by default.
