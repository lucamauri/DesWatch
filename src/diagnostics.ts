/**
 * DesWatch diagnostic provider.
 *
 * Runs two independent validation passes on every `design-md` document:
 *
 *   Pass A — Token validity (always `DiagnosticSeverity.Error`):
 *     - Malformed YAML in the front matter block.
 *     - Values that look like intended hex colors but are ill-formed
 *       (e.g. `#GGG`, `#12345` — wrong character set or wrong length).
 *
 *   Pass B — Section order (severity controlled by `deswatch.sectionValidation`):
 *     - `##` headings that are present but out of the canonical order.
 *     - Canonical sections that are entirely absent (always `Hint` severity,
 *       never elevated — omitting sections is often intentional).
 *
 * Validation is debounced at 500 ms after the last document change to avoid
 * thrashing during active editing.
 */
import * as vscode from 'vscode';
import { SPEC } from './spec.js';
import { extractFrontMatter } from './parser.js';
import { getCachedResult, invalidate } from './tokenCache.js';
import { log } from './log.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Matches any token in a YAML value position that starts with `#` and is
 * followed by word characters. If the capture group does NOT form a valid hex
 * color, the value is flagged as malformed.
 *
 * Valid patterns: #RGB (3), #RRGGBB (6), #RRGGBBAA (8) — all hex digits.
 */
const INTENDED_HEX_RE = /#(\w+)/g;
const VALID_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Matches `## Heading` lines in the Markdown body. Group 1 = heading text. */
const H2_RE = /^##\s+(.+)$/;

/** Debounce delay in milliseconds. */
const DEBOUNCE_MS = 500;

// ─── Module-level state ───────────────────────────────────────────────────────

/** Per-document debounce timers, keyed by document URI string. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers the diagnostic provider.
 *
 * Creates the `DiagnosticCollection`, subscribes to document open/change/close
 * events, and pushes all disposables into `context.subscriptions`.
 *
 * @param context The extension activation context.
 */
export function registerDiagnostics(context: vscode.ExtensionContext): void {
    const collection = vscode.languages.createDiagnosticCollection('deswatch');
    context.subscriptions.push(collection);

    // Validate any design-md document that is already open when the extension activates.
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === 'design-md') {
            updateDiagnostics(doc, collection);
        }
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'design-md') {
                updateDiagnostics(doc, collection);
            }
        }),

        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'design-md') {
                scheduleDiagnosticUpdate(e.document, collection);
            }
        }),

        vscode.workspace.onDidCloseTextDocument(doc => {
            // Clear diagnostics and evict the cache so we don't hold stale data.
            collection.delete(doc.uri);
            invalidate(doc.uri);
            const key = doc.uri.toString();
            const timer = debounceTimers.get(key);
            if (timer) {
                clearTimeout(timer);
                debounceTimers.delete(key);
            }
        })
    );
}

// ─── Debounce ─────────────────────────────────────────────────────────────────

/**
 * Schedules a diagnostic update for `doc` after `DEBOUNCE_MS` milliseconds.
 * Resets the timer if one is already pending for this document.
 */
function scheduleDiagnosticUpdate(
    doc: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
): void {
    const key = doc.uri.toString();
    const existing = debounceTimers.get(key);
    if (existing) {
        clearTimeout(existing);
    }
    debounceTimers.set(
        key,
        setTimeout(() => {
            debounceTimers.delete(key);
            updateDiagnostics(doc, collection);
        }, DEBOUNCE_MS)
    );
}

// ─── Main validation entry ────────────────────────────────────────────────────

/**
 * Runs both validation passes and publishes the result to `collection`.
 * Never throws — all errors are caught and logged to the output channel.
 *
 * @param doc        The document to validate.
 * @param collection The diagnostic collection to update.
 */
function updateDiagnostics(
    doc: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
): void {
    try {
        const diagnostics: vscode.Diagnostic[] = [
            ...runPassA(doc),
            ...runPassB(doc),
        ];
        collection.set(doc.uri, diagnostics);
    } catch (err) {
        log(`Unexpected error during diagnostics for ${doc.uri.fsPath}: ${String(err)}`);
        // Clear stale diagnostics rather than leaving incorrect ones behind.
        collection.delete(doc.uri);
    }
}

// ─── Pass A: token validity ───────────────────────────────────────────────────

/**
 * Pass A: validates the YAML front matter.
 *
 * Uses the shared token cache for the parse result (so the hover provider and
 * diagnostics provider don't each pay the cost of parsing on every change).
 *
 * Malformed hex detection works by scanning every front matter line with a
 * regex that matches any `#<word>` token, then checking whether the full match
 * is a valid hex color. This is more reliable than trying to infer the user's
 * intent from the parsed YAML value alone.
 *
 * @param doc The document being validated.
 * @returns An array of `Error`-severity diagnostics.
 */
