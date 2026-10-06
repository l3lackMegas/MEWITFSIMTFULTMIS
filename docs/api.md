# API reference

## Exports

```ts
import slow, { mewitfsimtfultmis, createSlowdown } from 'mewitfsimtfultmis'
import type { SlowdownOptions, RampOptions, SlowdownSnapshot } from 'mewitfsimtfultmis'
```

`slow(options?)` and the named `mewitfsimtfultmis(options?)` export return an Elysia
plugin for `.use()`. `createSlowdown(options?)` returns a controller with `plugin`,
`configure`, `snapshot`, and `dispose`.

## Options

| Option | Default | Accepted values |
| --- | --- | --- |
| `delaySeconds` | `1` | Finite number from 0 to 86400, including fractions |
| `memoryMegabytes` | `0` | Finite number from 0 to 1024 MiB, including fractions |
| `cpuMilliseconds` | `0` | Finite number from 0 to 1000 ms, including fractions |
| `ramp` | `null` | `{ start, end }`, or `null` to remove the schedule |
| `maxPending` | `1000` | Integer from 1 to 100000 |
| `enabled` | `true` | Boolean |

Invalid numeric values or dates throw during creation or configuration. `end` must
be strictly later than `start`. Dates accept `Date`, epoch milliseconds, or ISO
timestamps with `Z` or an explicit offset, such as `2026-11-01T00:00:00+07:00`.
Bare dates and timestamps without a timezone are rejected.

### Delay, RAM, and CPU

The delay is a minimum async wait from queue entry. Multiple requests can wait
concurrently. CPU work runs afterward and can add latency.

Memory is a shared pool per controller, not a per-request allocation. Buffers are
filled in chunks of at most 1 MiB. Allocation follows the current ramp while
requests are pending; no background allocation runs while idle. Reducing the
setting, disabling the controller, or disposing it releases references. GC and
the OS may not return RSS immediately.

CPU mode is a busy loop on the event loop and affects other work in the process.
The setting describes approximate loop duration, not CPU utilization percentage.

### Ramp and request pacing

```text
progress = clamp((now - start) / (end - start), 0, 1)
delay    = delaySeconds × progress
RAM      = memoryMegabytes × progress
CPU      = cpuMilliseconds × progress
spacing  = 1000 ms × progress
```

| Time | Configured costs | Minimum admission spacing |
| --- | --- | --- |
| Before or at the start | 0% | None |
| Halfway through | 50% | 500 ms |
| At or after the end | 100% | 1000 ms |

Requests share a FIFO queue per controller. After an idle period, the first
request passes when its delay and CPU work finish. At the end of the ramp,
subsequent admissions are at least one second apart. Late timers do not produce
catch-up bursts. Wall-clock time determines progress; a monotonic clock controls
admission spacing.

This limits admissions through the hook, not response completion times. Queue
overflow receives `503` immediately and is not counted as an admission. Four
independent workers can collectively admit up to four requests per second.

A ramp enables pacing even when all three costs are zero. Without a ramp, there
is no admission rate limit. Set `enabled: false` to disable both costs and pacing.

## Runtime controller

### `plugin`

Pass this Elysia instance to `.use(controller.plugin)`.

### `configure(patch)`

Applies a partial update. Replacing `ramp` requires both dates; setting it to
`null` removes the schedule while preserving the configured costs. Validation
happens before live state changes, and waiting requests use the new settings.

CPU work already in progress finishes before an update can run. Lowering
`maxPending` preserves queued requests but rejects new arrivals until the queue
falls below the limit. Disabling the controller drains the queue and releases RAM
references; enabling it again resumes the current configuration.

### `snapshot()`

Returns a snapshot with these fields:

| Field | Meaning |
| --- | --- |
| `config` | Normalized configuration; ramp dates are epoch milliseconds |
| `progress` | Current multiplier from 0 to 1; 0 when disabled, 1 without a ramp |
| `delayMilliseconds` | Current minimum delay |
| `memoryBytes` | Current target RAM allocation |
| `allocatedBytes` | Bytes currently held by the pool |
| `cpuMilliseconds` | Current busy-loop duration |
| `intervalMilliseconds` | Current minimum admission spacing |
| `pending` | Number of queued requests |
| `disposed` | Whether the controller has been disposed |

The snapshot is for inspection. Use `configure()` to change behavior. Target
costs can differ from actual allocations while idle; after disposal, `config`
and calculated costs still describe the last configuration.

### `dispose()`

Releases RAM references, cancels the timer, and settles pending requests with
`503`. Calling it repeatedly is safe. New requests receive `503`, and
`configure()` throws after disposal. Create a new controller to use it again.
Stopping the Elysia application disposes the controller automatically.

## Elysia lifecycle

The plugin uses global `onRequest`, covering nested plugins, earlier routes, and
`404` requests. Normal request bodies, schemas, and responses are preserved.
Place it early in the chain: an earlier hook returning a response can bypass it.

Each controller has its own plugin identity. Reusing the same plugin instance is
deduplicated. Sharing a controller across applications shares its queue and RAM,
and stopping either application disposes it.

If the runtime sends an abort through `Request.signal`, the request is removed
from the queue and receives `499`. Queue overflow returns `503` with
`Retry-After: 1`. No timers remain after the queue empties or the controller is
disposed.
