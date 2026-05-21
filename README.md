# DesWatch

![CI](https://github.com/lucamauri/DesWatch/actions/workflows/ci.yml/badge.svg)

VS Code extension for [DESIGN.md](https://github.com/google-labs-code/design.md) files — Google's open format for describing visual design systems to AI coding agents.

## Features

### Language recognition

Files named `DESIGN.md` or `design.md` are automatically recognised as the `design-md` language. This unlocks all features below and avoids conflicts with ordinary Markdown files.

### Syntax highlighting

The YAML front matter (between the opening and closing `---` fences) is highlighted with full YAML grammar support. The Markdown body is highlighted with standard Markdown grammar. The two layers render distinctly so the boundary between design tokens and prose documentation is always visually clear.

### Inline color swatches

Every hex color value in the YAML front matter (`#RGB`, `#RRGGBB`, `#RRGGBBAA`) gets a colored square swatch rendered inline in the editor gutter. Clicking the swatch opens VS Code's built-in color picker, which writes the new value back in hex format.

## DESIGN.md structure

A valid `DESIGN.md` file contains two layers:

```
---
# YAML front matter — design tokens
colors:
  primary: "#1A73E8"
  surface: "#FFFFFF"
typography:
  body: { family: "Google Sans", size: 16, weight: 400 }
spacing:
  base: 8
---

# Overview
...

# Colors
...

# Typography
...
```

Expected Markdown sections (in order): Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.

## Requirements

VS Code 1.90 or later.

## Extension Settings

No settings in this version.

## Known Limitations

- Color swatches appear only in the YAML front matter, not in the Markdown body.
- No completion, validation, or hover support yet.

## Release Notes

### 0.1.0

Initial release: language registration, YAML/Markdown syntax highlighting, hex color swatches.

## Changelog

### 0.2.0

- **Inline colour swatches in the Markdown body**: Hex colour values in the body text now also get coloured square swatches rendered inline, not just values in the front matter.
- **Smart YAML parsing**: The extension parses your YAML front matter into a structured token map, enabling all the features below.
- **Token diagnostics**: Malformed hex values (e.g. `#GGG`) are underlined as errors. Values with the wrong type for their token path (e.g. plain text in a `colors.*` slot) are flagged as warnings. Missing or out-of-order `##` sections are flagged with configurable severity — controlled by the `deswatch.sectionValidation` setting.
- **Hover cards**: Hover over a token name or reference in the Markdown body to see a card showing the resolved value, plus a colour swatch for hex colours.
- **Completions**: Pressing Ctrl+Space inside the front matter suggests the six canonical top-level keys. Nested completions are offered for `typography:` (family, size, weight, lineHeight) and other structured keys. Typing `#` in a colour-value position suggests example palette colours. In the Markdown body, `## ` completions suggest canonical section names not yet present in the file.
- **Go-to-definition**: F12 or Ctrl+Click on a token name in the Markdown body jumps to its definition in the YAML front matter. When multiple tokens share the same leaf name, a picker lets you choose.
- **Snippets**: Starter templates for quickly inserting a complete DESIGN.md front matter block or individual section stubs. Type `design-md` in the editor to see available snippets.
- **Design Preview panel**: A visual summary panel in the DesWatch activity bar shows all tokens at a glance — colour swatches in a grid, typography specimens, spacing proportion bars, and tables for shapes, elevation, and component overrides. The panel updates when you save the file.
- **Export CSS custom properties**: The "DesWatch: Export CSS Custom Properties" command writes a `design-tokens.css` file with every token as a CSS custom property in a `:root {}` block (e.g. `--colors-primary: #B8422E`).
- **Export Tailwind config**: The "DesWatch: Export Tailwind Config" command writes a `tailwind.config.js` file mapping tokens to the corresponding Tailwind `theme.extend` sections.
- **`deswatch.sectionValidation` setting**: Controls severity of missing or out-of-order section diagnostics (`"warning"` / `"error"` / `"off"`). Defaults to `"warning"`.
- **`deswatch.draftThreshold` setting**: Files with fewer `##` headings than this number are treated as drafts and missing-section hints are suppressed. Defaults to `3`.
