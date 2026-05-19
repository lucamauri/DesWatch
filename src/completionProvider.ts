/**
 * DesWatch completion provider.
 *
 * Offers IntelliSense in three distinct regions of a `design-md` document:
 *
 *   Region A — YAML front matter, top-level key completions:
 *     Triggered at indent level 0 inside the front matter. Suggests the six
 *     canonical top-level keys from `SPEC.frontMatterKeys`. Skipped if the
 *     current line already contains one of those keys (the user is editing,
 *     not inserting).
 *
 *   Region B — YAML front matter, hex value completions:
 *     Triggered when the cursor is in a value position (the line contains `:`)
 *     and the partial text after the colon starts with `#`. Offers six
 *     illustrative palette colours as quick-pick `Color` items so new users
 *     have a concrete starting point.
 *
 *   Region C — Markdown body, canonical section heading completions:
 *     Triggered when the cursor is on a line that already starts with `## `.
 *     Offers entries from `SPEC.canonicalSectionOrder` that are not yet
 *     present in the document.
 *
 * The `#` character is registered as a trigger so VS Code activates the
 * provider immediately when the user types `#` in a value position. Regions A
 * and C are triggered by the default word-character handler (Ctrl+Space or any
 * word character).
 */
import * as vscode from 'vscode';
import { SPEC, getExpectedType } from './spec.js';
import { getExcerpt, FrontMatterExcerpt } from './parser.js';
import { log } from './log.js';

// ─── Palette colours offered in Region B ────────────────────────────────────

/**
 * Six illustrative colours drawn from the Google Material Design colour system.
 * These are examples, not enforced values. They give new users a starting point
 * and demonstrate the expected format of a hex colour token.
 */
const PALETTE_COLOURS: ReadonlyArray<{ label: string; hex: string }> = [
    { label: 'Primary Blue',    hex: '#4285F4' },
    { label: 'Error Red',       hex: '#EA4335' },
    { label: 'Success Green',   hex: '#34A853' },
    { label: 'Warning Yellow',  hex: '#FBBC04' },
    { label: 'Dark Surface',    hex: '#202124' },
    { label: 'Light Background', hex: '#FFFFFF' },
];

// ─── Documentation strings for Region A key completions ─────────────────────

/**
 * Short descriptions for each canonical front matter key.
 * Used as `documentation` on the CompletionItem so users understand the
 * purpose of each key without leaving the editor.
 */
const KEY_DOCS: Readonly<Record<string, string>> = {
    colors:
        'Color tokens used throughout the design system — primary, secondary, ' +
        'surface, text, error, and their variants. Values are hex strings.',
    typography:
        'Font-family, size, weight, and line-height tokens for each named text ' +
        'style (body, heading, caption, etc.).',
    spacing:
        'Spacing scale values used for margins, padding, and gaps. ' +
        'Typically a base unit (e.g. `8`) plus named multiples.',
    elevation:
        'Shadow and depth tokens for layered UI surfaces such as cards, ' +
        'dialogs, and navigation bars.',
    shapes:
        'Border-radius and shape tokens that define the visual language of ' +
        'UI components — small (chips), medium (cards), large (dialogs).',
    components:
        'Component-level design token overrides and composition rules. ' +
        'Each component entry maps directly to a design-system component name.',
};

// ─── Sub-key completions for nested positions ────────────────────────────────

type SubKeyEntry = { key: string; detail: string; snippet: string };

/**
 * Known sub-keys for each top-level front matter key.
 * Offered when the cursor is indented inside a top-level block.
 */
