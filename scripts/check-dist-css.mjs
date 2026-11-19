// Fails when a shipped stylesheet holds a url() with nothing in it.
// Bundlers such as Turbopack resolve every url() as a module, and an empty one
// ends the app's build with "Can't resolve ''".
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const emptyUrl = /url\(\s*(?:""|'')?\s*\)/g;

const cssFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });

const files = cssFiles(dist);
if (files.length === 0) {
  console.error(`check-dist-css: no .css files under ${dist}`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const found = readFileSync(file, 'utf8').match(emptyUrl);
  if (found) {
    failed = true;
    console.error(`check-dist-css: ${file} holds an empty url(): ${found.join(', ')}`);
  }
}
if (failed) process.exit(1);
console.log(`check-dist-css: ${files.length} stylesheet(s), no empty url()`);
