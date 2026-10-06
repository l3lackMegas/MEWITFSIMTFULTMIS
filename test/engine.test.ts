import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effective, normalize } from '../src/config.js';
import { SlowdownEngine } from '../src/engine.js';
import type { Runtime } from '../src/engine.js';

class Clock implements Runtime {
  time = 0;
  wall = 0;
  cpu = 0;
  nextId = 0;
  timers = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  wallNow = () => this.wall;
  setTimer = (callback: () => void, milliseconds: number) => {
    const id = ++this.nextId;
    this.timers.set(id, { due: this.time + milliseconds, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  clearTimer = (timer: ReturnType<typeof setTimeout>) => { this.timers.delete(timer as unknown as number); };
  burnCpu = (milliseconds: number) => { this.cpu += milliseconds; this.time += milliseconds; this.wall += milliseconds; };
  async advance(milliseconds: number) {
    const end = this.time + milliseconds;
    for (;;) {
      const next = [...this.timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > end) break;
      const step = Math.max(0, next[1].due - this.time);
      this.time += step;
      this.wall += step;
      this.timers.delete(next[0]);
      next[1].callback();
      await Promise.resolve();
    }
    this.wall += Math.max(0, end - this.time);
    this.time = Math.max(end, this.time);
    await Promise.resolve();
  }
}

test('linear ramp clamps before start, halfway, at end, and after end', () => {
  const config = normalize({ delaySeconds: 2, memoryMegabytes: 8, cpuMilliseconds: 40, ramp: { start: 1000, end: 3000 } });
  assert.equal(effective(config, 0).progress, 0);
  assert.equal(effective(config, 1000).progress, 0);
  assert.deepEqual(effective(config, 2000), {
    progress: 0.5, delayMilliseconds: 1000, memoryBytes: 4 * 1024 * 1024,
    cpuMilliseconds: 20, intervalMilliseconds: 500,
  });
  assert.equal(effective(config, 3000).intervalMilliseconds, 1000);
  assert.equal(effective(config, 4000).progress, 1);
});

test('invalid costs and ambiguous/reversed dates fail early', () => {
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => normalize({ delaySeconds: value }));
    assert.throws(() => normalize({ memoryMegabytes: value }));
    assert.throws(() => normalize({ cpuMilliseconds: value }));
  }
  assert.throws(() => normalize({ memoryMegabytes: 1025 }));
  assert.throws(() => normalize({ cpuMilliseconds: 1001 }));
  assert.throws(() => normalize({ delaySeconds: 86401 }));
  for (const maxPending of [0, 1.5, 100001]) assert.throws(() => normalize({ maxPending }));
  for (const start of ['2026-10-06', '2026-10-06T12:00:00', '2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', new Date(NaN), Infinity])
    assert.throws(() => normalize({ ramp: { start, end: 1 } }));
  assert.throws(() => normalize({ ramp: { start: 100, end: 100 } }));
  assert.throws(() => normalize({ ramp: { start: 101, end: 100 } }));
  assert.equal(normalize({ ramp: { start: '2026-10-06T12:00:00+07:00', end: '2026-10-06T06:00:00Z' } }).ramp!.end - Date.parse('2026-10-06T05:00:00Z'), 3600000);
});

test('plain delays overlap instead of serializing every request', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 2 }, clock);
  const admitted: number[] = [];
  const requests = Array.from({ length: 3 }, () => engine.enter().then(() => admitted.push(clock.time)));
  await clock.advance(1999);
  assert.equal(admitted.length, 0);
  await clock.advance(1);
  await Promise.all(requests);
  assert.deepEqual(admitted, [2000, 2000, 2000]);
  assert.equal(clock.timers.size, 0);
});

test('completed ramp admits a concurrent burst FIFO at most once per second', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 0, ramp: { start: -2, end: -1 } }, clock);
  const admitted: number[] = [];
  const requests = Array.from({ length: 4 }, () => engine.enter().then(() => admitted.push(clock.time)));
  await Promise.resolve();
  await clock.advance(2999);
  assert.deepEqual(admitted, [0, 1000, 2000]);
  await clock.advance(1);
  await Promise.all(requests);
  assert.deepEqual(admitted, [0, 1000, 2000, 3000]);
});

test('late timers never release a catch-up burst', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 0, ramp: { start: -2, end: -1 } }, clock);
  await engine.enter();
  const admitted: number[] = [];
  const requests = [engine.enter(), engine.enter()].map(p => p.then(() => admitted.push(clock.time)));
  clock.time = 5000;
  clock.wall = 5000;
  await clock.advance(0);
  assert.deepEqual(admitted, [5000]);
  await clock.advance(1000);
  await Promise.all(requests);
  assert.deepEqual(admitted, [5000, 6000]);
});

