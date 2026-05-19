/**
 * DESIGN.md front matter parser.
 *
 * Responsible for:
 *   1. Locating the YAML front matter block inside a document string.
 *   2. Parsing the YAML with `js-yaml` (which resolves anchors/aliases automatically).
 *   3. Flattening the resulting object into a `TokenMap` — a `Record<string, string>`
 *      whose keys are dot-separated paths and whose values are string representations
 *      of each leaf, e.g. `{ "colors.primary": "#B8422E", "spacing.base": "8px" }`.
 *
 * The public surface is intentionally split into:
 *   - `extractFrontMatter(text)` — pure string operation, fully unit-testable.
 *   - `parseFrontMatter(yaml)` — pure string → token conversion, fully unit-testable.
 *   - `parseDocument(doc)` — thin VS Code wrapper around the two functions above.
 *
 * Keeping the core logic free of VS Code API calls means the parser tests can run
 * without the VS Code extension host (`@vscode/test-electron`).
 */
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A flat map from dot-separated YAML path to its string value.
 * Arrays are indexed with `[n]` notation: `components[0].name`.
 */
export type TokenMap = Record<string, string>;

/** Structured error returned when the YAML cannot be parsed. */
export interface ParseError {
    /** Human-readable explanation of the failure. */
    message: string;
    /** Zero-based line index within the *document* where the error was found, if known. */
    line?: number;
}

/** Discriminated union returned by `parseFrontMatter` and `parseDocument`. */
export type ParseResult =
    | { ok: true; tokens: TokenMap }
    | { ok: false; error: ParseError };

/** The raw YAML string and metadata extracted from a DESIGN.md document. */
export interface FrontMatterExcerpt {
    /** The raw YAML content between the two `---` fences (not including the fences). */
    yaml: string;
    /**
     * Zero-based line index of the opening `---` fence (always 0 for a valid
     * DESIGN.md file, but stored here for callers that need to offset diagnostics).
     */
    fmStartLine: number;
    /**
     * Zero-based line index of the closing `---` fence.
     * Content lines are `fmStartLine + 1 … fmEndLine - 1`.
     */
    fmEndLine: number;
    /**
     * Zero-based line index of the first line of the Markdown body
     * (the line immediately after the closing fence).
     */
    bodyStartLine: number;
}

// ─── Front matter extraction ─────────────────────────────────────────────────

/**
 * Locates the YAML front matter block in a raw DESIGN.md string.
 *
 * A valid front matter block must:
 *   - Start with `---` on the very first line of the document (no BOM, no blank lines).
 *   - End with a second `---` line anywhere after the opening fence.
 *
 * @param text The full text of the document.
 * @returns The excerpt metadata, or `null` if no valid front matter is found.
 */
export function extractFrontMatter(text: string): FrontMatterExcerpt | null {
    const lines = text.split('\n');

    // The opening fence must be the first line, ignoring only a trailing '\r'.
    if (lines.length === 0 || lines[0].replace(/\r$/, '').trim() !== '---') {
        return null;
    }

    // Find the closing fence.
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].replace(/\r$/, '').trim() === '---') {
            // Content between the two fences (lines 1 … i-1, joined back with '\n').
            const yamlLines = lines.slice(1, i);
            return {
                yaml: yamlLines.join('\n'),
                fmStartLine: 0,
                fmEndLine: i,
                bodyStartLine: i + 1,
            };
        }
    }

    // Opening fence found but no closing fence — not a well-formed front matter.
    return null;
}

// ─── YAML → TokenMap ─────────────────────────────────────────────────────────

/**
 * Recursively walks an arbitrary JS value produced by `js-yaml` and accumulates
 * dot-separated path → string-value entries in `result`.
 *
 * Nested objects produce paths like `typography.body.size`.
 * Array entries produce paths like `components[0].name`.
 * Primitive values are converted to strings via `String()`.
 * `null` / `undefined` leaves become the literal strings `"null"` / `"undefined"`.
 *
 * @param value  The current node being walked.
 * @param prefix The dot-separated path built so far (empty string for the root).
 * @param result Accumulator map that is mutated in place.
 */
