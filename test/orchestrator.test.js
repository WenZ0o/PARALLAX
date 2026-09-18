import test from 'node:test';
import assert from 'node:assert/strict';
import { extractText, parsePlannerJson, normalizeAgents } from '../lib/orchestrator.js';

test('extractText reads Responses API output_text parts', () => {
  const value = extractText({ output: [{ content: [{ type: 'output_text', text: 'hello' }] }] });
  assert.equal(value, 'hello');
});

test('parsePlannerJson accepts fenced JSON', () => {
  const value = parsePlannerJson('```json\n{"mission":"x","agents":[]}\n```');
  assert.equal(value.mission, 'x');
});

test('normalizeAgents caps worker width and creates safe ids', () => {
  const value = normalizeAgents({ agents: [
    { role: 'Signal Scout', goal: 'a' },
    { role: 'System Mapper', goal: 'b' },
    { role: 'Red Team', goal: 'c' },
    { role: 'Execution Lead', goal: 'd' },
    { role: 'Extra', goal: 'e' }
  ]});
  assert.equal(value.length, 4);
  assert.equal(value[0].id, 'signal-scout');
});