const SUB_KEYS: Readonly<Record<string, SubKeyEntry[]>> = {
    typography: [
        { key: 'family',     detail: 'Font family name',         snippet: 'family: "$1"'     },
        { key: 'size',       detail: 'Font size (e.g. 16px)',     snippet: 'size: "$1"'       },
        { key: 'weight',     detail: 'Font weight (e.g. 400)',    snippet: 'weight: "$1"'     },
        { key: 'lineHeight', detail: 'Line height (e.g. 1.5)',    snippet: 'lineHeight: "$1"' },
    ],
    components: [
        { key: 'background', detail: 'Background color token', snippet: 'background: "{colors.$1}"' },
        { key: 'text',       detail: 'Text color token',       snippet: 'text: "{colors.$1}"'       },
        { key: 'border',     detail: 'Border token',           snippet: 'border: "$1"'              },
        { key: 'radius',     detail: 'Border radius token',    snippet: 'radius: "{shapes.$1}"'     },
        { key: 'padding',    detail: 'Padding token',          snippet: 'padding: "{spacing.$1}"'   },
    ],
    elevation: [
        { key: 'shadow', detail: 'Box shadow value',  snippet: 'shadow: "$1"' },
        { key: 'blur',   detail: 'Blur radius',       snippet: 'blur: "$1"'   },
        { key: 'spread', detail: 'Spread radius',     snippet: 'spread: "$1"' },
        { key: 'color',  detail: 'Shadow color',      snippet: 'color: "$1"'  },
    ],
    shapes: [
        { key: 'small',  detail: 'Small border radius (chips)',   snippet: 'small: "${1:4px}"'    },
        { key: 'medium', detail: 'Medium border radius (cards)',  snippet: 'medium: "${1:8px}"'   },
        { key: 'large',  detail: 'Large border radius (dialogs)', snippet: 'large: "${1:16px}"'   },
        { key: 'full',   detail: 'Full/pill border radius',       snippet: 'full: "9999px"'       },
    ],
};

/** Inline entry templates for `colors` and `spacing` (no fixed sub-key names). */
const INLINE_ENTRY_TEMPLATES: Readonly<Record<string, { label: string; snippet: string }>> = {
    colors:  { label: 'new color token',   snippet: '${1:token-name}: "${2:#4285F4}"' },
    spacing: { label: 'new spacing token', snippet: '${1:token-name}: "${2:8px}"'     },
};

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers the completion item provider for `design-md` documents.
 *
 * The `#` trigger ensures Region B activates as soon as the user types `#` in
 * a value position. Regions A and C rely on VS Code's default word-character
 * trigger or an explicit Ctrl+Space invocation.
 *
 * @param context The extension activation context; disposables are pushed here.
 */
export function registerCompletionProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'design-md' },
            { provideCompletionItems },
            '#'           // trigger for Region B (hex values)
        )
    );
}

// ─── Provider implementation ──────────────────────────────────────────────────

/**
 * Dispatches to the appropriate region handler based on cursor position.
 *
 * Returns an empty array (not `undefined`) when no completions are available
 * so VS Code does not fall back to its generic word-based completions.
 */
function provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
): vscode.CompletionItem[] {
    try {
        return computeCompletions(document, position);
    } catch (err) {
        log(`Completion provider error at ${document.uri.fsPath}:${position.line}: ${String(err)}`);
        return [];
    }
}

function computeCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.CompletionItem[] {
    const excerpt = getExcerpt(document);
    const lineText = document.lineAt(position.line).text;

    // ── Region detection ────────────────────────────────────────────────────
    const inFrontMatter =
        excerpt !== null &&
        position.line > excerpt.fmStartLine &&
        position.line < excerpt.fmEndLine;

    const inBody =
        excerpt === null
            ? true                             // no front matter → whole doc is body
            : position.line > excerpt.fmEndLine;

    // ── Region C: canonical section heading completions (body only) ─────────
    // Must check before Region A/B because `## ` at the start of a body line
    // is unambiguous and takes priority.
    if (inBody && lineText.startsWith('## ')) {
        return regionC_sectionHeadings(document, excerpt, position);
    }

    if (!inFrontMatter) {
        return [];
    }

    // ── Region B: hex value completions (front matter, value position) ──────
    // The line must contain `:` and the partial value must start with `#`.
    // Suppressed when the token's expected type (from TOKEN_SCHEMA) is not hex.
    if (isHexValuePosition(lineText, position)) {
        const tokenPath = getContextualTokenPath(document, position, excerpt);
        if (tokenPath !== null && getExpectedType(tokenPath) !== 'hex') {
            return [];
        }
        return regionB_hexValues();
    }

    // ── Region A: key completions (front matter) ────────────────────────────
    const leadingSpaces = lineText.match(/^(\s*)/)?.[1] ?? '';
    if (leadingSpaces.length === 0) {
        // Indent 0 → offer top-level canonical keys.
        return regionA_frontMatterKeys(lineText);
    }

    // Indented → offer sub-key completions based on the top-level ancestor.
    return regionA_subKeys(document, position, excerpt);
}

