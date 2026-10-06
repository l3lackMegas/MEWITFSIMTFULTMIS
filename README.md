# MY ELYSIA WEB IS TOO FAST SO I MADE THIS FUCKING USELESS LIBRARY TO MAKE IT SLOWER

**MEWITFSIMTFULTMIS** — Is Elysia too fast? Unfortunately, we fixed that.

Other libraries reduce latency. This one gives your loading spinner job security.
Choose between doing nothing, buying RAM to store nonsense, and making your CPU
answer questions nobody asked. Licensed under WTFPL, because even the license
wants nothing to do with your decisions.

## Install → import → .use → regret

```sh
npm i elysia mewitfsimtfultmis
```

```ts
import { Elysia } from 'elysia'
import slow from 'mewitfsimtfultmis'

new Elysia()
  .use(slow({ delaySeconds: 2 }))
  .get('/', () => 'Two seconds of your life. For this.')
  .listen(3000)
```

Without options, every request gets a **one-second delay**, with no additional CPU
burning or RAM allocation. This is an ESM package with TypeScript declarations,
tested against Elysia 1.4.30, Node.js 22/24 through `app.handle()`, and Bun 1.4.2
through a real HTTP server. The `.listen()` examples use Bun; use the usual Elysia
adapter when serving HTTP on Node.

## Pick your preferred waste of resources

```ts
new Elysia().use(slow({
  delaySeconds: 0.5,       // Wait 500 ms asynchronously. Waste time, spare the CPU.
  memoryMegabytes: 64,     // Keep 64 MiB of Uint8Array buffers filled with 0xa5.
  cpuMilliseconds: 25,    // Spend 25 ms per request calculating absolutely nothing useful.
}))
```

Use each mode separately or combine them. Set `delaySeconds: 0` for RAM/CPU only.
There are no runtime dependencies beyond the `elysia` peer dependency.

| Option | Default | Available disappointment |
| --- | --- | --- |
| `delaySeconds` | `1` | 0–86400 seconds; fractions supported |
| `memoryMegabytes` | `0` | 0–1024 **MiB** per controller; fractions supported |
| `cpuMilliseconds` | `0` | 0–1000 ms per request; fractions supported |
| `ramp` | `null` | `{ start, end }` to get progressively worse |
| `maxPending` | `1000` | 1–100000 waiting requests; overflow gets `503` |
| `enabled` | `true` | Set to `false` to stop the slowdown, drain the queue, and release RAM references |

Negative values, `NaN`, `Infinity`, malformed dates, and reversed date ranges throw
when creating or updating the configuration. The stupidity should be intentional,
not a typo.

## Scheduled enshittification

Start the month with a fast server. Finish it with a nostalgic dial-up experience.

```ts
import { Elysia } from 'elysia'
import slow from 'mewitfsimtfultmis'

new Elysia()
  .use(slow({
    delaySeconds: 2,
    memoryMegabytes: 128,
    cpuMilliseconds: 50,
    ramp: {
      start: '2026-11-01T00:00:00+07:00',
      end:   '2026-12-01T00:00:00+07:00',
    },
  }))
  .get('/', () => 'You waited all that time for this?')
  .listen(3000)
```

`start` and `end` accept a `Date`, Unix epoch **milliseconds**, or an ISO timestamp
with an explicit `Z` or offset. Bare dates such as `2026-11-01` are rejected.
Timezone ambiguity does not need to be the second joke in this package.

```text
progress = clamp((now - start) / (end - start), 0, 1)
delay    = delaySeconds × progress
RAM      = memoryMegabytes × progress
CPU      = cpuMilliseconds × progress
spacing  = 1000 ms × progress
```

| Time | Configured delay/RAM/CPU | Minimum request admission spacing |
| --- | --- | --- |
| Before or exactly at the start | 0% | None |
| Halfway through | 50% | 500 ms, approximately 2 req/s maximum |
| At or after the end | 100% | 1000 ms, 1 req/s maximum |

**The 1 req/s limit applies to admissions through the hook, per controller, in one
process.** All requests share a FIFO queue. After an idle period, the first request
can pass as soon as its delay and CPU work finish. Subsequent admissions are at
least one second apart at the end of the ramp. No tokens accumulate to unleash a
catch-up burst when the event loop wakes up.

The delay is a minimum wait measured from queue entry, so requests can wait
concurrently. CPU work runs afterward and may add more latency. Response completion
is not guaranteed to happen once per second: your handler may already be terrible.
Queue overflow returns `503` immediately and does not count as an admission into
the application.

Four workers have four independent queues and can collectively admit up to four
requests per second. There is no distributed limiter hiding in here. A `ramp`
enables the admission gate even if delay, RAM, and CPU costs are all zero. Without
`ramp`, only the configured costs apply; there is no rate gate.

## Change your mind at runtime

```ts
import { Elysia } from 'elysia'
import { createSlowdown } from 'mewitfsimtfultmis'

const misery = createSlowdown({ delaySeconds: 0.2 })
const app = new Elysia()
  .use(misery.plugin)
  .get('/', () => 'still waiting?')
  .listen(3000)

// Call from your own config watcher, CLI, or control plane.
misery.configure({
  delaySeconds: 2,
  memoryMegabytes: 32,
  cpuMilliseconds: 10,
  ramp: { start: Date.now(), end: Date.now() + 3_600_000 },
})

console.log(misery.snapshot())
// progress, delayMilliseconds, memoryBytes, allocatedBytes,
// cpuMilliseconds, intervalMilliseconds, pending, config, disposed

misery.configure({ ramp: null })     // Remove the schedule; keep the configured costs.
misery.configure({ enabled: false }) // Fast again. Deeply disappointing.
misery.configure({ enabled: true })  // Resume making questionable decisions.

await app.stop() // Automatically disposes the controller.
// Or call misery.dispose() yourself when you no longer need it.
```

