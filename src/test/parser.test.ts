/**
 * Smoke tests for `src/parser.ts`.
 *
 * These tests exercise `extractFrontMatter` and `parseFrontMatter` directly
 * (pure-string functions with no VS Code API dependency), so they run without
 * a full VS Code extension host even though the suite harness is
 * `@vscode/test-electron`.
 */
import * as assert from 'assert';
import { extractFrontMatter, parseFrontMatter } from '../parser.js';

suite('Parser — extractFrontMatter', () => {
    test('returns null when there is no front matter', () => {
        const text = '# Just a heading\n\nSome body text.';
        assert.strictEqual(extractFrontMatter(text), null);
    });

    test('returns null when opening fence is not the first line', () => {
        const text = '\n---\nkey: value\n---\n';
        assert.strictEqual(extractFrontMatter(text), null);
    });

    test('returns null when there is no closing fence', () => {
        const text = '---\nkey: value\n';
        assert.strictEqual(extractFrontMatter(text), null);
    });

    test('extracts yaml content between fences', () => {
        const text = '---\ncolors:\n  primary: "#B8422E"\n---\n# Body';
        const excerpt = extractFrontMatter(text);
        assert.ok(excerpt, 'should return an excerpt');
        assert.ok(excerpt.yaml.includes('primary'), 'yaml should contain the key');
        assert.strictEqual(excerpt.fmStartLine, 0);
        assert.strictEqual(excerpt.fmEndLine, 3);
        assert.strictEqual(excerpt.bodyStartLine, 4);
    });

    test('handles Windows-style CRLF line endings', () => {
        const text = '---\r\nkey: value\r\n---\r\n';
        const excerpt = extractFrontMatter(text);
        assert.ok(excerpt, 'should handle CRLF');
    });

    test('returns an empty yaml string for an empty front matter block', () => {
        const text = '---\n---\n# Body';
        const excerpt = extractFrontMatter(text);
        assert.ok(excerpt);
        assert.strictEqual(excerpt.yaml.trim(), '');
    });
});

suite('Parser — parseFrontMatter', () => {
    test('well-formed front matter returns expected TokenMap', () => {
        const yaml = 'colors:\n  primary: "#B8422E"\nspacing:\n  base: "8px"';
        const result = parseFrontMatter(yaml);
        assert.ok(result.ok, `expected ok but got: ${!result.ok ? result.error.message : ''}`);
        assert.strictEqual(result.tokens['colors.primary'], '#B8422E');
        assert.strictEqual(result.tokens['spacing.base'], '8px');
    });

    test('YAML anchors and aliases are resolved', () => {
        const yaml = 'base: &base "#FF0000"\nprimary: *base';
        const result = parseFrontMatter(yaml);
        assert.ok(result.ok);
        assert.strictEqual(result.tokens['base'], '#FF0000');
        assert.strictEqual(result.tokens['primary'], '#FF0000');
    });

    test('empty YAML block returns empty token map without throwing', () => {
        const result = parseFrontMatter('');
        assert.ok(result.ok);
        assert.deepStrictEqual(result.tokens, {});
    });

    test('malformed YAML returns a ParseError without throwing', () => {
        const yaml = 'colors:\n  primary: [unclosed bracket';
        const result = parseFrontMatter(yaml);
        assert.ok(!result.ok, 'expected error result');
        assert.ok(result.error.message.length > 0, 'error message should be non-empty');
    });

    test('top-level scalar returns ParseError', () => {
        const yaml = 'just a string';
        const result = parseFrontMatter(yaml);
        // js-yaml parses a bare scalar as a string, which is not a valid mapping.
        assert.ok(!result.ok);
    });

    test('numeric values are coerced to strings', () => {
        const yaml = 'spacing:\n  base: 8';
        const result = parseFrontMatter(yaml);
        assert.ok(result.ok);
        assert.strictEqual(result.tokens['spacing.base'], '8');
    });

    test('boolean values are coerced to strings', () => {
        const yaml = 'features:\n  darkMode: true';
        const result = parseFrontMatter(yaml);
        assert.ok(result.ok);
        assert.strictEqual(result.tokens['features.darkMode'], 'true');
    });

    test('nested objects produce dot-separated keys', () => {
        const yaml = 'typography:\n  body:\n    family: "Google Sans"\n    size: 16';
        const result = parseFrontMatter(yaml);
        assert.ok(result.ok);
        assert.strictEqual(result.tokens['typography.body.family'], 'Google Sans');
        assert.strictEqual(result.tokens['typography.body.size'], '16');
    });

    test('array values produce bracket-indexed keys', () => {
        const yaml = 'fonts:\n  - "Google Sans"\n  - "Roboto"';
        const result = parseFrontMatter(yaml);
        assert.ok(result.ok);
        assert.strictEqual(result.tokens['fonts[0]'], 'Google Sans');
        assert.strictEqual(result.tokens['fonts[1]'], 'Roboto');
    });
});