// ─── Region A ─────────────────────────────────────────────────────────────────

/**
 * Returns completion items for the six canonical top-level front matter keys.
 *
 * Skips completion entirely if the current line already contains one of the
 * keys — the user is editing an existing entry, not inserting a new one.
 *
 * @param lineText The full text of the current line.
 */
function regionA_frontMatterKeys(lineText: string): vscode.CompletionItem[] {
    // If the line already contains a known key followed by a colon, the user
    // is on an existing entry — do not crowd them with key suggestions.
    for (const key of SPEC.frontMatterKeys) {
        if (lineText.includes(`${key}:`)) {
            return [];
        }
    }

    return SPEC.frontMatterKeys.map(key => {
        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
        item.detail = 'DESIGN.md token group';
        item.documentation = new vscode.MarkdownString(KEY_DOCS[key] ?? '');
        // Insert the key followed by a colon and newline-indented block so the
        // user can immediately start adding entries.
        item.insertText = new vscode.SnippetString(`${key}:\n  $0`);
        return item;
    });
}

// ─── Region B ─────────────────────────────────────────────────────────────────

/**
 * Returns `true` when the cursor is in a value position whose partial text
 * starts with `#` — indicating the user is about to type or has started
 * typing a hex colour.
 *
 * Algorithm:
 *   1. The line must contain `:` (value position marker).
 *   2. Find the last `:` before the cursor.
 *   3. Trim whitespace and strip any opening `"` or `'` from the text that
 *      follows the colon.
 *   4. If that text starts with `#`, we are in a hex value position.
 *
 * @param lineText  The full text of the current line.
 * @param position  The cursor position.
 */
