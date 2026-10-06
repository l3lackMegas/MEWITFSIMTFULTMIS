# Contributing

Bug reports, documentation improvements, and pull requests are welcome.

## Local development

Clone the repository and use Node.js 22+ and Bun 1.4.2:

```sh
npm ci
npm run check         # Type checking, Node tests, and build.
npm run test:bun      # Real HTTP integration and shutdown cleanup.
npm run test:package  # Install the tarball into a fresh consumer.
npm run example      # Run the example at localhost:3000.
```

## Issues and pull requests

For bugs, include your runtime and Elysia versions, a minimal reproduction, and
the expected behavior. For behavior changes, add a focused regression test and
update the relevant documentation. Documentation-only changes do not need new tests.

Use small CPU and memory settings in tests. Use the fake clock in
`test/engine.test.ts` for schedule and queue behavior instead of long real waits.
Existing integration tests cover actual request pacing.

Keep pull requests focused and describe how you verified the change. CI runs the
Node 22/24 checks, package consumer checks, and Bun integration test.

Package publishing is handled by maintainers; see the
[release guide](.github/RELEASING.md).
