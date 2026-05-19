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
