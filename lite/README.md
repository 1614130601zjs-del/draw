# 轻绘 Lite

轻绘 Lite 是独立于仓库根目录原插件的精简版 SillyTavern 扩展，优先适配手机端。

## 当前可安装测试范围（v0.1.0）

- 可作为第三方扩展加载，在扩展设置区域显示独立生图面板。
- GPT / OpenAI 兼容 `/images/generations` 接口：配置地址、API Key、模型、尺寸与质量。
- NovelAI 通过酒馆内置 `/api/novelai/generate-image` 代理请求，使用酒馆已配置的 NovelAI 连接；可设置模型、步数、CFG、尺寸、采样器与调度器。
- 手动输入完整提示词，一次请求一张图片。
- 监听当前酒馆版本可用的 `STREAM_TOKEN_RECEIVED`、`MESSAGE_UPDATED`、`GENERATION_ENDED` 等事件；发现完整 `image###提示词###` 标记后尝试提前触发，并以生成结束事件兜底。是否能在所有酒馆版本实现流式提前触发，仍需实机验证。识别后会在消息正文中隐藏标记文本，再生成并插入图片卡。
- 识别状态栏正则创建的 `.shot-frame.scanning` 目标容器（包括同源 iframe），在目标画面框上叠加加载提示和图片卡，不再清空容器原有子节点；状态栏图片卡支持候选切换和再绘，不会主动 Roll 酒馆回复。
- 支持同一消息多个标记、生成失败后的显式“点击重试”、同一图片卡内追加再绘候选；图片支持按钮切换和手机横向滑动。
- 图片长按/上下文菜单触发保存当前展示图；生成记录保存后端、模型、尺寸、质量和 NovelAI 参数快照，便于后续实现可复现的“再次绘制”。
- 监听消息 swipe 和聊天切换；切换聊天时清空进程内去重表。事件监听采用防抖，避免流式 token 连续到达时重复扫描。
- 生成记录保存在 SillyTavern 扩展设置中，可载入历史提示词、清空记录。
- 使用酒馆主题变量，样式限定在轻绘面板内。

**目前尚未完成：** 预设/角色库/完整提示词库/Vibe 导入、独立图片缓存图库，以及聊天图片卡与状态栏候选的统一数据层。状态栏已按 `.shot-frame.scanning` 做定向注入，但尚未在你的实际酒馆环境验证 iframe 重绘、原正则观察器和不同模板的兼容性。NovelAI 请求已接入酒馆内置代理，但还未在你的实际环境验证模型参数与响应格式。自动聊天触发现在会尝试监听流式事件并在完整标记出现后提前扫描，同时保留生成结束兜底；触发任务使用统一注册表管理去重、成功、失败重试和候选追加。尚未验证所有酒馆版本及 swipe 细节。这个版本仍需在你的酒馆实际测试，不代表全部功能已经完成。

## 安装到 SillyTavern（Termux）

在酒馆扩展目录执行以下命令。它会只下载 `lite/` 目录中的文件，不动仓库根目录的原插件：

```bash
cd ~/SillyTavern/data/default-user/extensions
mkdir -p qinghui-lite
cd qinghui-lite
curl -fL https://raw.githubusercontent.com/1614130601zjs-del/draw/feature/lite-image-core/lite/manifest.json -o manifest.json
curl -fL https://raw.githubusercontent.com/1614130601zjs-del/draw/feature/lite-image-core/lite/index.js -o index.js
curl -fL https://raw.githubusercontent.com/1614130601zjs-del/draw/feature/lite-image-core/lite/trigger-core.js -o trigger-core.js
curl -fL https://raw.githubusercontent.com/1614130601zjs-del/draw/feature/lite-image-core/lite/extension.css -o extension.css
```

然后刷新酒馆页面，在扩展设置里找到“轻绘 Lite”。如果目录已存在，请先备份或确认是轻绘目录，再覆盖文件。

## API 配置提示

- API 地址填写供应商提供的 OpenAI 兼容 API 根地址，通常以 `/v1` 结尾；扩展会在其后拼接 `/images/generations`。
- API Key 仅存于当前酒馆扩展设置，不写入仓库。
- 部分服务商不允许浏览器跨域请求（CORS）；如果请求被浏览器拦截，需要后续增加酒馆代理适配或使用供应商支持的跨域配置。
- 目前按 OpenAI 图像生成响应中的 `data[0].b64_json`、`data[0].url` 或常见 `images[0]` 解析结果。不同供应商的请求体/响应体若不兼容，需要单独适配。

## 目录

- `index.html` / `style.css` / `app.js`：独立浏览器 UI 原型，方便快速查看完整页面导航与模块布局。
- `manifest.json` / `index.js` / `extension.css`：可安装的 SillyTavern 测试扩展。
- `trigger-core.js`：触发标记解析与 `TriggerRegistry` 任务状态核心；聊天自动触发、状态栏初次生成、失败重试和再绘候选已接入统一任务状态管理。
- `trigger-core.test.js`：触发解析、消息完成门控、去重、重试和再绘候选保留的回归测试。

## 触发核心测试

本地安装 Node.js 后，在 `lite/` 目录执行：

```bash
cd lite
node --test trigger-core.test.js
```

- `ARCHITECTURE.md` / `TRIGGER-CORE.md`：模块边界和触发状态说明。
