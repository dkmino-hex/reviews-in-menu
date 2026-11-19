import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/calendar.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { monthDays, moveDate, moveMonth } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('calendar starts on Monday and includes leap day without timezone drift', () => {
  const days = monthDays('2024-02');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2024-01-29');
  assert.equal(new Set(days).size, 42);
  assert(days.includes('2024-02-29'));
  assert.equal(new Date(days[0]).getUTCDay(), 1);
});

test('navigation crosses year, month and leap-year boundaries', () => {
  assert.equal(moveDate('2024-02-28', 1), '2024-02-29');
  assert.equal(moveDate('2024-02-29', 1), '2024-03-01');
  assert.equal(moveDate('2026-01-01', -1), '2025-12-31');
  assert.equal(moveMonth('2026-12', 1), '2027-01');
  assert.equal(moveMonth('2026-01', -1), '2025-12');
});
