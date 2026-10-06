# MEWITFSIMTFULTMIS

**MY ELYSIA WEB IS TOO FAST SO I MADE THIS FUCKING USELESS LIBRARY TO MAKE IT SLOWER**

An [Elysia](https://elysiajs.com) plugin for adding delay, wasting RAM, and burning
CPU. Other libraries reduce latency. This one gives your loading spinner job security.

## Install

```sh
npm i elysia mewitfsimtfultmis
```

ESM with TypeScript support. Requires Elysia 1.4.30+ (1.x) and Bun or Node.js 22+.
The server examples below use Bun.

## Usage

```ts
import { Elysia } from 'elysia'
import slow from 'mewitfsimtfultmis'

new Elysia()
  .use(slow({
    delaySeconds: 2,
    memoryMegabytes: 64,
    cpuMilliseconds: 25,
  }))
  .get('/', () => 'Two seconds of your life. For this.')
  .listen(3000)
```

Use any combination of modes. `slow()` defaults to a one-second delay;
set `delaySeconds: 0` if you only want RAM or CPU waste.

| Option | Default | What it does |
| --- | --- | --- |
| `delaySeconds` | `1` | Adds an async delay per request, in seconds |
| `memoryMegabytes` | `0` | Keeps a shared pool of RAM per controller, in MiB |
| `cpuMilliseconds` | `0` | Runs a CPU busy loop per request, in milliseconds |
| `ramp` | `null` | Gradually increases slowdown between `{ start, end }` |
| `maxPending` | `1000` | Caps the waiting queue; overflow returns `503` |
| `enabled` | `true` | Set to `false` to disable slowdown and drain the queue |

CPU mode blocks the event loop, and RAM allocations are real. The terrible
performance is a feature.

## Get progressively worse

Set a date range to ramp from no slowdown to your configured costs. At the end,
requests pass through the plugin at most once per second **per controller, per
process**. Extra workers have their own limits; response completion times vary.

Use `createSlowdown()` to change the settings while the server is running:

```ts
import { Elysia } from 'elysia'
import { createSlowdown } from 'mewitfsimtfultmis'

const now = Date.now()
const misery = createSlowdown({
  delaySeconds: 2,
  ramp: { start: now, end: now + 3_600_000 }, // Ruin the next hour.
})

new Elysia()
  .use(misery.plugin)
  .get('/', () => 'still waiting?')
  .listen(3000)

// Call these later from your own application code:
// misery.configure({ delaySeconds: 3 })
// misery.configure({ enabled: false })
// console.log(misery.snapshot())
```

Dates accept `Date`, epoch milliseconds, or ISO timestamps with a timezone.
Without `ramp`, only the configured costs apply; there is no request rate limit.

See the [API reference](https://github.com/l3lackMegas/MEWITFSIMTFULTMIS/blob/main/docs/api.md)
for option limits, runtime controls, and lifecycle behavior, or try the
[runnable example](https://github.com/l3lackMegas/MEWITFSIMTFULTMIS/blob/main/examples/server.ts).

## Benchmark

Slowest to fastest. Finally, a chart where we come first.

![Throughput, slowest to fastest: Elysia with MEWITFSIMTFULTMIS and Kotchasan use fictional values; express, fastify, and Elysia use TechEmpower Round 23 plaintext results.](https://raw.githubusercontent.com/l3lackMegas/MEWITFSIMTFULTMIS/main/assets/benchmark.png)

*Sources: #3–#5 use [TechEmpower Round 23, Plaintext](https://www.techempower.com/benchmarks/#section=data-r23&test=plaintext)
best results on physical hardware. #1–#2 are credited to imagination, not measurement.
This is a joke leaderboard, not a controlled five-framework comparison.*

## Contributing

Bug reports and pull requests are welcome. See the
[contributing guide](https://github.com/l3lackMegas/MEWITFSIMTFULTMIS/blob/main/CONTRIBUTING.md)
to get started, or [open an issue](https://github.com/l3lackMegas/MEWITFSIMTFULTMIS/issues).

## License

[WTFPL](https://github.com/l3lackMegas/MEWITFSIMTFULTMIS/blob/main/LICENSE).
You just DO WHAT THE FUCK YOU WANT TO.
