#!/usr/bin/env node
/**
 * Removes build output from every workspace package (keeps node_modules).
 * Usage: pnpm clean
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIRS = ['dist', 'out', 'coverage', '.vite'];

/** @type {string[]} */
const targets = [...OUTPUT_DIRS.map((dir) => join(ROOT, dir))];

for (const group of ['apps', 'packages']) {
  const groupDir = join(ROOT, group);
  if (!existsSync(groupDir)) continue;

  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const dir of OUTPUT_DIRS) targets.push(join(groupDir, entry.name, dir));
    targets.push(join(groupDir, entry.name, 'tsconfig.tsbuildinfo'));
  }
}

let removed = 0;
for (const target of targets) {
  if (!existsSync(target)) continue;
  rmSync(target, { recursive: true, force: true });
  removed += 1;
  console.log(`removed ${target.slice(ROOT.length + 1)}`);
}

console.log(`✔ clean complete (${removed} path(s) removed)`);
