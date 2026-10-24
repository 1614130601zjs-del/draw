# 轻绘 Lite

轻绘 Lite 是独立于仓库根目录原插件的精简版 SillyTavern 扩展，优先适配手机端。

## 当前可安装测试范围（v0.1.0）

- 可作为第三方扩展加载，在扩展设置区域显示独立生图面板。
- OpenAI 兼容 `/images/generations` 接口：配置地址、API Key、模型、尺寸与质量。
- 手动输入完整提示词，一次请求一张图片。
- 生成记录保存在 SillyTavern 扩展设置中，可载入历史提示词、清空记录。
- 使用酒馆主题变量，样式限定在轻绘面板内。

**目前尚未完成：** NovelAI 请求、`image###提示词###` 自动触发与隐藏、酒馆消息事件绑定、状态栏目标容器回填、预设/角色库/完整提示词库/Vibe 导入、独立图片缓存图库。这个版本适合先确认能否安装、面板是否正常、你的 OpenAI 兼容接口是否可用，不代表完整功能已经完成。

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
- `ARCHITECTURE.md` / `TRIGGER-CORE.md`：模块边界和触发状态说明。
