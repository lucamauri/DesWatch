/**
 * Unit tests for the type-mismatch sub-pass in `src/diagnostics.ts`.
 *
 * These tests call `parseFrontMatter` to build a token map, then pass it
 * directly to `findTypeMismatches` — a pure function with no VS Code API
 * dependency. No documents or editor state are required.
 */
import * as assert from 'assert';
import { parseFrontMatter } from '../parser.js';
import { findTypeMismatches } from '../diagnostics.js';
import { TokenMap } from '../parser.js';

/** Parses a YAML snippet and asserts it succeeded. */
function parseOk(yaml: string): TokenMap {
    const result = parseFrontMatter(yaml);
    if (!result.ok) {
        throw new Error(`Unexpected parse error: ${result.error.message}`);
    }
    return result.tokens;
}

suite('Diagnostics — type-mismatch sub-pass', () => {
    // ── colors.* ────────────────────────────────────────────────────────────

    test('colors.* with valid hex value → no mismatch', () => {
        const tokens = parseOk('colors:\n  primary: "#B8422E"');
        const mismatches = findTypeMismatches(tokens);
        assert.strictEqual(mismatches.length, 0);
    });

    test('colors.* with non-hex string value → Error mismatch', () => {
        const tokens = parseOk('colors:\n  primary: red');
        const mismatches = findTypeMismatches(tokens);
        const m = mismatches.find(x => x.path === 'colors.primary');
        assert.ok(m, 'expected a mismatch for colors.primary');
        assert.strictEqual(m!.isError, true, 'should be Error severity');
    });

    test('colors.* with token reference {colors.base} → no mismatch', () => {
        const tokens = parseOk('colors:\n  primary: "{colors.base}"');
        const mismatches = findTypeMismatches(tokens);
        assert.strictEqual(mismatches.length, 0, 'cross-references are always valid');
    });

    // ── spacing.* (dimension type) ───────────────────────────────────────────

    test('spacing.* with valid dimension "8px" → no mismatch', () => {
        const tokens = parseOk('spacing:\n  base: 8px');
        const mismatches = findTypeMismatches(tokens);
        assert.strictEqual(mismatches.length, 0);
    });

    test('spacing.* with valid unitless number "8" → no mismatch', () => {
        // A bare number is acceptable as a dimension (unit is optional).
        const tokens = parseOk('spacing:\n  base: 8');
        const mismatches = findTypeMismatches(tokens);
        assert.strictEqual(mismatches.length, 0);
    });

    test('spacing.* with non-numeric value "eight" → Warning mismatch', () => {
        const tokens = parseOk('spacing:\n  base: eight');
        const mismatches = findTypeMismatches(tokens);
        const m = mismatches.find(x => x.path === 'spacing.base');
        assert.ok(m, 'expected a mismatch for spacing.base');
        assert.strictEqual(m!.isError, false, 'should be Warning severity, not Error');
    });

    // ── typography.*.* (string type) ─────────────────────────────────────────

    test('typography.*.* with any string value → no mismatch', () => {
        const tokens = parseOk(
            'typography:\n  body:\n    family: "Google Sans"\n    size: 16px\n    weight: 400'
        );
        const mismatches = findTypeMismatches(tokens);
        assert.strictEqual(mismatches.length, 0, 'typography tokens are always string type');
    });

    // ── elevation.* and shapes.* (dimension type) ────────────────────────────

    test('elevation.* with valid dimension "4px" → no mismatch', () => {
        const tokens = parseOk('elevation:\n  card: 4px');
        const mismatches = findTypeMismatches(tokens);
        assert.strictEqual(mismatches.length, 0);
    });

    test('shapes.* with valid percentage "50%" → no mismatch', () => {
        const tokens = parseOk('shapes:\n  pill: 50%');
        const mismatches = findTypeMismatches(tokens);
        assert.strictEqual(mismatches.length, 0);
    });

    test('shapes.* with non-numeric value "round" → Warning mismatch', () => {
        const tokens = parseOk('shapes:\n  small: round');
        const mismatches = findTypeMismatches(tokens);
        const m = mismatches.find(x => x.path === 'shapes.small');
        assert.ok(m, 'expected a mismatch for shapes.small');
        assert.strictEqual(m!.isError, false);
    });
});
