import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditHistory } from '../block-editor-kit/assets/history.js';

test('undo and redo 100 changes, evict oldest, invalidate redo only on a real edit', () => {
  const history = createEditHistory('<p>0</p>');
  for (let i = 1; i <= 105; i++) assert(history.record('<p>' + i + '</p>', i - 1, i));
  for (let i = 104; i >= 5; i--) assert.deepEqual(history.step(false), {html: '<p>' + i + '</p>', selection: i});
  assert.equal(history.step(false), null);
  for (let i = 6; i <= 105; i++) assert.deepEqual(history.step(true), {html: '<p>' + i + '</p>', selection: i});
  assert.equal(history.step(true), null);
  history.step(false);
  assert.equal(history.record('<p>104</p>', null, null), false);
  assert(history.canRedo);
  history.record('<p>中文🙂</p>', null, null);
  assert.equal(history.step(true), null);
  assert.equal(history.step(false).html, '<p>104</p>');
  assert.equal(history.step(true).html, '<p>中文🙂</p>');
});

test('reverses insert, replacement, deletion and empty document', () => {
  const a = '<p>正文</p><table><tr><td>旧</td></tr></table>';
  const b = '<p>正文</p><table><tr><td>新</td><td>新增</td></tr></table>';
  const history = createEditHistory('');
  for (const html of [a,b,'']) assert(history.record(html));
  for (const html of [b,a,'']) assert.equal(history.step(false).html, html);
  for (const html of [a,b,'']) assert.equal(history.step(true).html, html);
});