function isHexValuePosition(lineText: string, position: vscode.Position): boolean {
    const textBeforeCursor = lineText.substring(0, position.character);
    const lastColonIdx = textBeforeCursor.lastIndexOf(':');
    if (lastColonIdx < 0) {
        return false;
    }
    const afterColon = textBeforeCursor.substring(lastColonIdx + 1)
        .trimStart()
        .replace(/^["']/, '');   // strip opening quote if present
    return afterColon.startsWith('#');
}

/**
 * Returns `Color` completion items for six illustrative palette colours.
 *
 * Each item inserts the full hex string (with quotes) so the resulting YAML
 * is valid.  The `detail` field shows the hex value for at-a-glance preview.
 */
function regionB_hexValues(): vscode.CompletionItem[] {
    return PALETTE_COLOURS.map(({ label, hex }) => {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Color);
        item.detail = hex;
        item.insertText = hex;
        item.documentation = new vscode.MarkdownString(
            `Sample colour — replace with your own value.\n\nValue: \`${hex}\``
        );
        // filterText must match what the user has typed after `#` so VS Code
        // keeps the item visible as the user continues typing hex digits.
        item.filterText = hex;
        return item;
    });
}

// ─── Region A — nested sub-key completions ────────────────────────────────────

/**
 * Scans upward from `position` to find the nearest indent-0 key in the front
 * matter, which is the top-level ancestor for the current indented position.
 * Returns the key string (e.g. `"typography"`) or `null` if not found.
 */
function getTopLevelParentKey(
    document: vscode.TextDocument,
    position: vscode.Position,
    fmStartLine: number
): string | null {
    for (let i = position.line - 1; i > fmStartLine; i--) {
        const text = document.lineAt(i).text;
        const m = /^(\w[\w-]*)\s*:/.exec(text);
        if (m) {
            return m[1];
        }
    }
    return null;
}

/**
 * Builds an approximate dot-path for the token under the cursor by combining
 * the top-level ancestor key with the leaf key on the current line.
 * Used to look up the expected type in TOKEN_SCHEMA for Region B suppression.
 * Returns `null` when the path cannot be determined.
 */
function getContextualTokenPath(
    document: vscode.TextDocument,
    position: vscode.Position,
    excerpt: FrontMatterExcerpt | null
): string | null {
    if (!excerpt) {
        return null;
    }
    const lineText = document.lineAt(position.line).text;
    const keyMatch = /^\s*([\w-]+)\s*:/.exec(lineText);
    if (!keyMatch) {
        return null;
    }
    const topKey = getTopLevelParentKey(document, position, excerpt.fmStartLine);
    if (!topKey) {
        return null;
    }
    return `${topKey}.${keyMatch[1]}`;
}

/**
 * Returns completion items for nested positions inside a top-level key block.
 * Uses `SUB_KEYS` for keys with fixed sub-key schemas and `INLINE_ENTRY_TEMPLATES`
 * for keys with dynamic names (`colors`, `spacing`).
 */
function regionA_subKeys(
    document: vscode.TextDocument,
    position: vscode.Position,
    excerpt: FrontMatterExcerpt | null
): vscode.CompletionItem[] {
    if (!excerpt) {
        return [];
    }
    const topKey = getTopLevelParentKey(document, position, excerpt.fmStartLine);
    if (!topKey) {
        return [];
    }

    const lineText = document.lineAt(position.line).text;

    const subKeys = SUB_KEYS[topKey];
    if (subKeys) {
        for (const { key } of subKeys) {
            if (lineText.includes(`${key}:`)) {
                return []; // already on an existing entry
            }
        }
        return subKeys.map(({ key, detail, snippet }) => {
            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
            item.detail = detail;
            item.insertText = new vscode.SnippetString(snippet);
            return item;
        });
    }

    const template = INLINE_ENTRY_TEMPLATES[topKey];
    if (template) {
        const item = new vscode.CompletionItem(template.label, vscode.CompletionItemKind.Property);
        item.detail = `New ${topKey} token`;
        item.insertText = new vscode.SnippetString(template.snippet);
        return [item];
    }

    return [];
}

// ─── Region C ─────────────────────────────────────────────────────────────────

/**
 * Returns completion items for canonical section headings not yet present in
 * the document.
 *
 * The `insertText` replaces the entire `## ` prefix plus any partial text the
 * user has already typed, so the result is always a full `## Heading` line
 * without duplication.
 *
 * @param document The active document.
 * @param excerpt  The front matter excerpt (may be `null` for front-matter-free docs).
 * @param position The cursor position.
 */
function regionC_sectionHeadings(
    document: vscode.TextDocument,
    excerpt: ReturnType<typeof getExcerpt>,
    position: vscode.Position
): vscode.CompletionItem[] {
    const bodyStartLine = excerpt?.bodyStartLine ?? 0;

    // Collect all `## ` headings already in the document body so we do not
    // offer sections that are already present.
    const presentSections = new Set<string>();
    for (let i = bodyStartLine; i < document.lineCount; i++) {
        const m = /^##\s+(.+)$/.exec(document.lineAt(i).text);
        if (m) {
            presentSections.add(m[1].trim());
        }
    }

    // The partial text after `## ` — used to set the replace range so VS Code
    // replaces the entire heading prefix, not just the word under the cursor.
    const partialHeading = document.lineAt(position.line).text.substring(3); // after `## `
    const replaceRange = new vscode.Range(
        new vscode.Position(position.line, 0),
        new vscode.Position(position.line, document.lineAt(position.line).text.length)
    );

    return SPEC.canonicalSectionOrder
        .filter(section => !presentSections.has(section))
        .map(section => {
            const item = new vscode.CompletionItem(section, vscode.CompletionItemKind.Text);
            item.detail = 'Canonical DESIGN.md section';
            item.documentation = new vscode.MarkdownString(
                `Insert the **${section}** section heading as defined in the design.md spec.`
            );
            // Replace the whole line so typing `## Col` and selecting "Colors"
            // gives `## Colors`, not `## Col## Colors`.
            item.textEdit = vscode.TextEdit.replace(replaceRange, `## ${section}`);
            // filterText ensures the item stays in the list as the user types the
            // heading text — it must match against the full `## Heading` text.
            item.filterText = `## ${section} ${partialHeading}`;
            return item;
        });
}
