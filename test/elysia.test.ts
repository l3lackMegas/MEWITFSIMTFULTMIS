import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Elysia, t } from 'elysia';
import slow, { createSlowdown } from '../src/index.js';

const request = (path = '/') => new Request(`http://localhost${path}`);

test('default export works in .use and preserves body, validation, status and headers', async () => {
  const app = new Elysia().use(slow({ delaySeconds: 0.03 }))
    .post('/', ({ body, set }) => { set.status = 201; set.headers['x-useless'] = 'yes'; return body; }, {
      body: t.Object({ value: t.String() }),
    });
  const start = performance.now();
  const response = await app.handle(new Request('http://localhost/', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'still intact' }),
  }));
  assert.ok(performance.now() - start >= 29);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-useless'), 'yes');
  assert.deepEqual(await response.json(), { value: 'still intact' });
  const invalid = await app.handle(new Request('http://localhost/', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }));
  assert.equal(invalid.status, 422);
});

test('global request hook reaches nested plugins, 404s and earlier routes', async () => {
  const controller = createSlowdown({ delaySeconds: 0.02 });
  const app = new Elysia().get('/earlier', () => 'earlier').use(controller.plugin)
    .use(new Elysia().get('/nested', () => 'nested'));
  for (const path of ['/earlier', '/nested', '/missing']) {
    const start = performance.now();
    const response = await app.handle(request(path));
    assert.ok(performance.now() - start >= 19, path);
    assert.equal(response.status, path === '/missing' ? 404 : 200);
  }
  controller.dispose();
});

test('completed ramp spaces concurrent real Elysia requests one second apart', async () => {
  const controller = createSlowdown({ delaySeconds: 0, ramp: { start: 0, end: 1 } });
  const times: number[] = [];
  const app = new Elysia().use(controller.plugin).get('/', () => { times.push(performance.now()); return 'finally'; });
  const responses = await Promise.all([app.handle(request()), app.handle(request()), app.handle(request())]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(times.length, 3);
  assert.ok(times[1]! - times[0]! >= 990);
  assert.ok(times[2]! - times[1]! >= 990);
  controller.dispose();
});

test('runtime updates affect compiled hooks and overflow returns 503', async () => {
  const controller = createSlowdown({ delaySeconds: 60, maxPending: 1 });
  const app = new Elysia().use(controller.plugin).get('/', () => 'rescued');
  const pending = app.handle(request());
  const overflow = await app.handle(request());
  assert.equal(overflow.status, 503);
  assert.equal(overflow.headers.get('retry-after'), '1');
  controller.configure({ enabled: false });
  assert.equal(await (await pending).text(), 'rescued');
  assert.equal(await (await app.handle(request())).text(), 'rescued');
  controller.dispose();
  assert.equal((await app.handle(request())).status, 503);
});

test('reusing a plugin deduplicates its lifecycle and distinct controllers remain independent', async () => {
  const first = createSlowdown({ delaySeconds: 0, cpuMilliseconds: 1 });
  const app = new Elysia().use(first.plugin).use(first.plugin).get('/', () => 'ok');
  assert.equal(app.event.request?.length, 1);
  assert.equal((await app.handle(request())).status, 200);
  const second = createSlowdown({ delaySeconds: 0 });
  const other = new Elysia().use(first.plugin).use(second.plugin).get('/', () => 'two');
  assert.equal(other.event.request?.length, 2);
  first.dispose();
  second.dispose();
});

test('request abort skips the route and application errors remain application errors', async () => {
  const controller = createSlowdown({ delaySeconds: 10 });
  let called = false;
  const app = new Elysia().use(controller.plugin).get('/', () => { called = true; return 'no'; });
  const abort = new AbortController();
  const pending = app.handle(new Request('http://localhost/', { signal: abort.signal }));
  abort.abort();
  assert.equal((await pending).status, 499);
  assert.equal(called, false);
  controller.dispose();
  const broken = new Elysia().use(slow({ delaySeconds: 0 }))
    .get('/', () => { throw new Error('original application error'); });
  assert.equal((await broken.handle(request())).status, 500);
});
