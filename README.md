# Block Editor Kit · 块式富文本编辑器

面向网页和桌面 WebView 的块式编辑器，源自 Tidex「交易模式」。仓库包含可安装的 Codex Skill 和一套无第三方运行依赖的浏览器组件。

支持标题、正文、嵌套列表、块内文字格式、拖拽排序、可编辑表格、行列固定和调整列宽。演示包含深浅主题和浏览器本地草稿保存。

## 先试用

下载并解压仓库，在包含本 README 的目录运行以下命令。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

浏览器打开 [编辑器演示](http://127.0.0.1:8000/block-editor-kit/assets/demo.html)。组件使用浏览器 ES Module，需要通过本地服务器打开。建议使用新版 Chrome 或 Edge。

## 在 Codex 中用作 Skill

将仓库内含 `SKILL.md` 的整个 `block-editor-kit/` 目录放到目标项目的 `.agents/skills/` 中。新建 Codex 对话后输入「用 `$block-editor-kit` 给这个页面接入块式富文本编辑器」。完整目录包含交互规则、接入指南和组件源码。

## 在应用中直接使用组件

把 [assets](block-editor-kit/assets/) 中的 JavaScript 模块和 `editor.css` 放进项目，使用 `mountBlockEditor(host, options)` 挂载，接入应用已有的主题与保存流程。详见[接入指南](block-editor-kit/references/integration.md)。

## License

[MIT](LICENSE)