function flattenValue(value: unknown, prefix: string, result: TokenMap): void {
    if (value === null || value === undefined) {
        // Represent missing / null tokens as explicit strings so callers can
        // detect them without having to distinguish `undefined` vs missing key.
        result[prefix] = String(value);
        return;
    }

    if (Array.isArray(value)) {
        // Index array entries so paths remain deterministic and readable.
        value.forEach((item, idx) => {
            flattenValue(item, `${prefix}[${idx}]`, result);
        });
        return;
    }

    if (typeof value === 'object') {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            const childPath = prefix ? `${prefix}.${key}` : key;
            flattenValue(child, childPath, result);
        }
        return;
    }

    // Primitive leaf (string, number, boolean).
    result[prefix] = String(value);
}

/**
 * Parses a YAML string (the content between the `---` fences) and returns a
 * flat `TokenMap` or a structured `ParseError`.
 *
 * `js-yaml.load()` resolves YAML anchors and aliases before this function
 * sees the data, so the `TokenMap` always contains fully resolved values.
 *
 * @param yamlText Raw YAML content (no `---` fences).
 * @returns `{ ok: true, tokens }` on success, `{ ok: false, error }` on failure.
 */
export function parseFrontMatter(yamlText: string): ParseResult {
    let parsed: unknown;

    try {
        parsed = yaml.load(yamlText);
    } catch (err) {
        // js-yaml throws `YAMLException` with a `mark` property containing line/col.
        const yamlErr = err as { message: string; mark?: { line?: number } };
        return {
            ok: false,
            error: {
                message: yamlErr.message ?? String(err),
                // `mark.line` is zero-based within the YAML block itself (not the document).
                // The caller (parseDocument) adds `fmStartLine + 1` to convert to document coords.
                line: yamlErr.mark?.line,
            },
        };
    }

    // An empty YAML block is valid — return an empty map.
    if (parsed === null || parsed === undefined) {
        return { ok: true, tokens: {} };
    }

    // A non-object top-level value (e.g. a bare scalar) is not a valid token block.
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            ok: false,
            error: { message: 'Front matter must be a YAML mapping, not a scalar or sequence.' },
        };
    }

    const tokens: TokenMap = {};
    flattenValue(parsed, '', tokens);

    // flattenValue writes an entry for the root prefix '' when the top level is
    // a non-object. That cannot happen here, but guard defensively.
    delete tokens[''];

    return { ok: true, tokens };
}

// ─── VS Code document wrapper ─────────────────────────────────────────────────

/**
 * Extracts, parses, and flattens the YAML front matter from a VS Code document.
 *
 * This is the primary entry point used by diagnostics and hover providers.
 * Callers that need the `FrontMatterExcerpt` metadata (e.g. to map error lines
 * back to document positions) should call `extractFrontMatter` + `parseFrontMatter`
 * directly.
 *
 * @param doc Any open VS Code text document with `language === 'design-md'`.
 * @returns A `ParseResult` — never throws.
 */
export function parseDocument(doc: vscode.TextDocument): ParseResult {
    const excerpt = extractFrontMatter(doc.getText());
    if (!excerpt) {
        return { ok: true, tokens: {} };
    }

    const result = parseFrontMatter(excerpt.yaml);

    if (!result.ok && result.error.line !== undefined) {
        // Convert the YAML-relative line to a document-absolute line so callers
        // don't need to know about the front matter offset.
        result.error.line = excerpt.fmStartLine + 1 + result.error.line;
    }

    return result;
}

/**
 * Returns the `FrontMatterExcerpt` for a VS Code document, or `null` if the
 * document has no front matter. Exported so diagnostics and hover providers
 * can determine region boundaries without re-parsing.
 *
 * @param doc Any VS Code text document.
 */
export function getExcerpt(doc: vscode.TextDocument): FrontMatterExcerpt | null {
    return extractFrontMatter(doc.getText());
}
