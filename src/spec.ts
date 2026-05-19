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

/** The expected value type for a design token. */
export type TokenType = 'hex' | 'number' | 'string';

/** Maps a dot-path pattern (with `*` single-segment wildcards) to an expected type. */
export interface TokenSchemaEntry {
    /** Dot-separated path pattern. `*` matches exactly one path segment. */
    pattern: string;
    type: TokenType;
}

/**
 * Schema for known token paths.
 * Evaluated in order — the first matching entry wins.
 * Paths not matched by any entry default to `'string'`.
 */
export const TOKEN_SCHEMA: TokenSchemaEntry[] = [
    { pattern: 'colors.*', type: 'hex' },
    { pattern: 'spacing.*', type: 'number' },
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
