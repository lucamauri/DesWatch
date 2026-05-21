/**
 * DesWatch spec constants — pinned to design.md spec v1.0.0.
 *
 * When the upstream spec changes in a meaningful way, update this file
 * and bump SPEC_VERSION. Do not fetch spec data from the network at runtime.
 *
 * Upstream: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
 */
export const SPEC = {
    /** Upstream spec revision this file tracks. */
    specVersion: '1.0.0',

    /**
     * The canonical section order for the Markdown body.
     * Diagnostics will warn/error when sections are missing or out of order.
     */
    canonicalSectionOrder: [
        'Overview',
        'Colors',
        'Typography',
        'Layout',
        'Elevation & Depth',
        'Shapes',
        'Components',
        "Do's and Don'ts",
    ],

    /**
     * Known top-level keys for the YAML front matter.
     * Used for completion suggestions and unknown-key diagnostics.
     */
    frontMatterKeys: [
        'colors',
        'typography',
        'spacing',
        'elevation',
        'shapes',
        'components',
    ],
} as const;

// ─── Token schema ─────────────────────────────────────────────────────────────

/**
 * The expected value type for a design token.
 *
 * - `'hex'`       — a CSS hex colour string (#RGB, #RRGGBB, #RRGGBBAA).
 * - `'number'`    — a unitless numeric value (e.g. `400`, `1.5`). Distinct from
 *                   `'dimension'` because some properties (font-weight, z-index)
 *                   must never carry a CSS unit — mixing them up is a bug.
 * - `'dimension'` — a numeric value with an optional CSS unit (e.g. `8px`,
 *                   `0.5rem`, `50%`). Used for sizing and spacing tokens where
 *                   units are expected and unitless values would be ambiguous.
 * - `'string'`    — any arbitrary string; no format validation is applied.
 */
export type TokenType = 'hex' | 'number' | 'dimension' | 'string';

/** Maps a dot-path pattern (with `*` single-segment wildcards) to an expected type. */
export interface TokenSchemaEntry {
    /** Dot-separated path pattern. `*` matches exactly one path segment. */
    pattern: string;
    type: TokenType;
    /** Short description of what this token group represents. */
    description: string;
}

/**
 * Schema for known token paths.
 * Evaluated in order — the first matching entry wins.
 * Paths not matched by any entry default to `'string'`.
 */
export const TOKEN_SCHEMA: TokenSchemaEntry[] = [
    { pattern: 'colors.*',       type: 'hex',       description: 'Color tokens: hex strings (#RGB, #RRGGBB, #RRGGBBAA)' },
    // 'dimension' accepts a number with an optional CSS unit (e.g. 8px, 0.5rem, 50%).
    // Separate from 'number' (unitless) because spacing/sizing tokens are expected to
    // carry units — accepting bare numbers here would silently hide missing units.
    { pattern: 'spacing.*',      type: 'dimension', description: 'Spacing tokens: numeric with optional unit (e.g. 8px, 0.5rem)' },
    { pattern: 'elevation.*',    type: 'dimension', description: 'Elevation tokens: numeric with optional unit (e.g. 4px)' },
    { pattern: 'shapes.*',       type: 'dimension', description: 'Shape/radius tokens: numeric with optional unit (e.g. 4px, 50%)' },
    // typography.*.*  stays 'string': format varies widely by property — font-family
    // strings, size strings with units, bare weight integers, line-height multipliers.
    // Not enough consistency across the property space to constrain further.
    { pattern: 'typography.*.*', type: 'string',    description: 'Typography values: strings (format varies by property)' },
    // components.*.*  stays 'string': values are either {token.path} cross-references
    // or arbitrary CSS-like strings — no single format to validate against.
    { pattern: 'components.*.*', type: 'string',    description: 'Component token references: strings or {token.path} references' },
];

/**
 * Returns the expected `TokenType` for a dot-separated token path.
 * Matches against `TOKEN_SCHEMA` using `*` as a single-segment wildcard.
 * Returns `'string'` when no schema entry matches.
 *
 * @param tokenPath Dot-separated path such as `"colors.primary"` or `"spacing.base"`.
 */
export function getExpectedType(tokenPath: string): TokenType {
    const pathSegments = tokenPath.split('.');
    for (const entry of TOKEN_SCHEMA) {
        const patternSegments = entry.pattern.split('.');
        if (patternSegments.length !== pathSegments.length) {
            continue;
        }
        const matches = patternSegments.every(
            (seg, i) => seg === '*' || seg === pathSegments[i]
        );
        if (matches) {
            return entry.type;
        }
    }
    return 'string';
}
