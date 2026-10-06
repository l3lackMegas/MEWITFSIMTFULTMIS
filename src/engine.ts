import { effective, normalize } from './config.js';
import type { EffectiveSlowdown, NormalizedOptions, SlowdownOptions } from './config.js';

export type Outcome = 'admitted' | 'overflow' | 'aborted' | 'disposed';
type Timer = ReturnType<typeof setTimeout>;

/** Internal clock boundary lets tests advance days without actually waiting days. */
export interface Runtime {
  wallNow(): number;
  now(): number;
  setTimer(callback: () => void, milliseconds: number): Timer;
  clearTimer(timer: Timer): void;
  burnCpu(milliseconds: number): void;
}

let uselessResult = 0;
export function burnCpu(milliseconds: number): void {
  const until = performance.now() + milliseconds;
  while (performance.now() < until) {
    for (let i = 0; i < 256; i++) uselessResult = Math.imul(uselessResult + i, 1664525) + 1013904223 | 0;
  }
}

const defaultRuntime: Runtime = {
  wallNow: () => Date.now(),
  now: () => performance.now(),
  setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer: (timer) => clearTimeout(timer),
  burnCpu,
};

interface Entry {
  arrived: number;
  cpuDone: boolean;
  finish(outcome: Outcome): void;
  fail(error: unknown): void;
}

export interface SlowdownSnapshot extends EffectiveSlowdown {
  readonly config: NormalizedOptions;
  readonly pending: number;
  readonly allocatedBytes: number;
  readonly disposed: boolean;
}

/** FIFO queue with a single timer; never reserves future slots that can burst later. */
export class SlowdownEngine {
  private config: NormalizedOptions;
  private queue: Entry[] = [];
  private timer: Timer | undefined;
  private lastAdmission = -Infinity;
  private chunks: Uint8Array[] = [];
  private allocatedBytes = 0;
  private disposed = false;
  private pumping = false;

  constructor(options: SlowdownOptions = {}, private readonly runtime: Runtime = defaultRuntime) {
    this.config = normalize(options);
  }

  configure(patch: SlowdownOptions): void {
    if (this.disposed) throw new Error('This slowdown controller has been disposed');
    // Validate everything before changing live state.
    const config = normalize(patch, this.config);
    this.resizeMemory(effective(config, this.runtime.wallNow()).memoryBytes, false);
    this.config = config;
    this.pump();
  }

  snapshot(): SlowdownSnapshot {
    return {
      ...effective(this.config, this.runtime.wallNow()),
      config: this.config,
      pending: this.queue.length,
      allocatedBytes: this.allocatedBytes,
      disposed: this.disposed,
    };
  }

  enter(signal?: AbortSignal): Promise<Outcome> {
    if (this.disposed) return Promise.resolve('disposed');
    if (signal?.aborted) return Promise.resolve('aborted');
    if (this.queue.length >= this.config.maxPending) return Promise.resolve('overflow');
    return new Promise((resolve, reject) => {
      const abort = () => {
        const index = this.queue.indexOf(entry);
        if (index === -1) return;
        this.queue.splice(index, 1);
        entry.finish('aborted');
        this.pump();
      };
      const entry: Entry = {
        arrived: this.runtime.now(),
        cpuDone: false,
        finish: (outcome) => {
          signal?.removeEventListener('abort', abort);
          resolve(outcome);
        },
        fail: (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      };
      this.queue.push(entry);
      signal?.addEventListener('abort', abort, { once: true });
      this.pump();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelTimer();
    this.resizeMemory(0);
    for (const entry of this.queue.splice(0)) entry.finish('disposed');
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.runtime.clearTimer(this.timer);
    this.timer = undefined;
  }

  private resizeMemory(bytes: number, grow = true): void {
    if (!grow) bytes = Math.min(bytes, this.allocatedBytes);
    // Keep 1 MiB chunks so ramp growth doesn't copy the entire resident pool.
    const chunkSize = 1024 * 1024;
    const count = Math.ceil(bytes / chunkSize);
    while (this.chunks.length > count) this.chunks.pop();
    for (let i = 0; i < count && (grow || i < this.chunks.length); i++) {
      const length = Math.min(chunkSize, bytes - i * chunkSize);
      if (this.chunks[i]?.byteLength !== length) {
        // fill commits/touches the allocation; an untouched virtual reservation is too useful.
        this.chunks[i] = new Uint8Array(length).fill(0xa5);
      }
    }
    this.allocatedBytes = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  }

  private pump(): void {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    this.cancelTimer();
    try {
      while (this.queue.length) {
        const entry = this.queue[0]!;
        const cost = effective(this.config, this.runtime.wallNow());
        try { this.resizeMemory(cost.memoryBytes); }
        catch (error) {
          this.queue.shift()!.fail(error);
          continue;
        }
        const now = this.runtime.now();
        const remaining = Math.max(
          entry.arrived + cost.delayMilliseconds - now,
          this.lastAdmission + cost.intervalMilliseconds - now,
        );
        if (remaining > 0) {
          // Re-read the wall clock during long delays, including the end of a ramp.
          this.timer = this.runtime.setTimer(() => { this.timer = undefined; this.pump(); }, Math.ceil(Math.min(remaining, 1000)));
          return;
        }
        if (!entry.cpuDone) {
          this.runtime.burnCpu(cost.cpuMilliseconds);
          entry.cpuDone = true;
        }
        // Time actually spent burning CPU also counts toward the admission interval.
        const interval = effective(this.config, this.runtime.wallNow()).intervalMilliseconds;
        const left = this.lastAdmission + interval - this.runtime.now();
        if (left > 0) {
          this.timer = this.runtime.setTimer(() => { this.timer = undefined; this.pump(); }, Math.ceil(Math.min(left, 1000)));
          return;
        }
        this.lastAdmission = this.runtime.now();
        this.queue.shift()!.finish('admitted');
        if (this.queue.length) {
          // Let the released request's continuation run before burning more CPU.
          this.timer = this.runtime.setTimer(() => { this.timer = undefined; this.pump(); }, 0);
          return;
        }
      }
    } finally { this.pumping = false; }
  }
}
