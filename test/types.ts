import { Elysia } from 'elysia';
import slow from '../src/index.js';

const app = new Elysia().use(slow()).get('/', () => ({ ok: true as const }));
type Success = typeof app['~Routes']['get']['response'][200];
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
// The plugin's 499/503 responses must not widen the route's 200 type in Eden.
export type PreservesRouteResponse = Assert<Equal<Success, { ok: true }>>;
