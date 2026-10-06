import { Elysia, status } from 'elysia';
import { SlowdownEngine } from './engine.js';
import type { SlowdownOptions } from './config.js';

export type { DateInput, RampOptions, SlowdownOptions, NormalizedOptions, EffectiveSlowdown } from './config.js';
export type { SlowdownSnapshot } from './engine.js';

let instance = 0;

/** Create a reusable plugin plus an out-of-band runtime controller. */
export function createSlowdown(options: SlowdownOptions = {}) {
  const engine = new SlowdownEngine(options);
  const plugin = new Elysia({ name: 'mewitfsimtfultmis', seed: ++instance })
    .onRequest(async ({ request, set }) => {
      const outcome = await engine.enter(request.signal);
      if (outcome === 'overflow') {
        set.headers['Retry-After'] = '1';
        return status(503, 'The server is busy doing absolutely nothing. Try again later.');
      }
      if (outcome === 'disposed')
        return status(503, 'The slowdown factory has closed for the day.');
      if (outcome === 'aborted')
        return status(499, 'Even the request got tired of waiting.');
      // Returning undefined is essential: returning any value short-circuits Elysia.
    })
    .onStop(() => { engine.dispose(); });

  return {
    plugin,
    configure: (patch: SlowdownOptions) => engine.configure(patch),
    snapshot: () => engine.snapshot(),
    dispose: () => engine.dispose(),
  };
}

/** npm i -> import -> .use -> regret. */
export function mewitfsimtfultmis(options: SlowdownOptions = {}) {
  return createSlowdown(options).plugin;
}

export default mewitfsimtfultmis;
