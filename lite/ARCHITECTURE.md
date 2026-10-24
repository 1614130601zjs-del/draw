# 轻绘 Lite 模块边界

## 运行时模块（后续拆分）

- `trigger/`：识别 `image###...###`，处理流式片段、手动按钮、去重与任务状态。
- `providers/openai/`：GPT/OpenAI 图片生成请求与响应归一化。
- `providers/novelai/`：NovelAI 图片生成与 Vibe 参数。
- `chat/`：消息 ID、swipe / reroll 生命周期和结果卡片。
- `statusbar/`：保留状态栏正则创建的按钮与容器，建立明确的目标容器引用。
- `storage/`：SillyTavern 本地持久化适配；记录原图、干净展示图、提示词、参数和来源关联。
- `library/presets/`：画师串、负向词、默认参数与预设版本。
- `library/vibes/`：Vibe 原始图、编码数据、强度、信息提取参数与兼容性元数据。
- `library/characters/`：手动外貌词、可选 LLM 提取、人工确认与角色预设绑定。
- `library/prompts/`：完整可复用提示词、语言类型、分类、例图与备注。
- `gallery/`：瀑布流、筛选、选择、删除、导出与大图预览。
- `settings/`：后端凭据、LLM 配置、外观、包裹样式和触发行为。

## 关键数据关系

每次生成创建独立的 generation record，最少包含：
- generationId、triggerId、messageId、chatId、characterId（可空）
- provider、prompt、negativePrompt、presetId 和当时使用的参数快照
- 生成时间、原始图片引用、干净展示图引用
- statusbarContainerKey（仅状态栏触发时有值）

同一触发标记的多次生成共享 triggerId，并追加不同 generationId；当前展示图只是一项选择，不代表删除其他结果。

## 必须先验证，不能猜测

- 原插件对流式输出、swipe、生成停止和消息删除的实际事件。
- GPT/OpenAI 与 NAI 请求的实际参数格式、鉴权和图片响应格式。
- 酒馆当前版本的本地文件保存与消息更新 API。
- 状态栏正则所创建 DOM 容器的稳定标识及重绘行为。
- NAI Vibe 编码格式、导入导出与版本兼容边界。

未验证之前，UI 骨架不得伪装成可生图或已持久化的正式插件。