test('ramp ending while requests wait is re-evaluated without rebuilding the app', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 0, ramp: { start: -1000, end: 1000 } }, clock);
  await engine.enter();
  const admitted: number[] = [];
  const requests = [engine.enter(), engine.enter()].map(p => p.then(() => admitted.push(clock.time)));
  await clock.advance(2000);
  await Promise.all(requests);
  assert.deepEqual(admitted, [1000, 2000]);
});

test('runtime configuration updates queued requests atomically, disable flushes', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 60, memoryMegabytes: 2 }, clock);
  const requests = [engine.enter(), engine.enter()];
  assert.equal(engine.snapshot().allocatedBytes, 2 * 1024 * 1024);
  assert.throws(() => engine.configure({ delaySeconds: -1, enabled: false }));
  assert.equal(engine.snapshot().config.enabled, true);
  engine.configure({ enabled: false });
  await clock.advance(0);
  assert.deepEqual(await Promise.all(requests), ['admitted', 'admitted']);
  assert.equal(engine.snapshot().allocatedBytes, 0);
  assert.equal(clock.timers.size, 0);
  engine.configure({ enabled: true, delaySeconds: 0, ramp: { start: -2, end: -1 } });
  const next = engine.enter();
  engine.configure({ ramp: null });
  await next;
  assert.equal(engine.snapshot().intervalMilliseconds, 0);
});

test('abort removes queue entries without wasting their slot; capacity is bounded', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 10, maxPending: 2 }, clock);
  const abort = new AbortController();
  const first = engine.enter(abort.signal);
  const second = engine.enter();
  assert.equal(await engine.enter(), 'overflow');
  abort.abort();
  assert.equal(await first, 'aborted');
  assert.equal(engine.snapshot().pending, 1);
  const third = engine.enter();
  await clock.advance(10000);
  assert.deepEqual(await Promise.all([second, third]), ['admitted', 'admitted']);
  assert.equal(await engine.enter(abort.signal), 'aborted');
  assert.equal(clock.timers.size, 0);
});

test('RAM is touched, shared and released; CPU cost scales with ramp', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 0, memoryMegabytes: 2, cpuMilliseconds: 10, ramp: { start: -1000, end: 1000 } }, clock);
  await engine.enter();
  assert.equal(clock.cpu, 5);
  assert.equal(engine.snapshot().allocatedBytes, 1024 * 1024);
  const chunks = (engine as unknown as { chunks: Uint8Array[] }).chunks;
  assert.equal(chunks[0]![0], 0xa5);
  assert.equal(chunks[0]![1024 * 1024 - 1], 0xa5);
  engine.configure({ memoryMegabytes: 0 });
  assert.equal(engine.snapshot().allocatedBytes, 0);
  engine.dispose();
  assert.equal(engine.snapshot().allocatedBytes, 0);
});

test('dispose settles pending requests, cancels timers, and cannot be undone', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 60, memoryMegabytes: 1 }, clock);
  const pending = engine.enter();
  engine.dispose();
  engine.dispose();
  assert.equal(await pending, 'disposed');
  assert.equal(await engine.enter(), 'disposed');
  assert.equal(clock.timers.size, 0);
  assert.equal(engine.snapshot().pending, 0);
  assert.equal(engine.snapshot().allocatedBytes, 0);
  assert.throws(() => engine.configure({ enabled: true }));
});

test('wall-clock changes do not skip the monotonic admission interval at the endpoint', async () => {
  const clock = new Clock();
  const engine = new SlowdownEngine({ delaySeconds: 0, ramp: { start: -10000, end: -9000 } }, clock);
  await engine.enter();
  clock.wall += 86400000;
  let admitted = false;
  const next = engine.enter().then(() => { admitted = true; });
  await clock.advance(999);
  assert.equal(admitted, false);
  await clock.advance(1);
  await next;
  assert.equal(admitted, true);
});

test('mutating input dates cannot change the live schedule', () => {
  const start = new Date(0);
  const end = new Date(1000);
  const engine = new SlowdownEngine({ ramp: { start, end } }, new Clock());
  start.setTime(10000);
  end.setTime(20000);
  assert.deepEqual(engine.snapshot().config.ramp, { start: 0, end: 1000 });
  assert.ok(Object.isFrozen(engine.snapshot().config));
  assert.ok(Object.isFrozen(engine.snapshot().config.ramp));
});

test('real CPU mode consumes time without an async delay', async () => {
  const engine = new SlowdownEngine({ delaySeconds: 0, cpuMilliseconds: 15 });
  const start = performance.now();
  assert.equal(await engine.enter(), 'admitted');
  assert.ok(performance.now() - start >= 14);
  engine.dispose();
});