`configure()` applies a partial update. Replacing `ramp` requires both `start` and
`end`. Configuration is validated before live state changes, and waiting requests
are recalculated against the new settings. CPU work already in progress finishes
before an update can run, because it really is blocking the thread.

Lowering `maxPending` preserves requests already queued and rejects new arrivals
until the queue falls below the limit. `snapshot()` provides read-only information;
it is not a configuration backdoor.

`dispose()` is idempotent: it releases RAM references, cancels the timer, and settles
waiting requests with `503`. A disposed controller cannot be reused. Make another
one if you miss the suffering.

## Details we regrettably took seriously

- The plugin uses Elysia's global `onRequest` lifecycle. It covers nested plugins,
  routes declared before `.use()`, and even `404` requests, while preserving normal
  bodies, validation, and responses. An earlier hook that immediately returns a
  response can bypass it, so put `.use()` near the beginning.
- Each controller has its own plugin identity. Reusing the same plugin instance is
  deduplicated. Sharing a controller across applications also shares its queue and
  RAM; stopping either application disposes that controller.
- RAM is a **shared pool per controller**, not an allocation multiplied by request
  count. Buffers are filled in chunks of at most 1 MiB. The pool follows the ramp
  while requests are pending and releases references when reduced, disabled, or
  stopped. There is no background allocation while idle. GC and the OS may not
  return RSS immediately.
- CPU mode runs a real busy loop on the event loop. It is not `sleep()` wearing a
  fake mustache. Other requests in the process are affected too. The setting is an
  approximate loop duration in milliseconds, not a CPU utilization percentage.
- If the runtime signals cancellation through `Request.signal`, the request is
  removed from the queue and receives `499`.
- Wall-clock time determines ramp progress; a monotonic clock controls request
  spacing. No timers remain after the queue empties or the controller is disposed.
  Queue overflow returns `503` with `Retry-After: 1`.

RAM and CPU costs are real. If you deploy this to production and your server gets
slower, congratulations: the acceptance test passed.

## Development

Use Node.js 22+ and Bun 1.4.2 for the HTTP integration test.

```sh
npm ci
npm run check         # Strict types, unit/integration tests, and build.
npm run test:bun      # Real Bun HTTP server, including cleanup on stop.
npm run test:package  # Pack, install into a fresh consumer, verify import/.use/types.
npm run example      # Deteriorate over one minute at localhost:3000.
```

Fake-clock tests cover date boundaries, FIFO pacing, runtime updates, cancellation,
and late timers. Real-clock tests verify Elysia integration and HTTP pacing at the
end of the ramp. CI does not intentionally allocate gigabytes of RAM. GitHub has
suffered enough.

## Make it npm's problem

Repository: [l3lackMegas/MEWITFSIMTFULTMIS](https://github.com/l3lackMegas/MEWITFSIMTFULTMIS)

- `ci.yml` checks Node 22/24, a fresh package consumer, and Bun HTTP integration on
  pushes and pull requests.
- `publish.yml` runs on `vX.Y.Z` tags, checks the version, builds, tests, verifies the
  tarball, and publishes through OIDC. It uses Node 24, a compatible npm CLI,
  GitHub-hosted runners, and `id-token: write`. No permanent `NPM_TOKEN` to hide
  under the carpet.

### Initial bootstrap

For a new package that does not exist on npm yet, its owner must log in and publish
once from this checkout:

```sh
npm login
npm ci
npm run test:bun
npm publish --access public
```

`prepublishOnly` checks types, tests, the build, and the installed package before
publishing. npm may require browser authentication or the account owner's 2FA.

Then configure **Trusted Publisher → GitHub Actions** in the npm package settings:

| Field | Value |
| --- | --- |
| Organization or user | `l3lackMegas` |
| Repository | `MEWITFSIMTFULTMIS` |
| Workflow filename | `publish.yml` |
| Environment name | Leave empty; this workflow does not specify an environment |
| Allowed actions | Allow `npm publish` |

The GitHub owner does not have to match the npm username. Do not include
`.github/workflows/` in the workflow filename, or tag a version already published.
Trusted publishing generates provenance automatically for public repositories and
packages. The account settings must actually be configured; YAML is not a wizard.

### Subsequent releases

From a clean working tree with your changes committed:

```sh
npm version patch
git push origin main --follow-tags
```

The tag must match `package.json`. This workflow publishes stable versions to
`latest`. Never try to republish the same version. npm remembers your mistakes.

## References

Implementation follows [Elysia plugins](https://elysiajs.com/essential/plugin),
[request lifecycle](https://elysiajs.com/essential/life-cycle),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), and
[GitHub setup-node](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md),
with behavior checked against the locked dependencies.

## License

[WTFPL v2](LICENSE). You just DO WHAT THE FUCK YOU WANT TO.
Including uninstalling this package, which is probably the best performance
optimization described anywhere in this README.
