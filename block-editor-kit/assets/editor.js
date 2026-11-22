import { createRichText } from './rich-text.js';
import { attachTableControls } from './tables.js';
import { attachCaret } from './caret.js';

const template = `
 <div class="bek-tools">
  <div class="note-rich-toolbar">
   <button data-insert-table type="button" data-tooltip="插入表格" aria-label="插入表格"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12"/></svg></button>
  </div>
 </div>
 <div class="bek-document-frame">
 <div class="bek-document-scroll">
 <div class="bek-document">
 <textarea></textarea>
 <div class="note-table-controls" hidden role="group" aria-label="表格操作">
  <div class="note-table-outline" hidden aria-hidden="true"></div>
  <button type="button" class="note-table-handle note-table-column-handle" data-table-axis="column" aria-label="列操作，拖动调整列顺序" aria-expanded="false" aria-controls="@menuId@" hidden><span aria-hidden="true"></span></button>
  <button type="button" class="note-table-handle note-table-row-handle" data-table-axis="row" aria-label="行操作，拖动调整行顺序" aria-expanded="false" aria-controls="@menuId@" hidden><span aria-hidden="true"></span></button>
  <div class="note-table-options">
   <button type="button" class="note-table-icon" data-table-action="options" title="点击打开表格选项，按住拖动整张表格" aria-label="表格选项，拖动移动整张表格" aria-expanded="false" aria-controls="@menuId@">⋯</button>
   <div id="@menuId@" class="note-table-menu" hidden>
    <button type="button" data-table-action="header-row" aria-pressed="false">标题行</button>
    <button type="button" data-table-action="header-column" aria-pressed="false">标题列</button>
    <button type="button" data-table-action="insert-row-above">在上方插入行</button>
    <button type="button" data-table-action="insert-row">在下方插入行</button>
    <button type="button" data-table-action="insert-column-left">在左侧插入列</button>
    <button type="button" data-table-action="insert-column">在右侧插入列</button>
    <button type="button" data-table-action="delete-row">删除当前行</button>
    <button type="button" data-table-action="delete-column">删除当前列</button>
    <button type="button" data-table-action="duplicate-table">复制表格</button>
    <button type="button" data-table-action="delete-table">删除表格</button>
   </div>
  </div>
  <button type="button" class="note-table-icon note-table-add-row" data-table-action="append-row" title="添加一行" aria-label="添加一行">+</button>
  <button type="button" class="note-table-icon note-table-add-column" data-table-action="append-column" title="添加一列" aria-label="添加一列">+</button>
  <div class="note-table-resize-guide" hidden aria-hidden="true"></div>
  <div class="note-table-drag-preview" hidden inert aria-hidden="true"></div>
 </div>
 <div class="note-text-selection" aria-hidden="true"></div>
 </div>
 </div>
 </div>
`;

let nextMenuId = 0;

export function mountBlockEditor(host, {
  html = '', text = '', label = '正文', placeholder = '开始输入…', onChange
} = {}) {
  if (!(host instanceof HTMLElement)) throw new TypeError('An HTML host element is required');
  const root = document.createElement('div');
  root.className = 'block-editor-kit';
  root.innerHTML = template.replaceAll('@menuId@', 'bek-table-menu-' + ++nextMenuId);
  host.append(root);

  const lifetime = new AbortController();
  const listen = (target, event, handler, capture = false) => {
    target.addEventListener(event, handler, { capture, signal: lifetime.signal });
  };

  const textarea = root.querySelector('textarea');
  textarea.setAttribute('aria-label', label);
  textarea.placeholder = placeholder;
  const editor = createRichText(textarea, root.querySelector('.bek-tools'), listen);
  const scrollPort = root.querySelector('.bek-document-scroll');
  const cancelTableInteraction = attachTableControls(
    editor.element, scrollPort, root.querySelector('.note-table-controls'),
    root.querySelector('.note-text-selection'), listen
  );
  const stopCaret = attachCaret(editor.element, scrollPort, listen);
  const insertTable = root.querySelector('[data-insert-table]');
  listen(insertTable, 'mousedown', event => event.preventDefault());
  listen(insertTable, 'click', editor.insertTable);

  editor.set(text, html);
  if (onChange) listen(editor.element, 'input', () => onChange(editor.html()));

  return {
    element: editor.element,
    setContent({ html = '', text = '' } = {}) {
      cancelTableInteraction();
      editor.set(text, html);
    },
    getHTML: editor.html,
    getText: editor.text,
    destroy() {
      cancelTableInteraction();
      stopCaret();
      lifetime.abort();
      root.remove();
    }
  };
}
