// A linear, session-only history. Retain changed spans, not 100 full document copies.
export function createEditHistory(initialHTML, limit = 100) {
  const entries = [];
  let html = initialHTML;
  let cursor = 0;

  return {
    get html() { return html; },
    get canUndo() { return cursor > 0; },
    get canRedo() { return cursor < entries.length; },
    record(next, beforeSelection, afterSelection) {
      if (next === html) return false;
      let start = 0, end = 0;
      const common = Math.min(html.length, next.length);
      while (start < common && html[start] === next[start]) start++;
      while (end < common - start && html[html.length - 1 - end] === next[next.length - 1 - end]) end++;
      entries.splice(cursor);
      entries.push({
        start, removed: html.slice(start, html.length - end),
        added: next.slice(start, next.length - end), beforeSelection, afterSelection
      });
      if (entries.length > limit) entries.shift();
      cursor = entries.length;
      html = next;
      return true;
    },
    step(redo) {
      if (redo ? !this.canRedo : !this.canUndo) return null;
      const edit = entries[redo ? cursor++ : --cursor];
      const from = redo ? edit.removed : edit.added;
      const to = redo ? edit.added : edit.removed;
      html = html.slice(0, edit.start) + to + html.slice(edit.start + from.length);
      return { html, selection: redo ? edit.afterSelection : edit.beforeSelection };
    }
  };
}

function endpoint(root, node, offset) {
  if (!root.contains(node)) return null;
  const path = [];
  for (let current = node; current !== root; current = current.parentNode) {
    path.unshift(Array.prototype.indexOf.call(current.parentNode.childNodes, current));
  }
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return { path, offset, type: node.nodeType, textOffset: range.toString().length };
}

export function captureSelection(root) {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const anchor = endpoint(root, selection.anchorNode, selection.anchorOffset);
  const focus = endpoint(root, selection.focusNode, selection.focusOffset);
  return anchor && focus ? { anchor, focus } : null;
}

function resolveEndpoint(root, point) {
  let node = root;
  for (const index of point.path) node = node?.childNodes[index];
  if (node?.nodeType === point.type) {
    const size = node.nodeType === 3 ? node.length : node.childNodes.length;
    if (point.offset <= size && endpoint(root, node, point.offset).textOffset === point.textOffset) {
      return [node, point.offset];
    }
  }
  // Serialization can merge adjacent text nodes or remove temporary caret lines.
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  let offset = point.textOffset;
  while ((node = walker.nextNode())) {
    if (offset <= node.length) return [node, offset];
    offset -= node.length;
  }
  return [root, root.childNodes.length];
}

export function restoreSelection(root, saved) {
  root.focus({ preventScroll: true });
  const selection = root.ownerDocument.getSelection();
  if (!saved) selection.collapse(root, root.childNodes.length);
  else selection.setBaseAndExtent(...resolveEndpoint(root, saved.anchor), ...resolveEndpoint(root, saved.focus));
}
