/**
 * Unit tests for `getExpectedType` in `src/spec.ts`.
 *
 * These tests are pure — no VS Code API dependency — so they run fast inside
 * the extension host without needing to open any documents.
 */
import * as assert from 'assert';
import { getExpectedType } from '../spec.js';

suite('Schema — getExpectedType', () => {
    test('colors.primary → hex', () => {
        assert.strictEqual(getExpectedType('colors.primary'), 'hex');
    });

    test('colors.on-primary → hex (hyphenated leaf name)', () => {
        assert.strictEqual(getExpectedType('colors.on-primary'), 'hex');
    });

    test('spacing.base → dimension', () => {
        assert.strictEqual(getExpectedType('spacing.base'), 'dimension');
    });

    test('elevation.card → dimension', () => {
        assert.strictEqual(getExpectedType('elevation.card'), 'dimension');
    });

    test('shapes.small → dimension', () => {
        assert.strictEqual(getExpectedType('shapes.small'), 'dimension');
    });

    test('typography.body.size → string', () => {
        assert.strictEqual(getExpectedType('typography.body.size'), 'string');
    });

    test('components.button.background → string', () => {
        assert.strictEqual(getExpectedType('components.button.background'), 'string');
    });

    test('unknown.path → string (catch-all)', () => {
        assert.strictEqual(getExpectedType('unknown.path'), 'string');
    });

    test('single-segment path → string (no match)', () => {
        assert.strictEqual(getExpectedType('colors'), 'string');
    });

    test('colors.primary.variant → string (too many segments)', () => {
        // colors.* only matches 2-segment paths; 3-segment falls through to catch-all.
        assert.strictEqual(getExpectedType('colors.primary.variant'), 'string');
    });
});
