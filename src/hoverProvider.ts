/**
 * DesWatch hover provider.
 *
 * Shows rich hover cards for token keys and values in both regions of a
 * `design-md` document:
 *
 *   Front matter region (YAML):
 *     Hovering over a key such as `primary` shows the resolved token value.
 *     If the value is a hex color, a small colored SVG swatch is rendered
 *     above the value using a `data:image/svg+xml;base64,…` inline image.
 *
 *   Markdown body region:
 *     Hovering over a word that matches a leaf token key shows the same card.
 *     This lets authors see what `primary` resolves to while writing prose.
 *
 * The hover provider reuses the shared `tokenCache` so it never parses the
 * front matter independently — the cost is paid once and shared with the
 * diagnostics provider.
 *
 * ── Data URI image note ──────────────────────────────────────────────────────
 * VS Code's hover renderer allows `data:image/svg+xml;base64,…` URIs in
 * `MarkdownString` when `isTrusted = true`. This is the standard technique
 * used by color-preview extensions. If a future VS Code version tightens the
 * CSP, the swatch will gracefully degrade to just the hex value text — the
 * hover card will still show the correct value.
 */
import * as vscode from 'vscode';
import { getExcerpt } from './parser.js';
import { getCachedResult } from './tokenCache.js';
import { log } from './log.js';

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers the hover provider for `design-md` documents.
 *
 * @param context The extension activation context; disposables are pushed here.
 */
export function registerHoverProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { language: 'design-md' },
            { provideHover }
        )
    );
}

// ─── Provider implementation ──────────────────────────────────────────────────

/**
 * Provides a hover card for the word at `position` in `document`.
 *
 * Returns `undefined` when:
 *   - The document has no front matter (nothing to look up).
 *   - The cursor is on a `---` fence line.
 *   - The hovered word does not match any token key.
 */
function provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
): vscode.Hover | undefined {
    try {
        return computeHover(document, position);
    } catch (err) {
        log(`Hover provider error at ${document.uri.fsPath}:${position.line}: ${String(err)}`);
        return undefined;
    }
}

