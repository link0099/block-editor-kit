// Scroll the editor, not the host page. A new block may start with a <br>
// or contain the wrapped tail of the previous block.
export function keepNewBlockInView(editor, scrollPort, expectedLine) {
  const selection = editor.ownerDocument.getSelection();
  if (editor.ownerDocument.activeElement !== editor || !selection?.isCollapsed ||
      !selection.rangeCount || !editor.contains(selection.focusNode)) return 0;
  const anchor = selection.focusNode;
  const element = anchor.nodeType === 3 ? anchor.parentElement : anchor;
  const line = element.closest('li,p,h2,h3,h4,blockquote');
  if (!line || (expectedLine && line !== expectedLine) || line.closest('table')) return 0;
  const rect = selection.getRangeAt(0).getClientRects()[0];
  const view = editor.ownerDocument.defaultView;
  const padding = parseFloat(view.getComputedStyle(editor).paddingBottom) || 0;
  const lineBox = line.getBoundingClientRect();
  const lineHeight = parseFloat(view.getComputedStyle(line).lineHeight) || lineBox.height;
  const caretBottom = rect?.height ? rect.bottom : lineBox.top + Math.min(lineBox.height, lineHeight);
  const viewport = scrollPort.getBoundingClientRect();
  const bottom = viewport.top + scrollPort.clientTop + scrollPort.clientHeight;
  const safe = Math.min(padding, Math.max(0, scrollPort.clientHeight - lineHeight));
  const delta = Math.ceil(caretBottom + safe - bottom);
  if (delta <= 0 || !scrollPort.clientHeight) return 0;
  const previous = scrollPort.scrollTop;
  scrollPort.scrollTop = Math.min(previous + delta, Math.max(0, scrollPort.scrollHeight - scrollPort.clientHeight));
  return scrollPort.scrollTop - previous;
}

export function attachEditorViewport(editor, scrollPort, listen) {
  let followFrame, fitFrame;
  const followNewBlock = line => {
    cancelAnimationFrame(followFrame);
    followFrame = requestAnimationFrame(() => keepNewBlockInView(editor, scrollPort, line));
  };

  // Keep persisted pixel widths untouched. Only the rendered track sizes
  // are proportional when a hand-sized table cannot fit the viewport.
  function fitTables() {
    fitFrame = undefined;
    if (!editor.clientWidth) return;
    for (const table of editor.querySelectorAll(':scope > table')) {
      const columns = [...table.querySelectorAll(':scope > colgroup[data-note-widths] > col')];
      const widths = columns.map(col => parseFloat(col.style.width) || 0);
      const sum = widths.reduce((total, width) => total + width, 0);
      const fit = columns.length > 0 && Math.max(sum, parseFloat(table.style.width) || 0) > editor.clientWidth;
      table.classList.toggle('bek-table-fit', fit);
      if (!fit) continue;
      for (let i = 0; i < columns.length; i++) {
        const width = sum && widths[i] ? (widths[i] / sum * 100).toFixed(4) + '%' : 'auto';
        if (columns[i].style.getPropertyValue('--bek-fit-column') !== width) {
          columns[i].style.setProperty('--bek-fit-column', width);
        }
      }
    }
  }
  const scheduleFit = () => { if (fitFrame === undefined) fitFrame = requestAnimationFrame(fitTables); };
  const view = editor.ownerDocument.defaultView;
  const resize = view.ResizeObserver ? new view.ResizeObserver(scheduleFit) : null;
  resize?.observe(editor);
  const mutation = new view.MutationObserver(scheduleFit);
  mutation.observe(editor, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  listen(view, 'resize', scheduleFit);
  scheduleFit();

  return {
    followNewBlock,
    cancelFollow() { cancelAnimationFrame(followFrame); },
    destroy() {
      cancelAnimationFrame(followFrame);
      cancelAnimationFrame(fitFrame);
      resize?.disconnect();
      mutation.disconnect();
    }
  };
}
