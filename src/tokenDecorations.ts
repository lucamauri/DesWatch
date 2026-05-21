import * as vscode from 'vscode';
import { getCachedResult } from './tokenCache';

/**
 * Decoration type for token references in the Markdown body.
 * A dotted underline signals to the user that hovering the word
 * will show a token value card — the same convention VS Code uses
 * for CSS variable references and other resolvable identifiers.
 */
const TOKEN_DECORATION = vscode.window.createTextEditorDecorationType({
  textDecoration: 'underline dotted',
  // Use the editor's hint foreground so the decoration respects
  // the active theme and remains subtle in both light and dark modes.
  color: new vscode.ThemeColor('editorHint.foreground'),
});

/**
 * Recomputes token decorations for the given editor.
 * Called on activation, on document change (debounced), and on
 * active editor change.
 *
 * Only decorates the Markdown body (lines after the closing ---
 * front matter fence) to avoid conflicting with YAML highlighting.
 */
function updateDecorations(editor: vscode.TextEditor): void {
  // Only decorate design-md documents.
  if (editor.document.languageId !== 'design-md') {
    return;
  }

  const result = getCachedResult(editor.document);

  // ParseResult uses { ok: true, tokens } / { ok: false, error }
  // not a 'kind' discriminant — check ok instead.
  if (!result || !result.ok) {
    // No valid token map — clear any existing decorations.
    editor.setDecorations(TOKEN_DECORATION, []);
    return;
  }

  const tokenMap = result.tokens;

  // Build a set of all leaf names (last segment of each dot path)
  // so we can match them in the Markdown body efficiently.
  const leafNames = new Set(
    Object.keys(tokenMap).map(path => path.split('.').pop()!)
  );

  const ranges: vscode.Range[] = [];
  const lines = editor.document.getText().split('\n');

  // Find the line index of the closing front matter fence (---).
  // Decorations start from the line after this fence.
  let bodyStartLine = 0;
  let fenceCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      fenceCount++;
      if (fenceCount === 2) {
        bodyStartLine = i + 1;
        break;
      }
    }
  }

  // Scan each line of the Markdown body for token leaf names.
  // \b ensures we only match whole words, not substrings.
  for (let lineIdx = bodyStartLine; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (const leaf of leafNames) {
      const pattern = new RegExp(`\\b${escapeRegExp(leaf)}\\b`, 'g');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const start = new vscode.Position(lineIdx, match.index);
        const end = new vscode.Position(lineIdx, match.index + leaf.length);
        ranges.push(new vscode.Range(start, end));
      }
    }
  }

  editor.setDecorations(TOKEN_DECORATION, ranges);
}

/**
 * Escapes special regex characters in a string so it can be used
 * safely inside a RegExp constructor.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Registers the token decoration provider.
 * Decorations are updated on:
 * - activation (for the currently active editor)
 * - active editor change
 * - document change (debounced 500 ms, same as diagnostics)
 */
export function registerTokenDecorations(
  context: vscode.ExtensionContext
): void {
  // Decorate the active editor immediately on activation.
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }

  // Re-decorate when the user switches to a different editor tab.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateDecorations(editor);
      }
    })
  );

  // Re-decorate on document change, debounced 500 ms.
  // ReturnType<typeof setTimeout> avoids depending on @types/node
  // while remaining compatible with both browser and Node runtimes.
  const debounceTimers = new Map<string, any>();

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document !== event.document) {
        return;
      }
      const key = event.document.uri.toString();
      const existing = debounceTimers.get(key);
      if (existing !== undefined) {
        clearTimeout(existing);
      }
      debounceTimers.set(
        key,
        setTimeout(() => {
            updateDecorations(editor);
            debounceTimers.delete(key);
        }, 500)
      );
    })
  );

  // Dispose the decoration type when the extension deactivates
  // so VS Code cleans up the CSS it injected for it.
  context.subscriptions.push(TOKEN_DECORATION);
}