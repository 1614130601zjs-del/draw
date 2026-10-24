/**
 * 轻绘触发核心（纯逻辑层，尚未绑定 SillyTavern 事件）。
 *
 * 设计目标：
 * - 只识别完整的 image###提示词### 标记，避免流式过程中提前触发；
 * - 允许同一消息内多个标记；
 * - 由调用方提供稳定 messageId / targetKey，不通过全局 DOM 猜测目标；
 * - 每次请求一张；同一 triggerId 的新结果由上层追加，不覆盖旧图。
 *
 * 真实 ST 事件、后端请求、状态栏 DOM 和持久化需要在核对原插件调用链后接入。
 */

export const IMAGE_MARKER = "image###";

export function parseImageMarkers(text) {
  if (typeof text !== "string" || !text) return [];
  const found = [];
  const re = /image###([\s\S]*?)###/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const prompt = match[1].trim();
    if (!prompt) continue;
    found.push({
      index: match.index,
      end: re.lastIndex,
      prompt,
      marker: match[0],
    });
  }
  return found;
}

/**
 * 仅从完整消息文本提取标记。流式中间态应由调用方传入 isFinal=false，
 * 以免半截标记或尚未闭合的提示词触发生图。
 */
export function inspectMessage(text, { isFinal = false } = {}) {
  const markers = parseImageMarkers(text);
  return {
    markers,
    ready: isFinal && markers.length > 0,
    visibleText: typeof text === "string"
      ? text.replace(/image###([\s\S]*?)###/g, "").trim()
      : "",
  };
}

export function makeTriggerId({ chatId, messageId, markerIndex }) {
  if (chatId == null || messageId == null || markerIndex == null) {
    throw new TypeError("chatId、messageId 和 markerIndex 都是必需的稳定标识");
  }
  return [chatId, messageId, markerIndex].map(String).join(":");
}

/**
 * 小型幂等任务表。状态变化：
 * pending -> running -> succeeded | failed
 * failed 可由用户显式 retry；同一 trigger 的成功结果不会被静默覆盖。
 */
export class TriggerRegistry {
  #tasks = new Map();

  begin(triggerId, payload = {}) {
    const existing = this.#tasks.get(triggerId);
    if (existing && ["pending", "running", "succeeded"].includes(existing.status)) {
      return { accepted: false, task: { ...existing } };
    }
    const task = {
      triggerId,
      status: "pending",
      attempts: (existing?.attempts ?? 0) + 1,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      resultIds: existing?.resultIds ?? [],
      payload: { ...payload },
      error: null,
    };
    this.#tasks.set(triggerId, task);
    return { accepted: true, task: { ...task } };
  }

  markRunning(triggerId) {
    return this.#update(triggerId, task => {
      if (task.status !== "pending") throw new Error("只有 pending 任务可以启动");
      task.status = "running";
    });
  }

  markSucceeded(triggerId, resultId) {
    return this.#update(triggerId, task => {
      if (task.status !== "running") throw new Error("只有 running 任务可以成功结束");
      task.status = "succeeded";
      if (resultId != null) task.resultIds = [...task.resultIds, resultId];
      task.error = null;
    });
  }

  markFailed(triggerId, errorMessage = "生成失败") {
    return this.#update(triggerId, task => {
      if (task.status !== "running" && task.status !== "pending") {
        throw new Error("当前任务状态不允许标记失败");
      }
      task.status = "failed";
      task.error = String(errorMessage);
    });
  }

  retry(triggerId, payload) {
    const existing = this.#tasks.get(triggerId);
    if (!existing || existing.status !== "failed") {
      return { accepted: false, task: existing ? { ...existing } : null };
    }
    return this.begin(triggerId, payload ?? existing.payload);
  }

  get(triggerId) {
    const task = this.#tasks.get(triggerId);
    return task ? { ...task, resultIds: [...task.resultIds], payload: { ...task.payload } } : null;
  }

  #update(triggerId, update) {
    const task = this.#tasks.get(triggerId);
    if (!task) throw new Error(`未知触发任务：${triggerId}`);
    update(task);
    task.updatedAt = Date.now();
    return { ...task, resultIds: [...task.resultIds], payload: { ...task.payload } };
  }
}
