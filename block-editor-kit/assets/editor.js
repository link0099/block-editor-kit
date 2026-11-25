import { createRichText } from './rich-text.js';
import { attachTableControls } from './tables.js';
import { attachCaret } from './caret.js';
import { createEditHistory, captureSelection, restoreSelection } from './history.js';

const template = `
 <div class="bek-tools">
  <div class="note-rich-toolbar" role="group" aria-label="编辑操作">
   <button data-history-undo type="button" data-tooltip="撤销" aria-label="撤销" aria-keyshortcuts="Control+Z Meta+Z" disabled><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3 2.5 6.5 6 10M3 6.5h6a4 4 0 0 1 4 4v1.5"/></svg></button>
   <button data-history-redo type="button" data-tooltip="重做" aria-label="重做" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 3 3.5 3.5L10 10m3-3.5H7a4 4 0 0 0-4 4v1.5"/></svg></button>
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
  const element = editor.element;
  const undoButton = root.querySelector('[data-history-undo]');
  const redoButton = root.querySelector('[data-history-redo]');
  let history = createEditHistory(editor.html());
  let beforeSelection = null;
  let composing = false, pending = false, generation = 0, destroyed = false;

  function refreshHistoryButtons() {
    undoButton.disabled = composing || !history.canUndo;
    redoButton.disabled = composing || !history.canRedo;
  }
  function rememberBefore() {
    if (pending || composing) return;
    const selection = captureSelection(element);
    if (selection) beforeSelection = selection;
  }
  function commit() {
    if (!pending || composing || destroyed) return;
    pending = false;
    const next = editor.html();
    const selection = captureSelection(element);
    const changed = history.record(next, beforeSelection, selection);
    if (selection) beforeSelection = selection;
    refreshHistoryButtons();
    if (changed) onChange?.(next);
  }
  function queueCommit() {
    if (pending) return;
    pending = true;
    const expected = generation;
    queueMicrotask(() => { if (expected === generation) commit(); });
  }
  function step(redo) {
    if (composing || destroyed) return false;
    const activeHistory = history;
    commit();
    if (destroyed || activeHistory !== history) return false;
    const next = history.step(redo);
    if (!next) return false;
    cancelTableInteraction();
    editor.set('', next.html);
    restoreSelection(element, next.selection);
    beforeSelection = captureSelection(element);
    refreshHistoryButtons();
    onChange?.(next.html);
    return true;
  }
  listen(root, 'keydown', event => {
    if (event.isComposing || composing || event.keyCode === 229 || event.altKey ||
        event.metaKey === event.ctrlKey) return;
    const key = event.key.toLowerCase();
    const undo = key === 'z' && !event.shiftKey;
    const redo = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.shiftKey);
    if (!undo && !redo) return;
    event.preventDefault();
    event.stopPropagation();
    step(redo);
  }, true);
  listen(element, 'beforeinput', event => {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      if (event.cancelable) {
        event.preventDefault();
        if (!event.isComposing) step(event.inputType === 'historyRedo');
      }
      return;
    }
    rememberBefore();
  }, true);
  listen(element, 'input', event => {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      // A WebView may perform a noncancelable native edit first. Restore the
      // current managed state before moving the managed cursor.
      if (composing) return;
      const redo = event.inputType === 'historyRedo';
      cancelTableInteraction();
      editor.set('', history.html);
      restoreSelection(element, beforeSelection);
      step(redo);
      return;
    }
    if (!event.isComposing && !composing) queueCommit();
  });
  listen(element, 'compositionstart', () => {
    commit();
    rememberBefore();
    composing = true;
    refreshHistoryButtons();
  });
  listen(element, 'compositionend', () => {
    composing = false;
    queueCommit();
    refreshHistoryButtons();
  });
  listen(document, 'selectionchange', rememberBefore);
  for (const event of ['keydown', 'pointerdown', 'paste', 'cut']) listen(root, event, rememberBefore, true);
  for (const [button, redo] of [[undoButton, false], [redoButton, true]]) {
    listen(button, 'mousedown', event => event.preventDefault());
    listen(button, 'click', () => step(redo));
  }

  return {
    element,
    setContent({ html = '', text = '' } = {}) {
      ++generation;
      pending = false;
      composing = false;
      beforeSelection = null;
      cancelTableInteraction();
      editor.set(text, html);
      history = createEditHistory(editor.html());
      refreshHistoryButtons();
    },
    undo: () => step(false),
    redo: () => step(true),
    canUndo: () => !composing && history.canUndo,
    canRedo: () => !composing && history.canRedo,
    getHTML: editor.html,
    getText: editor.text,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pending = false;
      cancelTableInteraction();
      stopCaret();
      lifetime.abort();
      root.remove();
    }
  };
}
