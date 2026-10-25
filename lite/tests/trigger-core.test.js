import test from "node:test";
import assert from "node:assert/strict";
import {
  parseImageMarkers,
  inspectMessage,
  makeTriggerId,
  TriggerRegistry,
} from "../trigger-core.js";

test("parses one complete image marker and preserves its exact location", () => {
  const text = "正文 image###portrait, soft light### 后文";
  assert.deepEqual(parseImageMarkers(text), [{
    index: 3,
    end: 34,
    prompt: "portrait, soft light",
    marker: "image###portrait, soft light###",
  }]);
});

test("supports multiline prompts and multiple markers", () => {
  const text = "A image###first\nline### B image###second###";
  const markers = parseImageMarkers(text);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].prompt, "first\nline");
  assert.equal(markers[1].prompt, "second");
});

test("ignores empty and incomplete markers", () => {
  assert.deepEqual(parseImageMarkers("image###### image###unfinished"), []);
  assert.equal(inspectMessage("image###unfinished", { isFinal: true }).ready, false);
});

test("does not mark a streaming partial message ready", () => {
  const result = inspectMessage("image###complete###", { isFinal: false });
  assert.equal(result.markers.length, 1);
  assert.equal(result.ready, false);
  assert.equal(result.visibleText, "");
});

test("removes all complete markers without deleting surrounding prose", () => {
  assert.equal(
    inspectMessage("before image###one### middle image###two### after", { isFinal: true }).visibleText,
    "before  middle  after",
  );
});

test("trigger IDs require stable identifiers", () => {
  assert.equal(makeTriggerId({ chatId: "chat", messageId: 4, markerIndex: 12 }), "chat:4:12");
  assert.throws(() => makeTriggerId({ chatId: "chat", markerIndex: 12 }), TypeError);
});

test("registry prevents duplicate successful work and permits explicit retry after failure", () => {
  const registry = new TriggerRegistry();
  assert.equal(registry.begin("x").accepted, true);
  registry.markRunning("x");
  registry.markSucceeded("x", "image-1");
  assert.equal(registry.begin("x").accepted, false);
  assert.deepEqual(registry.get("x").resultIds, ["image-1"]);

  assert.equal(registry.begin("y").accepted, true);
  registry.markFailed("y", "offline");
  assert.equal(registry.retry("y").accepted, true);
  assert.equal(registry.get("y").attempts, 2);
});
