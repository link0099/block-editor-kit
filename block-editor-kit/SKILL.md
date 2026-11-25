---
name: block-editor-kit
description: Build, port, style, or review block-based rich-text editors (块式富文本、内容块、可编辑表格). Use when implementing paragraph and heading blocks, nested lists, inline formatting, drag handles, editable tables, undo/redo, or keyboard, caret, and selection behavior in web or desktop WebView apps. Includes a portable browser implementation and integration example.
license: MIT
metadata:
  version: "0.2.0"
---

# Block Editor Kit

1. Identify the existing editor, supported browser or WebView versions, saved format, and application's theme. For an established editor, preserve its data format and integration and apply the interactions from [the interaction reference](references/interactions.md).
2. For a new editor in a compatible browser app, copy the JavaScript and CSS modules from the skill’s `assets/` directory and follow [the integration guide](references/integration.md). Use [the browser demo](assets/demo.html) to check the default behavior. Keep editor structure separate from document title, modification time, and storage.
3. Preserve the block boundaries and text selection when applying a format, inserting a table, or moving a block. Use one undo/redo strategy. The included editor keeps the latest 100 content operations per document session in memory, with toolbar buttons and shortcuts. For an existing transactional editor, meet the same behavior with its own history rather than stacking another history manager. Check legacy text and nested lists, paste, and Chinese input composition.
4. Run the target app with sample content. Check keyboard behavior, table editing, pointer cancellation, undo/redo after text, block and table edits, the 100-operation boundary, IME and document switches, save and reload, light and dark themes, and narrow widths. Report the platforms and interactions actually verified.
