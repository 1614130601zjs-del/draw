# 轻绘 Lite

这是用于 SillyTavern 测试的轻量生图插件安装分支。

## 安装入口文件

本分支根目录已将轻绘 Lite 设为插件入口：

- `manifest.json`：显示名称为“轻绘 Lite”
- `index.js`：插件入口
- `extension.css`：插件样式
- `trigger-core.js`：消息标记解析与触发任务核心

## 当前状态

这是测试版，不能视为已完成酒馆实机验证。NovelAI Vibe 的导入数据仍需确认编码载荷格式；遇到无法识别的载荷时，插件会报错而不是把缩略图当成 Vibe 输入。

## 分支说明

- `installable-lite`：Lite 根目录安装结构
- `feature/lite-image-core`：主要开发目录，Lite 文件位于 `lite/` 子目录
- 默认分支保留原项目入口，不在这里覆盖
