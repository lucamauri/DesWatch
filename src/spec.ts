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
