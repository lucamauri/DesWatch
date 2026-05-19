/**
 * DesWatch go-to-definition provider.
 *
 * Resolves F12 / Ctrl+Click on a token reference in the Markdown body to the
 * exact line in the YAML front matter where that token is defined.
 *
 * Lookup strategy (same two-pass logic as `hoverProvider.ts`):
 *   1. Exact full-path lookup: the hovered word is tried as a dot-separated
 *      token path (e.g. `colors.primary`).
 *   2. Leaf-name lookup: the hovered word is compared against the last segment
 *      of every token path.  If exactly one path matches, that path is used.
 *      If multiple paths match, the first match is returned (tie-breaking by
 *      definition order in the YAML).
 *
 * If no match is found in the `TokenMap`, or if the cursor is inside the front
 * matter (definitions live there, not in the body), `undefined` is returned
 * and VS Code falls back to its default behaviour.
 *
 * ── Line-offset calculation ──────────────────────────────────────────────────
 * The `FrontMatterExcerpt` produced by `getExcerpt()` contains `fmStartLine`
 * (the document line of the opening `---` fence, always 0 for valid files).
 * The YAML content begins on `fmStartLine + 1`.  When we scan the YAML lines
 * to find a key, we get a zero-based index within the YAML block itself.  To
 * convert to a document-absolute line we add `fmStartLine + 1 + yamlLineIndex`.
 */
import * as vscode from 'vscode';
import { getExcerpt } from './parser.js';
import { getCachedResult } from './tokenCache.js';
import { log } from './log.js';

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers the definition provider for `design-md` documents.
 *
 * @param context The extension activation context; disposables are pushed here.
 */
export function registerDefinitionProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { language: 'design-md' },
            { provideDefinition }
        )
    );
}

// ─── Provider implementation ──────────────────────────────────────────────────

/**
 * Returns the location of the token definition in the YAML front matter, or
 * `undefined` if no definition can be found.
 *
 * Only activates when the cursor is in the Markdown body — navigating from
 * the front matter to itself is not useful and is left to VS Code's built-in
 * YAML provider.
 */
function provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
): vscode.Location | undefined {
    try {
        return computeDefinition(document, position);
    } catch (err) {
        log(`Definition provider error at ${document.uri.fsPath}:${position.line}: ${String(err)}`);
        return undefined;
    }
}

function computeDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.Location | undefined {
    const excerpt = getExcerpt(document);
    if (!excerpt) {
        return undefined;
    }

    // Only resolve definitions from within the Markdown body. The front matter
    // itself is where definitions live, so "go to definition" from there would
    // just navigate to the same spot — unhelpful and potentially confusing.
    const inBody = position.line > excerpt.fmEndLine;
    if (!inBody) {
        return undefined;
    }

    const result = getCachedResult(document);
    if (!result.ok || Object.keys(result.tokens).length === 0) {
        return undefined;
    }
    const tokens = result.tokens;

    // ── Word extraction ──────────────────────────────────────────────────────
    // Try a dot-extended word range first so `colors.primary` is tried as a
    // full path before falling back to just `primary`.
    const dotWordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
    const plainWordRange = document.getWordRangeAtPosition(position);

    const candidates: string[] = [];
    if (dotWordRange) {
        candidates.push(document.getText(dotWordRange));
    }
    if (plainWordRange) {
        const plain = document.getText(plainWordRange);
        if (!candidates.includes(plain)) {
            candidates.push(plain);
        }
    }

    // ── Token lookup ─────────────────────────────────────────────────────────
    for (const word of candidates) {
        // Pass 1: exact full-path match.
        if (tokens[word] !== undefined) {
            const loc = findDefinitionLocation(document, excerpt, word);
            if (loc) { return loc; }
        }

        // Pass 2: leaf-name match — find all token paths whose last segment
        // equals `word` and return the first match.
        const matches = Object.keys(tokens).filter(path => {
            const segments = path.split('.');
            return segments[segments.length - 1] === word;
        });
        if (matches.length > 0) {
            const loc = findDefinitionLocation(document, excerpt, matches[0]);
            if (loc) { return loc; }
        }
    }

    return undefined;
}

// ─── Definition location resolver ────────────────────────────────────────────

/**
 * Scans the YAML front matter text line by line to find where `tokenPath` is
 * defined, then returns a `Location` pointing to that line in the document.
 *
 * The scan uses the leaf key (last segment of `tokenPath`) and matches any
 * line of the form `<optional-indent><leafKey><optional-spaces>:`.  This
 * covers both top-level keys (`colors:`) and nested keys (`  primary:`).
 *
 * ── Line-offset calculation ──────────────────────────────────────────────────
 * `excerpt.fmStartLine` is the document line of the opening `---` fence (0).
 * The first YAML content line is therefore `fmStartLine + 1`.
 * A match at `yamlLineIdx` (zero-based within `excerpt.yaml.split('\n')`)
 * maps to document line `fmStartLine + 1 + yamlLineIdx`.
 *
 * @param document  The active document.
 * @param excerpt   Front matter metadata from `getExcerpt()`.
 * @param tokenPath The full dot-separated token path to locate.
 * @returns A `vscode.Location` for the definition line, or `undefined`.
 */
function findDefinitionLocation(
    document: vscode.TextDocument,
    excerpt: NonNullable<ReturnType<typeof getExcerpt>>,
    tokenPath: string
): vscode.Location | undefined {
    // The leaf key is the last segment: `colors.primary` → `primary`.
    const leafKey = tokenPath.split('.').pop();
    if (!leafKey) {
        return undefined;
    }

    // Build a pattern that matches `leafKey` as a YAML mapping key.
    // We use `\b` to avoid matching `primaryDark` when looking for `primary`.
    const keyPattern = new RegExp(`^(\\s*)${escapeRegExp(leafKey)}\\s*:`);

    const yamlLines = excerpt.yaml.split('\n');
    for (let yamlLineIdx = 0; yamlLineIdx < yamlLines.length; yamlLineIdx++) {
        const match = keyPattern.exec(yamlLines[yamlLineIdx]);
        if (!match) {
            continue;
        }

        // Convert YAML-relative index to document-absolute line number.
        // fmStartLine + 1 skips the opening `---` fence line.
        const docLine = excerpt.fmStartLine + 1 + yamlLineIdx;

        // Build a range spanning only the key name within that line, not the
        // whole line. This gives users a precise navigation target.
        const keyStart = match[1].length;                  // length of leading whitespace
        const keyEnd = keyStart + leafKey.length;
        const range = new vscode.Range(
            new vscode.Position(docLine, keyStart),
            new vscode.Position(docLine, keyEnd)
        );

        return new vscode.Location(document.uri, range);
    }

    return undefined;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Escapes special regex characters in a string so it can be used as a literal
 * pattern in `new RegExp(...)`.
 */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
