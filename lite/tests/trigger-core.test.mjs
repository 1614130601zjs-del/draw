import test from "node:test";
import assert from "node:assert/strict";
import {
  parseImageMarkers,
  inspectMessage,
  makeTriggerId,
  TriggerRegistry,
} from "../trigger-core.js";

test("parses one complete image marker and preserves its exact offsets", () => {
  const text = "正文 image###portrait, soft light### 后续";
  const [marker] = parseImageMarkers(text);
  assert.equal(marker.prompt, "portrait, soft light");
  assert.equal(marker.index, text.indexOf("image###"));
  assert.equal(text.slice(marker.index, marker.end), marker.marker);
});

test("supports multiple markers in one message", () => {
  const markers = parseImageMarkers("A image###first### B image###second###");
  assert.deepEqual(markers.map(item => item.prompt), ["first", "second"]);
});

test("ignores empty and incomplete markers", () => {
  assert.deepEqual(parseImageMarkers("image###### image###unfinished"), []);
});

test("does not report a message ready until generation is final", () => {
  const partial = inspectMessage("image###portrait###", { isFinal: false });
  assert.equal(partial.ready, false);
  assert.equal(partial.markers.length, 1);
  const final = inspectMessage("image###portrait###", { isFinal: true });
  assert.equal(final.ready, true);
});

test("removes complete markers from visible text without removing prose", () => {
  assert.equal(
    inspectMessage("before image###hidden prompt### after", { isFinal: true }).visibleText,
    "before  after",
  );
});

test("requires stable IDs for trigger identity", () => {
  assert.equal(makeTriggerId({ chatId: "c", messageId: "m", markerIndex: 7 }), "c:m:7");
  assert.throws(() => makeTriggerId({ chatId: "c", messageId: "m" }), TypeError);
});

test("registry deduplicates active and successful tasks but permits explicit retry after failure", () => {
  const registry = new TriggerRegistry();
  assert.equal(registry.begin("c:m:0", { prompt: "one" }).accepted, true);
  assert.equal(registry.begin("c:m:0").accepted, false);
  registry.markRunning("c:m:0");
  registry.markSucceeded("c:m:0", "image-1");
  assert.equal(registry.begin("c:m:0").accepted, false);
  assert.deepEqual(registry.get("c:m:0").resultIds, ["image-1"]);

  assert.equal(registry.begin("c:m:1").accepted, true);
  registry.markRunning("c:m:1");
  registry.markFailed("c:m:1", "temporary failure");
  assert.equal(registry.retry("c:m:1").accepted, true);
  assert.equal(registry.get("c:m:1").attempts, 2);
});
