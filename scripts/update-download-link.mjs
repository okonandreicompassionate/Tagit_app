/**
 * Points the download pages at the newest finished Android build.
 *
 *   npm run link:apk
 *
 * Run it after every build. Doing this by hand means the QR and the button
 * can drift apart, or a page keeps serving a stale APK long after a newer one
 * exists — both of which have already happened once.
 */
import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(exec);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every page that embeds the APK URL. Each holds it exactly once, in a single
// constant, which is what makes this a safe find-and-replace.
const PAGES = ['landing/download.html', 'install-qr.html'];

const APK_RE = /https:\/\/expo\.dev\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk/g;

// exec rather than execFile: on Windows `npx` is a .cmd, which cannot be
// spawned without a shell. exec takes a command line by design, so there is no
// args-array-through-a-shell warning — and every argument here is a literal,
// with nothing interpolated from outside.
const { stdout } = await run(
  'npx eas build:list --platform android --status finished --limit 1 --json --non-interactive',
  { cwd: root, maxBuffer: 10 * 1024 * 1024 }
);

// `eas --json` can still emit human-readable lines first, so take the JSON.
const start = stdout.indexOf('[');
if (start === -1) throw new Error(`No JSON in eas output:\n${stdout.slice(0, 400)}`);

const [build] = JSON.parse(stdout.slice(start));
if (!build) throw new Error('No finished Android build found.');

const url = build.artifacts?.applicationArchiveUrl ?? build.artifacts?.buildUrl;
if (!url) throw new Error(`Build ${build.id} has no artifact URL.`);

const version = build.appVersion ?? 'unknown';
console.log(`Latest finished build: ${build.id}`);
console.log(`  version ${version}   ${new Date(build.completedAt ?? Date.now()).toLocaleString()}`);
console.log(`  ${url}\n`);

for (const page of PAGES) {
  const path = join(root, page);
  const before = await readFile(path, 'utf8');

  if (!APK_RE.test(before)) {
    console.log(`  ${page.padEnd(28)} no APK URL found — skipped`);
    continue;
  }
  APK_RE.lastIndex = 0;

  let after = before.replace(APK_RE, url);
  // Keep the displayed version honest alongside the link it describes.
  after = after.replace(/var VERSION = '[^']*';/, `var VERSION = 'v${version}';`);
  after = after.replace(/<span>v[\d.]+<\/span>/, `<span>v${version}</span>`);

  if (after === before) {
    console.log(`  ${page.padEnd(28)} already current`);
  } else {
    await writeFile(path, after);
    console.log(`  ${page.padEnd(28)} updated`);
  }
}

console.log('\nDownload pages point at the latest build.');