function runPassA(doc: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const result = getCachedResult(doc);

    if (!result.ok) {
        // The whole front matter block is malformed YAML.
        const errorLine = result.error.line ?? 0;
        const range = doc.lineAt(Math.min(errorLine, doc.lineCount - 1)).range;
        diagnostics.push(
            new vscode.Diagnostic(
                range,
                `YAML parse error: ${result.error.message}`,
                vscode.DiagnosticSeverity.Error
            )
        );
        return diagnostics; // No point checking individual hex values if YAML is broken.
    }

    // Scan front matter lines for malformed hex values.
    const excerpt = extractFrontMatter(doc.getText());
    if (!excerpt) {
        return diagnostics;
    }

    for (let lineIdx = excerpt.fmStartLine + 1; lineIdx < excerpt.fmEndLine; lineIdx++) {
        const lineText = doc.lineAt(lineIdx).text;
        INTENDED_HEX_RE.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = INTENDED_HEX_RE.exec(lineText)) !== null) {
            const fullMatch = match[0]; // e.g. "#GGG" or "#B8422E"

            // If the matched token is a valid hex color, skip it.
            if (VALID_HEX_RE.test(fullMatch)) {
                continue;
            }

            // The value starts with `#` and has word characters but is not a
            // valid hex color — flag it as an error.
            const start = new vscode.Position(lineIdx, match.index);
            const end = new vscode.Position(lineIdx, match.index + fullMatch.length);
            diagnostics.push(
                new vscode.Diagnostic(
                    new vscode.Range(start, end),
                    `Malformed color value "${fullMatch}". Expected #RGB, #RRGGBB, or #RRGGBBAA with hex digits only.`,
                    vscode.DiagnosticSeverity.Error
                )
            );
        }
    }

    return diagnostics;
}

// ─── Pass B: section order ────────────────────────────────────────────────────

/**
 * Pass B: validates the Markdown body section order.
 *
 * Reads `deswatch.sectionValidation` from workspace configuration:
 *   - `"off"` → returns immediately with no diagnostics.
 *   - `"warning"` / `"error"` → severity used for out-of-order headings.
 *
 * Absent canonical sections are reported as `Hint` severity, but only when
 * the document has at least `deswatch.draftThreshold` `##` headings. Files
 * with fewer headings are treated as drafts and hints are suppressed.
 *
 * @param doc The document being validated.
 * @returns An array of diagnostics (may be empty).
 */
function runPassB(doc: vscode.TextDocument): vscode.Diagnostic[] {
    const config = vscode.workspace.getConfiguration('deswatch');
    const settingValue = config.get<string>('sectionValidation', 'warning');

    if (settingValue === 'off') {
        return [];
    }

    const orderSeverity =
        settingValue === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;

    const diagnostics: vscode.Diagnostic[] = [];
    const text = doc.getText();
    const excerpt = extractFrontMatter(text);

    // bodyStartLine is 0 if there is no front matter, or the line after the
    // closing `---` fence if there is one.
    const bodyStartLine = excerpt ? excerpt.bodyStartLine : 0;

    // Collect all `## Heading` lines from the Markdown body.
    const foundHeadings: Array<{ name: string; line: number }> = [];
    for (let i = bodyStartLine; i < doc.lineCount; i++) {
        const m = H2_RE.exec(doc.lineAt(i).text);
        if (m) {
            foundHeadings.push({ name: m[1].trim(), line: i });
        }
    }

    // ── Out-of-order check ──────────────────────────────────────────────────
    // Walk the headings that ARE in the canonical list and verify they appear
    // in non-decreasing canonical index order.
    let expectedCanonicalIdx = 0;
    for (const heading of foundHeadings) {
        const canonIdx = SPEC.canonicalSectionOrder.indexOf(
            heading.name as (typeof SPEC.canonicalSectionOrder)[number]
        );
        if (canonIdx === -1) {
            // Not a canonical section name — skip (unknown sections are allowed).
            continue;
        }
        if (canonIdx < expectedCanonicalIdx) {
            // This canonical section appeared after a later canonical section.
            const range = doc.lineAt(heading.line).range;
            diagnostics.push(
                new vscode.Diagnostic(
                    range,
                    `Section "${heading.name}" is out of order. ` +
                        `Expected after "${SPEC.canonicalSectionOrder[canonIdx - 1] ?? '(start)'}".`,
                    orderSeverity
                )
            );
        } else {
            expectedCanonicalIdx = canonIdx + 1;
        }
    }

    // ── Absent canonical sections (Hint) ────────────────────────────────────
    // Only emit missing-section Hints when the file has enough headings to be
    // considered "in progress" rather than a draft. A brand-new file with one
    // `## Overview` heading would otherwise be flooded with 7 Hints immediately.
    // `draftThreshold` defaults to 3 — a reasonable minimum before we assume
    // the author intends to include all canonical sections.
    const draftThreshold = config.get<number>('draftThreshold', 3);
    if (foundHeadings.length >= draftThreshold) {
        const presentNames = new Set(foundHeadings.map(h => h.name));
        for (const section of SPEC.canonicalSectionOrder) {
            if (!presentNames.has(section)) {
                // Report absence as a hint on the last line of the document. Using
                // the last line avoids cluttering the front matter area with hints.
                const lastLine = doc.lineAt(doc.lineCount - 1);
                diagnostics.push(
                    new vscode.Diagnostic(
                        lastLine.range,
                        `Canonical section "${section}" is not present in this DESIGN.md file.`,
                        vscode.DiagnosticSeverity.Hint
                    )
                );
            }
        }
    }

    return diagnostics;
}

