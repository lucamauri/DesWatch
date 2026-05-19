/**
 * Shared per-document token cache.
 *
 * Both the diagnostics provider and the hover provider need the `ParseResult`
 * for the current document. Parsing on every keystroke or every hover event
 * would be wasteful. This module caches the result keyed by document URI and
 * invalidates it when the document version changes.
 *
 * Usage pattern:
 *   - Call `getCachedResult(doc)` to get a fresh-or-cached `ParseResult`.
 *   - Call `invalidate(uri)` to eagerly evict a document (e.g., on close).
 *
 * Thread safety: VS Code's extension host is single-threaded, so no locking
 * is needed.
 */
import * as vscode from 'vscode';
import { parseDocument, ParseResult } from './parser.js';

interface CacheEntry {
    /** The parsed result that was stored. */
    result: ParseResult;
    /** The `TextDocument.version` at which the result was computed. */
    version: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Returns the `ParseResult` for `doc`, reusing a cached value if the document
 * has not changed since it was last parsed.
 *
 * The cache key is `doc.uri.toString()`. A stale entry (version mismatch)
 * triggers a fresh call to `parseDocument`.
 *
 * @param doc A VS Code text document (must be `design-md` language for
 *            meaningful results, but is safe to call on any document).
 */
export function getCachedResult(doc: vscode.TextDocument): ParseResult {
    const key = doc.uri.toString();
    const entry = cache.get(key);

    // Return the cached result when the document hasn't changed.
    if (entry && entry.version === doc.version) {
        return entry.result;
    }

    const result = parseDocument(doc);
    cache.set(key, { result, version: doc.version });
    return result;
}

/**
 * Removes the cached entry for a document URI.
 * Call this when a document is closed to avoid unbounded memory growth.
 *
 * @param uri The URI of the document to evict.
 */
export function invalidate(uri: vscode.Uri): void {
    cache.delete(uri.toString());
}

/**
 * Removes all entries from the cache.
 * Called from `extension.deactivate()` as a belt-and-suspenders cleanup.
 */
export function clearCache(): void {
    cache.clear();
}
