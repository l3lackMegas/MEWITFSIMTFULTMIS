import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { createSlowdown } from '../src/index.js';

test('real Bun HTTP server is paced and stop disposes the controller', async () => {
  const controller = createSlowdown({ delaySeconds: 0, memoryMegabytes: 1, ramp: { start: 0, end: 1 } });
  const admissions: number[] = [];
  const app = new Elysia().use(controller.plugin).get('/', () => {
    admissions.push(performance.now());
    return 'slow over an actual socket';
  }).listen({ hostname: '127.0.0.1', port: 0 });
  try {
    const url = `http://127.0.0.1:${app.server!.port}/`;
    const responses = await Promise.all([fetch(url), fetch(url), fetch(url)]);
    expect(await Promise.all(responses.map(r => r.text()))).toEqual(Array(3).fill('slow over an actual socket'));
    expect(admissions[1]! - admissions[0]!).toBeGreaterThanOrEqual(990);
    expect(admissions[2]! - admissions[1]!).toBeGreaterThanOrEqual(990);
    expect(controller.snapshot().allocatedBytes).toBe(1024 * 1024);
  } finally { await app.stop(); }
  expect(controller.snapshot().disposed).toBe(true);
  expect(controller.snapshot().allocatedBytes).toBe(0);
});
