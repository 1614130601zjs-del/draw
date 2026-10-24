import assert from 'node:assert/strict';
import { parseImageMarkers, inspectMessage, makeTriggerId, TriggerRegistry } from './trigger-core.js';

const prompt = 'a girl, rainy night';
assert.deepEqual(parseImageMarkers('plain text'), []);
assert.equal(parseImageMarkers('image###  ###').length, 0);
assert.deepEqual(parseImageMarkers('before image###' + prompt + '### after').map(x => x.prompt), [prompt]);
assert.equal(parseImageMarkers('image###unfinished').length, 0);
assert.equal(parseImageMarkers('image###one### and image###two###').length, 2);
assert.equal(inspectMessage('hello image###test###').ready, false);
assert.equal(inspectMessage('hello image###test###', { isFinal: true }).ready, true);
assert.equal(inspectMessage('hello image###test###', { isFinal: true }).visibleText, 'hello');

const id = makeTriggerId({ chatId: 'chat-a', messageId: 12, markerIndex: 7 });
assert.equal(id, 'chat-a:12:7');

const registry = new TriggerRegistry();
assert.equal(registry.begin(id, { prompt }).accepted, true);
assert.equal(registry.begin(id, { prompt }).accepted, false, 'pending trigger must deduplicate');
registry.markRunning(id);
registry.markSucceeded(id, 'image-1');
assert.equal(registry.begin(id, { prompt }).accepted, false, 'successful trigger must not silently duplicate');
assert.deepEqual(registry.get(id).resultIds, ['image-1']);

const failedId = id + ':failed';
registry.begin(failedId, { prompt });
registry.markFailed(failedId);
assert.equal(registry.retry(failedId).accepted, true, 'retry must be explicit');
assert.equal(registry.get(failedId).attempts, 2);

console.log('轻绘触发核心测试通过：marker parsing、final gating、dedupe、state transitions、explicit retry。');
