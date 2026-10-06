/** Dates require an explicit timezone, or use Date / epoch milliseconds. */
export type DateInput = string | number | Date;

export interface RampOptions {
  start: DateInput;
  end: DateInput;
}

export interface SlowdownOptions {
  /** Non-blocking delay per request. Defaults to 1 second. Range: 0..86400. */
  delaySeconds?: number;
  /** Shared resident memory per controller, in MiB. Defaults to 0. Range: 0..1024. */
  memoryMegabytes?: number;
  /** Busy-loop time per admitted request. Defaults to 0. Range: 0..1000 ms. */
  cpuMilliseconds?: number;
  /** Linear ramp from no slowdown to configured costs and a 1 request/second gate. */
  ramp?: RampOptions | null;
  /** Maximum waiting requests; overflow gets HTTP 503. Defaults to 1000. */
  maxPending?: number;
  /** Disable all artificial work and flush the queue. Defaults to true. */
  enabled?: boolean;
}

export interface NormalizedOptions {
  readonly delaySeconds: number;
  readonly memoryMegabytes: number;
  readonly cpuMilliseconds: number;
  readonly ramp: Readonly<{ start: number; end: number }> | null;
  readonly maxPending: number;
  readonly enabled: boolean;
}

export interface EffectiveSlowdown {
  readonly progress: number;
  readonly delayMilliseconds: number;
  readonly memoryBytes: number;
  readonly cpuMilliseconds: number;
  readonly intervalMilliseconds: number;
}

const defaults: NormalizedOptions = {
  delaySeconds: 1,
  memoryMegabytes: 0,
  cpuMilliseconds: 0,
  ramp: null,
  maxPending: 1000,
  enabled: true,
};

function numeric(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)
    throw new RangeError(`${name} must be a finite number between 0 and ${max}`);
  return value;
}

function date(value: DateInput, name: string): number {
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new TypeError(`${name} must be an ISO timestamp with a timezone, a Date, or epoch milliseconds`);
  if (typeof value === 'string') {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]!)
      throw new RangeError(`${name} must be a real calendar date`);
  }
  const timestamp = value instanceof Date ? value.getTime()
    : typeof value === 'string' ? Date.parse(value) : value;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || Math.abs(timestamp) > 8.64e15)
    throw new RangeError(`${name} must be a valid date`);
  return timestamp;
}

export function normalize(options: SlowdownOptions, base = defaults): NormalizedOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('options must be an object');
  let ramp = base.ramp;
  if (options.ramp === null) ramp = null;
  else if (options.ramp !== undefined) {
    const start = date(options.ramp.start, 'ramp.start');
    const end = date(options.ramp.end, 'ramp.end');
    if (end <= start) throw new RangeError('ramp.end must be after ramp.start');
    ramp = Object.freeze({ start, end });
  }
  const maxPending = numeric(options.maxPending ?? base.maxPending, 'maxPending', 100_000);
  if (!Number.isInteger(maxPending) || maxPending < 1)
    throw new RangeError('maxPending must be an integer between 1 and 100000');
  const enabled = options.enabled ?? base.enabled;
  if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
  return Object.freeze({
    delaySeconds: numeric(options.delaySeconds ?? base.delaySeconds, 'delaySeconds', 86_400),
    memoryMegabytes: numeric(options.memoryMegabytes ?? base.memoryMegabytes, 'memoryMegabytes', 1024),
    cpuMilliseconds: numeric(options.cpuMilliseconds ?? base.cpuMilliseconds, 'cpuMilliseconds', 1000),
    ramp,
    maxPending,
    enabled,
  });
}

export function effective(config: NormalizedOptions, now: number): EffectiveSlowdown {
  const progress = !config.enabled ? 0 : config.ramp
    ? Math.min(1, Math.max(0, (now - config.ramp.start) / (config.ramp.end - config.ramp.start)))
    : 1;
  return {
    progress,
    delayMilliseconds: config.delaySeconds * 1000 * progress,
    memoryBytes: Math.floor(config.memoryMegabytes * 1024 * 1024 * progress),
    cpuMilliseconds: config.cpuMilliseconds * progress,
    intervalMilliseconds: config.ramp ? 1000 * progress : 0,
  };
}
