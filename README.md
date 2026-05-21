# DesWatch
> Design token intelligence for VS Code

![CI](https://github.com/lucamauri/DesWatch/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/visual-studio-marketplace/v/lucamauri.design-md)

First-class editing support for [DESIGN.md](https://github.com/google-labs-code/design.md) files — Google's open format for describing visual design systems to AI coding agents and human collaborators.

## Features

<!-- Screenshot: inline color swatches in YAML front matter -->

### Language recognition

Files named `DESIGN.md` or `design.md` are automatically recognised as `design-md`. This activates all DesWatch features and keeps YAML and Markdown highlighting separate so the boundary between design tokens and prose is always clear.

### Inline colour swatches

Every hex colour value in the YAML front matter — and in the Markdown body — gets a coloured square swatch rendered inline. Clicking the swatch opens VS Code's built-in colour picker, which writes the new value back in hex format.

Supported formats: `#RGB`, `#RRGGBB`, `#RRGGBBAA`.

### Token diagnostics

DesWatch validates your token map as you type and flags problems:

- **Malformed hex values** (e.g. `#GGG`, `#12345G`) — always reported as errors.
- **Wrong value type** (e.g. plain text in a `colors.*` slot) — reported as errors for colour tokens, warnings for dimension tokens.
- **Missing or out-of-order `##` sections** — severity is controlled by the `deswatch.sectionValidation` setting.

<!-- Screenshot: hover card showing token value and color swatch -->

### Hover cards

Hover over any token name or reference in the Markdown body to see a card with its resolved value. Hex colour values include an inline colour swatch in the card.

<!-- Screenshot: completion provider suggesting section headings -->

### Completions

- **Top-level keys** — `Ctrl+Space` at indent 0 inside the front matter suggests all six canonical keys.
- **Nested keys** — indented under `typography:` offers `family`, `size`, `weight`, `lineHeight`; indented under `components:`, `elevation:`, and `shapes:` offers their respective sub-keys.
- **Hex palette** — typing `#` in a colour value position suggests six example palette colours. Suppressed on non-colour token paths (e.g. `spacing.*`).
- **Section headings** — `##` completions in the body suggest canonical section names not yet in the file.

### Go-to-definition

F12 or Ctrl+Click on a token name in the Markdown body jumps to its definition in the YAML front matter. When multiple tokens share the same leaf name, a picker lets you choose.

### Snippets

Starter templates for a full `DESIGN.md` front matter block and individual token sections. Type `design-md` in the editor to browse available snippets.

<!-- Screenshot: preview panel with color swatches grid -->

### Design Preview panel

The DesWatch activity bar icon opens a visual summary of all tokens:

- **Colors** — 48 × 48 px swatches in a responsive grid.
- **Typography** — live text specimens styled with each named type token.
- **Spacing** — horizontal bars proportional to each token's pixel value.
- **Shapes / Elevation** — tables of border-radius and shadow values.
- **Components** — token overrides grouped by component name, each with its own sub-header.

The panel updates when you save the file. Use the **Refresh** button to update immediately without saving.

### Export commands

- **DesWatch: Export CSS Custom Properties** — writes `design-tokens.css` with all tokens as `--kebab-case` CSS custom properties in a `:root {}` block.
- **DesWatch: Export Tailwind Config** — writes `tailwind.config.js` with tokens mapped to the appropriate `theme.extend` sections (`colors`, `spacing`, `fontFamily`, `fontSize`, etc.).

---

## Getting Started

1. Install DesWatch from the VS Code Marketplace.
2. Open or create a file named `DESIGN.md` or `design.md`.
3. Add a YAML front matter block between `---` fences at the top of the file.
4. Start typing — colour swatches, completions, hover cards, and diagnostics activate automatically.

Example file structure:

```
---
colors:
  primary: "#1A73E8"
  surface: "#FFFFFF"
typography:
  body:
    family: "Google Sans"
    size: 16px
    weight: 400
spacing:
  base: 8px
  large: 24px
---

## Overview

A brief description of the design system.

## Colors

...
```

---

## Commands

| Command | Description |
|---|---|
| `DesWatch: Export CSS Custom Properties` | Export all tokens as CSS custom properties to a `.css` file |
| `DesWatch: Export Tailwind Config` | Export tokens as a `tailwind.config.js` `theme.extend` block |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `deswatch.sectionValidation` | `"warning"` | Severity of diagnostics for missing or out-of-order `##` sections. Values: `"error"`, `"warning"`, `"off"`. Token-level errors are always `"error"` regardless of this setting. |
| `deswatch.draftThreshold` | `3` | Minimum number of `##` headings before DesWatch reports missing canonical sections. Files below this threshold are treated as drafts and missing-section hints are suppressed. |

---

## Snippets

| Prefix | Description |
|---|---|
| `design-md` | Full DESIGN.md front matter scaffold with all six token groups |
| `design-md-colors` | Colors token group |
| `design-md-typography` | Typography token group |
| `design-md-spacing` | Spacing token group |
| `design-md-elevation` | Elevation token group |
| `design-md-shapes` | Shapes token group |
| `design-md-components` | Components token group |

---

## Requirements

VS Code 1.90 or later.

---

## Changelog

### 0.2.0

- **Inline colour swatches in the Markdown body**: Hex colour values in body text now also get coloured square swatches, not just values in the front matter.
- **Smart YAML parsing**: The extension parses your YAML front matter into a structured token map, enabling all the features below.
- **Token diagnostics**: Malformed hex values (e.g. `#GGG`) are underlined as errors. Values with the wrong type for their token path (e.g. plain text in a `colors.*` slot) are flagged as warnings. Missing or out-of-order `##` sections are flagged with configurable severity — controlled by the `deswatch.sectionValidation` setting.
- **Hover cards**: Hover over a token name or reference in the Markdown body to see a card showing the resolved value, plus a colour swatch for hex colours.
- **Completions**: Ctrl+Space inside the front matter suggests the six canonical top-level keys. Nested completions are offered for `typography:` and other structured keys. Typing `#` in a colour-value position suggests example palette colours (suppressed on non-colour token paths). In the Markdown body, `## ` completions suggest canonical section names not yet present.
- **Go-to-definition**: F12 or Ctrl+Click on a token name in the Markdown body jumps to its definition in the YAML front matter. Ambiguous names show a disambiguation picker.
- **Snippets**: Starter templates for a full DESIGN.md structure and individual section stubs.
- **Design Preview panel**: Visual summary in the DesWatch activity bar — colour swatches, typography specimens, spacing bars, and tables for shapes, elevation, and components. Components are grouped by component name. Includes a Refresh button.
- **Export CSS custom properties**: "DesWatch: Export CSS Custom Properties" writes `design-tokens.css` with every token as a `--kebab-case` CSS custom property.
- **Export Tailwind config**: "DesWatch: Export Tailwind Config" writes `tailwind.config.js` mapping tokens to Tailwind `theme.extend` sections.
- **`deswatch.sectionValidation` setting**: Controls severity of missing/out-of-order section diagnostics.
- **`deswatch.draftThreshold` setting**: Suppresses missing-section hints in files with fewer headings than this threshold.

### 0.1.0

Initial release: language registration, YAML/Markdown syntax highlighting, hex colour swatches.
