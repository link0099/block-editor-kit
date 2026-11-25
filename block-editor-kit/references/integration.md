# 接入块式富文本编辑器

## 浏览器和桌面 WebView

将 `assets/` 中的 `editor.js`、`rich-text.js`、`blocks.js`、`tables.js`、`caret.js`、`history.js` 和 `editor.css` 一起放进目标应用。保持 JavaScript 文件的相对位置。通过应用的开发服务器运行。如需单独体验，在 Skill 的 `assets/` 目录运行 `python3 -m http.server 8000 --bind 127.0.0.1`，然后打开 `http://127.0.0.1:8000/demo.html`。

```html
<link rel="stylesheet" href="./editor/editor.css">
<div id="document"></div>
<script type="module">
  import { mountBlockEditor } from './editor/editor.js';

  const editor = mountBlockEditor(document.querySelector('#document'), {
    label: '笔记正文',
    text: '从这里开始',
    onChange(html) {
      // 将最新的 HTML 交给应用自己的草稿保存流程。
    }
  });
</script>
```

- `html` 用于读取历史富文本，`text` 可用于读取旧纯文本。切换文档时用 `setContent({ html })` 或 `setContent({ text })`，它们不触发 `onChange`。卸载组件时调用 `destroy()`。
- `getHTML()` 返回已规范化的 HTML，`getText()` 可用于纯文本预览。表格列宽、标题开关、编号起点和缩进层级随 HTML 保存。应用在存储或在其他页面渲染用户输入时，应遵循自身的内容清理和访问控制规则。
- `onChange(html)` 在每个实际编辑事务完成后触发一次（同一次编辑的多个输入事件会合并）；撤销和重做也走同一个保存回调。宿主应用负责防抖、异步保存顺序、失败重试、保存反馈和退出前提交。只有写入确认成功才更新「最近修改」及已保存状态。
- 用 `--bek-height` 调整编辑器高度。可在容器设置 `--bek-surface`、`--bek-soft`、`--bek-hover`、`--bek-text`、`--bek-muted`、`--bek-line`、`--bek-accent` 和 `--bek-font-size`。在祖先设置 `data-theme="dark"` 启用内置深色样式。
- 示例为无第三方运行依赖的浏览器 ES Module。目标运行时需要支持模块脚本、`Intl.Segmenter`、`:has()` 和 CSS `@scope`。行内格式沿用浏览器编辑命令，撤销和重做由组件历史统一处理。接入已有编辑器时，使用它原有的事务和历史接口，不叠加两套。

## 撤销与重做

- 工具栏提供「撤销」「重做」；也可调用 `editor.undo()` / `editor.redo()`（实际生效返回 `true`），用 `editor.canUndo()` / `editor.canRedo()` 检查状态。快捷键只在当前编辑器内生效。
- 每个编辑器实例最多缓存当前文档最近 100 次操作。历史仅在内存中；`setContent()` 用于加载或切换文档，会重置历史，不要在每次自动保存后调用它。刷新或卸载不会保留历史，已保存正文不受影响。
