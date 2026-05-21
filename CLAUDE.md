# DesWatch — Project Context

This file is the authoritative project memory for Claude Code sessions.
Read it fully at the start of every session before touching any code.

---

## What this project is

DesWatch is a VS Code extension providing first-class editing support for
`DESIGN.md` files following the
[Google design.md spec](https://github.com/google-labs-code/design.md).

- **Publisher:** `lucamauri` (existing Marketplace account)
- **Extension ID:** `lucamauri.design-md`
- **Current version:** `0.2.0` (published)
- **Marketplace:** https://marketplace.visualstudio.com/publishers/lucamauri
- **Repo:** https://github.com/lucamauri/deswatch

---

## Architecture

- **Language:** TypeScript, compiled with `tsc`, bundled with `esbuild`
- **Target:** VS Code 1.90+, `module: Node16`, `target: ES2022`
- **All providers are in-process.** No Language Server Protocol. No child
  process. All VS Code APIs are called directly from the extension host.
- **YAML parsing:** `js-yaml` (v4, resolves anchors/aliases). No regex-only
  approach for structured data anywhere in the codebase.
- **Bundling:** `esbuild` via `vscode:prepublish`. The `node_modules` are NOT
  shipped in the VSIX — all dependencies are bundled into `out/extension.js`.
  This is critical: forgetting to bundle will cause "Cannot find module"
  errors at runtime.
- **Testing:** `@vscode/test-cli` with Mocha. Config in `.vscode-test.mjs`.
  CI runs on GitHub Actions (`ubuntu-latest`) — test-cli handles Xvfb internally.

---

## File structure

```
src/
  extension.ts          — activation entry point; wires up all providers
  spec.ts               — pinned spec constants (SPEC, TOKEN_SCHEMA, getExpectedType)
  parser.ts             — YAML front matter extractor and js-yaml wrapper
  tokenCache.ts         — shared per-document ParseResult cache
  log.ts                — lazy DesWatch output channel
  diagnostics.ts        — two-pass DiagnosticCollection provider
  hoverProvider.ts      — hover cards with inline color swatches
  completionProvider.ts — three-region completion provider
  definitionProvider.ts — go-to-definition, returns Location[]
  colorDecorations.ts   — DocumentColorProvider (front matter + body)
  tokenDecorations.ts   — dotted underline decorations for token names in body
  previewPanel.ts       — WebviewViewProvider sidebar preview panel
  exporters/
    cssExporter.ts      — deswatch.exportCssVariables command
    tailwindExporter.ts — deswatch.exportTailwindConfig command
  test/
    parser.test.ts
    schema.test.ts
    diagnostics.test.ts
    completions.test.ts
    definition.test.ts
syntaxes/
  design-md.tmLanguage.json — TextMate grammar
snippets/
  design-md.json            — design-scaffold snippet (8 tabstops)
images/
  icon.svg                  — source logo (not shipped in VSIX)
  icon.png                  — 128×128 Marketplace icon
scripts/
  build-icon.mjs            — one-off SVG→PNG export via sharp
handoffs/                   — permanent session diary (see convention below)
.github/workflows/ci.yml    — CI pipeline
.vscode-test.mjs            — @vscode/test-cli config
```

---

## Scripts

```
npm run compile          — tsc type-check (use for development)
npm run bundle           — esbuild bundle (what vscode:prepublish runs)
npm run watch            — tsc watch mode
npm run test             — vscode-test (runs @vscode/test-cli)
npm run build-icon       — regenerate images/icon.png from SVG via sharp
npx vsce package         — produce .vsix (runs vscode:prepublish first)
npx vsce publish         — publish to Marketplace (runs vscode:prepublish first)
```

---

## Decisions — do not re-open these

| Topic | Decision | Reason |
|---|---|---|
| Color formats | Hex only (`#RGB` / `#RRGGBB` / `#RRGGBBAA`) | Low false-positive rate; spec uses hex throughout |
| Validation severity | `deswatch.sectionValidation` setting, default `"warning"`. Token validity always `"error"`. | Authoring is incremental; errors on incomplete files are too aggressive |
| Architecture | In-process providers only | LSP reusability not justified until other editors demand it |
| YAML parsing | `js-yaml` everywhere | Resolves anchors/aliases; regex can't |
| Spec versioning | Pinned in `src/spec.ts` | Runtime network fetch is fragile and makes behaviour non-deterministic |
| Publisher | `lucamauri` personal account | Existing account with published extensions; single identity |
| Language registration | `filenamePatterns: ["*design*.md", "*DESIGN*.md"]` | `filenames` is exact-match only; `filenamePatterns` supports globs. Two patterns needed for Linux case-sensitivity |
| Bundling | esbuild via `vscode:prepublish` | `node_modules` not included in VSIX; dependencies bundled into `out/extension.js` |
| Numeric token types | `'number'` (unitless) and `'dimension'` (number + unit) are distinct | `lineHeight: "1.5"` and `spacing.base: "8px"` are different formats |
| Preview panel refresh | Save-only + Refresh button | Keystroke refresh causes flicker and scroll reset |
| Component grouping | `<h3>` sub-headers per component name | Flat table forces mental reconstruction |
| Export formats | CSS custom properties, then Tailwind. DTCG deferred. | CSS is universal; Tailwind serves the primary audience; DTCG is premature |
| Hover swatch flag | No feature flag | Wait for evidence of breakage before acting |
| LSP | Rejected | In-process is simpler; LSP only pays off if other editors adopt the format |
| CI test runner | `@vscode/test-cli` | Lighter than `@vscode/test-electron`; handles Xvfb internally |
| Snippet single-entry templates | Removed; replaced by context-aware Region A completions | Snippets can't be context-scoped dynamically |
| Definition provider | Returns `Location[]` | VS Code shows peek panel on multiple matches automatically |
| Token decorations | Dotted underline via `createTextEditorDecorationType` | Convention VS Code uses for resolvable identifiers; theme-independent |
| Typography font loading | Google Fonts via CSP `@import` | Webview sandbox blocks system fonts; Google Fonts covers common design system typefaces |
| Typography token keys | `fontFamily`, `fontSize`, `fontWeight`, `lineHeight` (camelCase) | Matches actual YAML key names in the spec examples |
| HANDOFF convention | Root `/HANDOFF.md` gitignored; archived to `handoffs/YYYY-MM-DD-phase-N.md` | Root file is transient; `handoffs/` is permanent project diary |
| mocha version | Pinned to v10 | v11 + `@types/mocha` v10 mismatch causes type errors |
| `tsconfig.json` types | `["node", "mocha"]` explicit | Required after adding `@types/node`; prevents mocha globals from being lost |

---

## Known limitations (as of 0.2.0)

- `TOKEN_SCHEMA` covers only `colors.*` (hex) and `spacing.*` / `elevation.*` /
  `shapes.*` (dimension). `typography.*.*` and `components.*.*` default to
  `'string'` (no type validation).
- Nested completion depth: sub-key completions are offered from the top-level
  key, not the named sub-entry level.
- Definition provider returns first match for ambiguous leaf names (multiple
  paths sharing the same leaf). Disambiguation UI (peek panel) works when
  multiple locations are returned.
- Preview panel typography specimens require an internet connection to load
  fonts via Google Fonts. Offline or private fonts fall back to system default.
- `design-scaffold` snippet has 8 tabstops — may still feel like too many for
  some users. Revisit based on feedback.
- Screenshots in README are placeholders — real screenshots to be captured
  and committed after Marketplace listing is live.
- DTCG export deferred indefinitely.
- Component section in preview panel is grouped by name but not further
  styled — revisit based on user feedback.

---

## Key source patterns to know

### ParseResult shape
```typescript
// Success
{ ok: true, tokens: TokenMap }
// Failure
{ ok: false, error: ParseError }
// Always check result.ok, never result.kind
```

### TokenMap
Flat `Record<string, string>` with dot-separated keys:
```
"colors.primary" → "#B8422E"
"typography.body.fontFamily" → "Inter"
"spacing.base" → "8px"
```

### Token path lookup
Both full-path (`colors.primary`) and leaf-name (`primary`) lookups are used
in hover and definition providers. Leaf-name is the last `.`-separated segment.

### Debounce pattern
All `onDidChangeTextDocument` handlers use a 500 ms debounce with a
per-document `Map<string, ReturnType<typeof setTimeout>>` timer map.
Use `ReturnType<typeof setTimeout>` (not `NodeJS.Timeout`) to avoid
depending on `@types/node` globals directly.

### Front matter boundary
The YAML front matter is between the first and second `---` fence lines.
Use `getExcerpt()` from `parser.ts` to extract it. Body starts at the line
after the second `---`.

### Webview CSP
```
default-src 'none';
style-src 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com data:;
```
Do not add `script-src` — the preview panel uses no external scripts.

---

## Handoff convention

After each Claude Code session:
1. Claude Code generates `HANDOFF.md` at the repo root
2. Human reviews it in the planning chat
3. Human moves and renames it: `handoffs/YYYY-MM-DD-phase-N.md`
4. Commit with message: `handoff: phase N — <one line summary>`

The `handoffs/` directory is tracked in git and serves as a permanent,
human-readable project diary explaining *why* the code looks the way it does.

---

## What to build next (Phase 6+)

In rough priority order, based on decisions made but not yet implemented:

1. **Screenshots for README** — capture 4 screenshots from the installed
   `.vsix` and replace the placeholder comments in `README.md`
2. **Extended TOKEN_SCHEMA** — add type entries for `typography.*.*`
   (once real-world usage clarifies expected formats)
3. **Context-aware single-entry completions** — replace deleted
   `design-color` / `design-type` / `design-component` snippets with
   Region A completions that activate inside the correct parent key block
4. **Preview panel live refresh** — debounced `onDidChangeTextDocument`
   refresh behind a `deswatch.previewRefreshOnType: boolean` setting
   (default `false`)
5. **Go-to-definition in front matter** — navigate from a `{token.path}`
   reference in a component value to the token's definition line
6. **Export DTCG format** — deferred; implement if user demand emerges
