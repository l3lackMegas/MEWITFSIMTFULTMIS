import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run through the same npm CLI as the caller, including on Windows.
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this with npm run test:package');
const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'mewitfsimtfultmis-'));
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [npm, ...args], { cwd, encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const report = JSON.parse(run(['pack', '--json', '--ignore-scripts', '--pack-destination', temp]))[0];
  const files = report.files.map(file => file.path);
  for (const expected of ['dist/index.js', 'dist/index.d.ts', 'LICENSE', 'README.md']) assert.ok(files.includes(expected), expected);
  assert.ok(files.every(file => file.startsWith('dist/') || ['LICENSE', 'README.md', 'package.json'].includes(file)));
  const consumer = join(temp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const peer = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies.elysia;
  run(['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, report.filename), `elysia@${peer}`], consumer);
  writeFileSync(join(consumer, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { Elysia } from 'elysia';
import slow, { createSlowdown } from 'mewitfsimtfultmis';
const control = createSlowdown({ delaySeconds: 0, memoryMegabytes: 0.25 });
const app = new Elysia().use(control.plugin).get('/', () => 'installed from tarball');
const response = await app.handle(new Request('http://localhost/'));
assert.equal(await response.text(), 'installed from tarball');
assert.equal(control.snapshot().allocatedBytes, 262144);
assert.equal(typeof slow, 'function');
control.dispose();
`);
  const result = spawnSync(process.execPath, ['smoke.mjs'], { cwd: consumer, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  writeFileSync(join(consumer, 'consumer.ts'), `
import { Elysia } from 'elysia';
import slow, { createSlowdown, type SlowdownOptions } from 'mewitfsimtfultmis';
const options: SlowdownOptions = { delaySeconds: 0, ramp: { start: 0, end: 1 } };
new Elysia().use(slow(options)).get('/', () => 'ok');
const control = createSlowdown(options);
control.configure({ ramp: null });
control.snapshot().allocatedBytes satisfies number;
`);
  const types = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts'], { cwd: consumer, encoding: 'utf8' });
  assert.equal(types.status, 0, types.stdout + types.stderr);
  console.log(`Verified npm tarball (${report.size} bytes), installed import, .use(), and public TypeScript declarations.`);
} finally {
  // Only delete the exact temporary directory created by mkdtempSync above.
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
  rmSync(temp, { recursive: true, force: true });
}
