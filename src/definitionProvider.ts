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
 * Returns all locations where the hovered token is defined in the YAML front
 * matter, or `undefined` if no definition can be found.
 *
 * Returning a `Location[]` lets VS Code surface a "peek references" picker when
 * multiple token paths share the same leaf name (e.g. `colors.primary` and
 * `dark.colors.primary` both define `primary`).
 *
 * Only activates when the cursor is in the Markdown body.
 */
function provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
): vscode.Location[] | undefined {
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
): vscode.Location[] | undefined {
    const excerpt = getExcerpt(document);
    if (!excerpt) {
        return undefined;
    }

    // Only resolve definitions from within the Markdown body.
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
    // Collect all matching locations and deduplicate by document line number so
    // that a leaf name that appears on the same YAML line via multiple paths is
    // only shown once in the peek picker.
    const seenLines = new Set<number>();
    const locations: vscode.Location[] = [];

    const addLocations = (paths: string[]) => {
        for (const path of paths) {
            const locs = findDefinitionLocations(document, excerpt, path);
            for (const loc of locs) {
                const line = loc.range.start.line;
                if (!seenLines.has(line)) {
                    seenLines.add(line);
                    locations.push(loc);
                }
            }
        }
    };

    for (const word of candidates) {
        // Pass 1: exact full-path match.
        if (tokens[word] !== undefined) {
            addLocations([word]);
            if (locations.length > 0) {
                return locations;
            }
        }

        // Pass 2: leaf-name match — collect all paths whose last segment equals `word`.
        const leafMatches = Object.keys(tokens).filter(path => {
            const segs = path.split('.');
            return segs[segs.length - 1] === word;
        });
        if (leafMatches.length > 0) {
            addLocations(leafMatches);
            if (locations.length > 0) {
                return locations;
            }
        }
    }

    return locations.length > 0 ? locations : undefined;
}

// ─── Definition location resolver ────────────────────────────────────────────

/**
 * Scans the YAML front matter line by line and returns all `Location` objects
 * where the leaf key of `tokenPath` appears as a YAML mapping key.
 *
 * Returning all matches (not just the first) allows the caller to surface a
 * peek picker when multiple token paths share the same leaf name.
 *
 * @param document  The active document.
 * @param excerpt   Front matter metadata from `getExcerpt()`.
 * @param tokenPath The full dot-separated token path to locate.
 * @returns An array of `Location` objects (may be empty).
 */
function findDefinitionLocations(
    document: vscode.TextDocument,
    excerpt: NonNullable<ReturnType<typeof getExcerpt>>,
    tokenPath: string
): vscode.Location[] {
    const leafKey = tokenPath.split('.').pop();
    if (!leafKey) {
        return [];
    }

    const keyPattern = new RegExp(`^(\\s*)${escapeRegExp(leafKey)}\\s*:`);
    const locations: vscode.Location[] = [];
    const yamlLines = excerpt.yaml.split('\n');

    for (let yamlLineIdx = 0; yamlLineIdx < yamlLines.length; yamlLineIdx++) {
        const match = keyPattern.exec(yamlLines[yamlLineIdx]);
        if (!match) {
            continue;
        }
        const docLine = excerpt.fmStartLine + 1 + yamlLineIdx;
        const keyStart = match[1].length;
        const keyEnd = keyStart + leafKey.length;
        locations.push(
            new vscode.Location(
                document.uri,
                new vscode.Range(
                    new vscode.Position(docLine, keyStart),
                    new vscode.Position(docLine, keyEnd)
                )
            )
        );
    }

    return locations;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Escapes special regex characters in a string so it can be used as a literal
 * pattern in `new RegExp(...)`.
 */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
