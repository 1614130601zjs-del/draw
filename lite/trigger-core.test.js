import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseImageMarkers,
  inspectMessage,
  makeTriggerId,
  TriggerRegistry,
} from './trigger-core.js';

test('extracts one complete marker and keeps prompt whitespace trimmed', () => {
  assert.deepEqual(parseImageMarkers('hello image###  portrait, soft light  ### bye'), [
    {
      index: 6,
      end: 41,
      prompt: 'portrait, soft light',
      marker: 'image###  portrait, soft light  ###',
    },
  ]);
});

test('extracts multiple markers in source order', () => {
  const result = parseImageMarkers('A image###cat### B image###dog###');
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.prompt), ['cat', 'dog']);
  assert.ok(result[0].index < result[1].index);
});

test('ignores empty markers and incomplete streaming tails', () => {
  assert.deepEqual(parseImageMarkers('image###### image###unfinished'), []);
  assert.equal(inspectMessage('text image###unfinished', { isFinal: false }).ready, false);
  assert.equal(inspectMessage('text image###cat###', { isFinal: true }).ready, true);
});

test('visible text removes complete image markers but preserves surrounding text', () => {
  assert.equal(
    inspectMessage('before image###cat### middle image###dog### after').visibleText,
    'before  middle  after',
  );
});

test('trigger IDs require stable identity and distinguish marker positions', () => {
  assert.equal(makeTriggerId({ chatId: 'c', messageId: 3, markerIndex: 9 }), 'c:3:9');
  assert.throws(() => makeTriggerId({ chatId: 'c', markerIndex: 9 }), TypeError);
});

test('registry prevents duplicate in-flight and successful requests', () => {
  const registry = new TriggerRegistry();
  assert.equal(registry.begin('t1').accepted, true);
  assert.equal(registry.begin('t1').accepted, false);
  registry.markRunning('t1');
  registry.markSucceeded('t1', 'image-1');
  assert.equal(registry.begin('t1').accepted, false);
  assert.deepEqual(registry.get('t1').resultIds, ['image-1']);
});

test('failed requests can be explicitly retried without losing earlier result IDs', () => {
  const registry = new TriggerRegistry();
  registry.begin('t2', { prompt: 'first' });
  registry.markRunning('t2');
  registry.markFailed('t2', 'network');
  const retry = registry.retry('t2', { prompt: 'second' });
  assert.equal(retry.accepted, true);
  assert.equal(retry.task.attempts, 2);
  assert.equal(retry.task.payload.prompt, 'second');
  registry.markRunning('t2');
  registry.markSucceeded('t2', 'image-2');
  assert.deepEqual(registry.get('t2').resultIds, ['image-2']);
});

test('successful trigger can create an explicit new candidate without overwriting old results', () => {
  const registry = new TriggerRegistry();
  registry.begin('reroll', { prompt: 'portrait' });
  registry.markRunning('reroll');
  registry.markSucceeded('reroll', 'image-1');

  const candidate = registry.beginCandidate('reroll');
  assert.equal(candidate.accepted, true);
  assert.deepEqual(candidate.task.resultIds, ['image-1']);
  registry.markRunning('reroll');
  registry.markSucceeded('reroll', 'image-2');
  assert.deepEqual(registry.get('reroll').resultIds, ['image-1', 'image-2']);
});

test('explicit reroll is rejected unless the previous candidate succeeded', () => {
  const registry = new TriggerRegistry();
  assert.equal(registry.beginCandidate('missing').accepted, false);
  registry.begin('pending');
  assert.equal(registry.beginCandidate('pending').accepted, false);
});