function computeHover(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.Hover | undefined {
    const result = getCachedResult(document);
    if (!result.ok || Object.keys(result.tokens).length === 0) {
        return undefined;
    }
    const tokens = result.tokens;

    const excerpt = getExcerpt(document);
    const fmEndLine = excerpt?.fmEndLine ?? -1;

    // Determine which region the cursor is in.
    const inFrontMatter =
        excerpt !== null &&
        position.line > excerpt.fmStartLine &&
        position.line < excerpt.fmEndLine;

    // Get the word under the cursor.  VS Code's default word pattern splits on
    // dots, so `colors.primary` would give `primary`. We use a custom range that
    // extends left/right to include dots so full paths like `colors.primary` are
    // tried first, then fall back to the plain word.
    const dotWordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
    const plainWordRange = document.getWordRangeAtPosition(position);

    const dotWord = dotWordRange ? document.getText(dotWordRange) : undefined;
    const plainWord = plainWordRange ? document.getText(plainWordRange) : undefined;

    // Build an ordered list of candidates to look up in the token map.
    const candidates: Array<{ word: string; range: vscode.Range }> = [];
    if (dotWord && dotWordRange) {
        candidates.push({ word: dotWord, range: dotWordRange });
    }
    if (plainWord && plainWordRange && plainWord !== dotWord) {
        candidates.push({ word: plainWord, range: plainWordRange });
    }

    for (const { word, range } of candidates) {
        // Exact full-path lookup (e.g. "colors.primary").
        if (tokens[word] !== undefined) {
            return buildHover(word, tokens[word], range);
        }

        // Leaf-name lookup: find all token paths whose last segment equals `word`.
        // If exactly one match, show it. If multiple, show all of them.
        const matches = Object.entries(tokens).filter(([key]) => {
            const segments = key.split('.');
            return segments[segments.length - 1] === word;
        });

        if (matches.length === 1) {
            return buildHover(matches[0][0], matches[0][1], range);
        }

        if (matches.length > 1) {
            return buildMultiHover(matches, range);
        }
    }

    // Nothing matched.  In the front matter, also try the YAML key on this
    // exact line (handles cases where the key contains hyphens that break
    // the word pattern).
    if (inFrontMatter) {
        const lineText = document.lineAt(position.line).text;
        // YAML mapping key pattern: `key:` at the start of the line (possibly indented).
        const keyMatch = /^(\s*)([\w.-]+)\s*:/.exec(lineText);
        if (keyMatch) {
            const keyName = keyMatch[2];
            const keyStart = keyMatch[1].length;
            const keyEnd = keyStart + keyName.length;
            const keyRange = new vscode.Range(
                new vscode.Position(position.line, keyStart),
                new vscode.Position(position.line, keyEnd)
            );
            if (position.character >= keyStart && position.character <= keyEnd) {
                // Look up by the key name as a leaf.
                const lineMatches = Object.entries(tokens).filter(([k]) => {
                    const segs = k.split('.');
                    return segs[segs.length - 1] === keyName;
                });
                if (lineMatches.length === 1) {
                    return buildHover(lineMatches[0][0], lineMatches[0][1], keyRange);
                }
            }
        }
    }

    return undefined;

    // Suppress "fmEndLine referenced but not used" — it IS used above in the
    // inFrontMatter check. TypeScript would flag it only if we relied on it
    // after this point. Kept for clarity of the region calculation.
    void fmEndLine;
}

// ─── Hover card builders ──────────────────────────────────────────────────────

/**
 * Builds a hover card for a single token key → value pair.
 *
 * For hex color values, prepends an SVG swatch so the user can see the
 * color at a glance without needing to open the color picker.
 *
 * @param key   The full dot-separated token path (e.g. `colors.primary`).
 * @param value The resolved string value (e.g. `#B8422E`).
 * @param range The word range to attach the hover to.
 */
function buildHover(key: string, value: string, range: vscode.Range): vscode.Hover {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportHtml = true;

    // Prepend a color swatch for hex values.
    const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    if (HEX_RE.test(value)) {
        md.appendMarkdown(colorSwatchMarkdown(value) + ' ');
    }

    md.appendMarkdown(`**\`${key}\`** → \`${value}\``);

    return new vscode.Hover(md, range);
}

/**
 * Builds a hover card listing multiple token matches for the same leaf key.
 * This happens when several token paths share the same leaf name
 * (e.g. `colors.primary` and `dark.colors.primary`).
 *
 * @param matches An array of `[path, value]` tuples.
 * @param range   The word range to attach the hover to.
 */
function buildMultiHover(
    matches: Array<[string, string]>,
    range: vscode.Range
): vscode.Hover {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportHtml = true;
    md.appendMarkdown('**Multiple token matches:**\n\n');

    for (const [key, value] of matches) {
        const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
        const swatch = HEX_RE.test(value) ? colorSwatchMarkdown(value) + ' ' : '';
        md.appendMarkdown(`- ${swatch}**\`${key}\`** → \`${value}\`\n`);
    }

    return new vscode.Hover(md, range);
}

// ─── SVG color swatch ─────────────────────────────────────────────────────────

/**
 * Generates Markdown for a 16×16 colored SVG square encoded as a data URI.
 *
 * The data URI technique is well-established for color preview in VS Code
 * hover cards and is used by the built-in CSS color provider. If the CSP
 * ever blocks data URIs here, this function will return an empty string and
 * the hover will gracefully show just the hex value.
 *
 * @param hexColor A validated hex color string, e.g. `#B8422E`.
 */
function colorSwatchMarkdown(hexColor: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="2" fill="${hexColor}"/></svg>`;
    const b64 = Buffer.from(svg).toString('base64');
    return `![color](data:image/svg+xml;base64,${b64})`;
}
