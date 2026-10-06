import { Elysia } from 'elysia';
import { createSlowdown } from '../src/index.js';

const start = Date.now();
const misery = createSlowdown({
  delaySeconds: 0.2,
  memoryMegabytes: 8,
  cpuMilliseconds: 5,
  ramp: { start, end: start + 60_000 },
});

const app = new Elysia()
  .use(misery.plugin)
  .get('/', () => ({ message: 'Congratulations. You waited for this.', misery: misery.snapshot() }))
  .listen(3000);

console.log(`Your increasingly disappointing server: http://localhost:${app.server!.port}`);

// Change these from your own trusted control plane; no public admin route is needed.
// misery.configure({ delaySeconds: 2, cpuMilliseconds: 20 });
// misery.configure({ ramp: { start: new Date(), end: new Date(Date.now() + 3_600_000) } });
// misery.configure({ enabled: false }); // An unforgivable performance improvement.
