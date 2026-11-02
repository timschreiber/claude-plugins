'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RULES = fs.readFileSync(
  path.join(__dirname, '..', '..', 'plugins', 'tierminator', 'rules', 'tiering.md'),
  'utf8'
);

function section(name) {
  const lines = RULES.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `## ${name}`);
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

test('the rules have a Dependencies and parallel tasks section', () => {
  const s = section('Dependencies and parallel tasks');
  assert.ok(s.length > 0, 'section is empty');
  for (const needle of [
    '"after": []',
    'names only earlier tasks',
    'whole wave of its dependencies',
    'different files',
    'build output',
    '`Files to change:` line',
    'in an earlier wave',
    '`setup`',
    'each fresh worktree',
    '`verify`',
    'after each parallel wave',
    'halts the run',
  ]) {
    assert.ok(s.includes(needle), `missing: ${needle}`);
  }
});

test('the field table lists after and the block names setup and verify', () => {
  assert.match(RULES, /^\| `after` \| Optional/m);
  assert.ok(RULES.includes('the block may hold only `setup` and `verify`'));
});

test('the example shows an independent task', () => {
  assert.ok(RULES.includes('"after": [],'));
});

test('the old dependency line is gone', () => {
  assert.ok(!RULES.includes('A task can depend only on earlier tasks'));
});

test('the rules make the planner decide and report dependencies', () => {
  const s = section('Dependencies and parallel tasks');
  for (const needle of [
    "Don't default to a chain",
    'edits a file that task edits',
    '`Parallelism:` paragraph',
    '`Serial: <why>`',
    "Don't force it",
    'a plan of 6 or more tasks',
  ]) {
    assert.ok(s.includes(needle), `missing: ${needle}`);
  }
  assert.ok(!RULES.includes('which is the common case'));
});
