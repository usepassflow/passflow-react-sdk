#!/usr/bin/env node
// Builds and serves a stock Next.js App Router app with a packed @passflow/react tarball.
//
//   node tests/next-app/run.mjs <passflow-react-x.y.z.tgz> [--work <dir>]
//
// Installs the tarball and the pins in pins.json into <work> with pnpm (scripts disabled, the repo's
// release-age policy copied in), copies app/ and next.config.mjs there, runs `next build` (Turbopack,
// cacheComponents), starts `next start`, and requests /signin, which must answer 200. The app's layout and
// flow page are server components that import from the package directly. Exits 1 if any step fails.
//
// The work dir must be outside this repo's pnpm workspace; the default is <os tmpdir>/passflow-next-app.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const pins = JSON.parse(readFileSync(join(here, 'pins.json'), 'utf8'));
const port = 3990;

const args = process.argv.slice(2);
const workFlag = args.indexOf('--work');
const work = resolve(workFlag >= 0 ? args[workFlag + 1] : join(tmpdir(), 'passflow-next-app'));
const tarball = args.find((a, i) => !a.startsWith('--') && (workFlag < 0 || i !== workFlag + 1));
if (!tarball || !existsSync(tarball)) {
  console.error('usage: node tests/next-app/run.mjs <passflow-react-x.y.z.tgz> [--work <dir>]');
  process.exit(2);
}
const packageManager = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).packageManager;

const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { cwd: work, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};
const step = (name, r) => {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!r.ok) {
    console.log(r.out.replace(/^/gm, '      '));
    process.exit(1);
  }
};

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
writeFileSync(
  join(work, 'package.json'),
  `${JSON.stringify(
    {
      name: 'next-app',
      private: true,
      packageManager,
      dependencies: { '@passflow/react': `file:${resolve(tarball)}`, ...pins.dependencies },
    },
    null,
    2,
  )}\n`,
);
cpSync(join(repo, 'pnpm-workspace.yaml'), join(work, 'pnpm-workspace.yaml'));
cpSync(join(here, 'app'), join(work, 'app'), { recursive: true });
cpSync(join(here, 'next.config.mjs'), join(work, 'next.config.mjs'));

step('install', run('pnpm', ['install', '--ignore-scripts']));
const next = join(work, 'node_modules', 'next', 'dist', 'bin', 'next');
step('next build', run(process.execPath, [next, 'build']));

const server = spawn(process.execPath, [next, 'start', '-p', String(port)], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
const stop = () => server.kill();

let response;
for (let i = 0; i < 60 && !response; i++) {
  await new Promise((r) => setTimeout(r, 500));
  response = await fetch(`http://localhost:${port}/signin`).catch(() => undefined);
}
const html = response ? await response.text() : '';
stop();
step('next start: /signin answers 200', {
  ok: response?.status === 200,
  out: `status: ${response?.status ?? 'no answer'}\n${log}`,
});
step('next start: no server error', { ok: !/\berror\b/i.test(log), out: log });
step('the page loads the package stylesheet', { ok: /\/_next\/static\/[^"]+\.css/.test(html), out: html.slice(0, 500) });
