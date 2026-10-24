# 轻绘 Lite

轻绘 Lite 是独立于仓库根目录原插件的精简版 SillyTavern 扩展，优先适配手机端。

## 当前可安装测试范围（v0.1.0）

- 可作为第三方扩展加载，在扩展设置区域显示独立生图面板。
- GPT / OpenAI 兼容 `/images/generations` 接口：配置地址、API Key、模型、尺寸与质量。
- NovelAI 通过酒馆内置 `/api/novelai/generate-image` 代理请求，使用酒馆已配置的 NovelAI 连接；可设置模型、步数、CFG、尺寸、采样器与调度器。
- 手动输入完整提示词，一次请求一张图片。
- 在 `GENERATION_ENDED` 后扫描最新助手消息，识别完整 `image###提示词###` 标记并在消息正文中隐藏标记文本，再生成并插入图片卡。
- 识别状态栏正则创建的 `.shot-frame.scanning` 目标容器（包括同源 iframe），在该画面框内生成并显示图片；状态栏图片卡支持候选切换和再绘，不会主动 Roll 酒馆回复。
- 支持同一消息多个标记、生成失败后的显式“点击重试”、同一图片卡内追加再绘候选并左右切换。
- 监听消息 swipe 和聊天切换；切换聊天时清空进程内去重表。
- 生成记录保存在 SillyTavern 扩展设置中，可载入历史提示词、清空记录。
- 使用酒馆主题变量，样式限定在轻绘面板内。

**目前尚未完成：** 预设/角色库/完整提示词库/Vibe 导入、独立图片缓存图库，以及聊天图片卡与状态栏候选的统一数据层。状态栏已按 `.shot-frame.scanning` 做定向注入，但尚未在你的实际酒馆环境验证 iframe 重绘、原正则观察器和不同模板的兼容性。NovelAI 请求已接入酒馆内置代理，但还未在你的实际环境验证模型参数与响应格式。自动聊天触发目前只在消息结束后扫描最新助手消息；尚未验证所有酒馆版本及 swipe 细节。这个版本仍需在你的酒馆实际测试，不代表全部功能已经完成。

## 安装到 SillyTavern（Termux）

在酒馆扩展目录执行以下命令。它会只下载 `lite/` 目录中的文件，不动仓库根目录的原插件：

```bash
cd ~/SillyTavern/data/default-user/extensions
mkdir -p qinghui-lite
cd qinghui-lite
curl -fL https://raw.githubusercontent.com/1614130601zjs-del/draw/feature/lite-image-core/lite/manifest.json -o manifest.json
curl -fL https://raw.githubusercontent.com/1614130601zjs-del/draw/feature/lite-image-core/lite/index.js -o index.js
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
- `trigger-core.js`：独立的触发标记解析与任务状态核心，目前尚未绑定酒馆消息事件。
- `tests/trigger-core.test.js`：触发解析、消息完成门控、去重和显式重试的回归测试。

## 触发核心测试

本地安装 Node.js 后，在 `lite/` 目录执行：

```bash
cd lite
npm test
```

- `ARCHITECTURE.md` / `TRIGGER-CORE.md`：模块边界和触发状态说明。
