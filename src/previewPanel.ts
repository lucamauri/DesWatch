/**
 * DesWatch preview panel.
 *
 * Renders a visual summary of the active DESIGN.md file's token map inside a
 * `WebviewViewProvider` that lives in the DesWatch activity bar container.
 * The panel updates whenever the user saves a `design-md` document or switches
 * to one in the active editor.
 *
 * Rendered sections (in order, each skipped if no tokens are present):
 *   Colors    — 48 × 48 px colour swatches in a responsive grid.
 *   Typography — live text specimens styled with each named type token.
 *   Spacing   — horizontal bars whose width is proportional to the px value.
 *   Shapes    — table of border-radius values.
 *   Elevation — table of box-shadow values.
 *   Components — table of component-level token overrides.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getCachedResult } from './tokenCache.js';
import { TokenMap } from './parser.js';

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers the preview panel `WebviewViewProvider` and subscribes to document
 * save and active-editor-change events so the panel stays in sync.
 *
 * @param context The extension activation context.
 */
export function registerPreviewPanel(context: vscode.ExtensionContext): void {
    const provider = new DesWatchPreviewProvider();

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('deswatch.preview', provider),

        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'design-md') {
                provider.refresh(doc);
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'design-md') {
                provider.refresh(editor.document);
            }
        })
    );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

class DesWatchPreviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        const activeDoc = vscode.window.activeTextEditor?.document;
        if (activeDoc && activeDoc.languageId === 'design-md') {
            this.refresh(activeDoc);
        } else {
            webviewView.webview.html = this._emptyHtml();
        }
    }

    /**
     * Re-renders the panel from the current token map of `doc`.
     * No-op if the panel has not yet been resolved.
     */
    refresh(doc: vscode.TextDocument): void {
        if (!this._view) {
            return;
        }
        const result = getCachedResult(doc);
        const tokens: TokenMap = result.ok ? result.tokens : {};
        this._view.webview.html = this._buildHtml(tokens);
    }

    // ── HTML builders ─────────────────────────────────────────────────────────

    private _emptyHtml(): string {
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}</style>
</head><body><p style="opacity:0.6;font-size:12px">Open a DESIGN.md file to see the design token preview.</p></body></html>`;
    }

    private _buildHtml(tokens: TokenMap): string {
        const nonce = crypto.randomBytes(16).toString('hex');
        const body = this._buildBody(tokens);
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">
<style>
* { box-sizing: border-box; }
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); margin: 0; padding: 10px 12px 24px; }
h2 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.55; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.25)); }
.swatch-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.swatch-item { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.swatch { width: 48px; height: 48px; border-radius: 4px; border: 1px solid rgba(128,128,128,0.25); }
.swatch-label { font-size: 9px; opacity: 0.75; word-break: break-all; text-align: center; max-width: 52px; line-height: 1.3; }
.type-specimen { margin: 6px 0; }
.type-meta { font-size: 9px; opacity: 0.55; margin-bottom: 2px; }
.spacing-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
.spacing-bar { background: var(--vscode-button-background, #0078d4); height: 8px; border-radius: 2px; min-width: 2px; }
.spacing-label { font-size: 10px; opacity: 0.7; white-space: nowrap; }
table { border-collapse: collapse; width: 100%; font-size: 10px; }
td { padding: 3px 4px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15)); vertical-align: top; }
td:first-child { opacity: 0.65; white-space: nowrap; padding-right: 8px; }
td:last-child { font-family: var(--vscode-editor-font-family, monospace); word-break: break-all; }
.empty { opacity: 0.5; font-size: 11px; padding: 8px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
    }

    private _buildBody(tokens: TokenMap): string {
        if (Object.keys(tokens).length === 0) {
            return '<p class="empty">No design tokens found in the front matter.</p>';
        }

        const parts: string[] = [];

        parts.push(...[
            this._colorsSection(tokens),
            this._typographySection(tokens),
            this._spacingSection(tokens),
            this._shapesSection(tokens),
            this._elevationSection(tokens),
            this._componentsSection(tokens),
        ].filter((s): s is string => s !== null));

        return parts.length > 0 ? parts.join('') : '<p class="empty">No recognised token groups in the front matter.</p>';
    }

    // ── Section renderers ─────────────────────────────────────────────────────

    private _colorsSection(tokens: TokenMap): string | null {
        const entries = Object.entries(tokens).filter(([k]) => k.startsWith('colors.'));
        if (entries.length === 0) {
            return null;
        }
        const swatches = entries.map(([key, value]) => {
            const label = key.slice('colors.'.length);
            const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
            const bg = isHex ? value : 'var(--vscode-widget-border, #888)';
            return `<div class="swatch-item"><div class="swatch" style="background:${bg}" title="${esc(value)}"></div><div class="swatch-label">${esc(label)}</div></div>`;
        }).join('');
        return `<h2>Colors</h2><div class="swatch-grid">${swatches}</div>`;
    }

    private _typographySection(tokens: TokenMap): string | null {
        const styles: Record<string, Record<string, string>> = {};
        for (const [key, value] of Object.entries(tokens)) {
            if (!key.startsWith('typography.')) {
                continue;
            }
            const parts = key.split('.');
            if (parts.length < 3) {
                continue;
            }
            const styleName = parts[1];
            const prop = parts.slice(2).join('.');
            if (!styles[styleName]) {
                styles[styleName] = {};
            }
            styles[styleName][prop] = value;
        }
        if (Object.keys(styles).length === 0) {
            return null;
        }
        const specimens = Object.entries(styles).map(([name, props]) => {
            const cssProps = [
                props.family     ? `font-family:${props.family}`         : '',
                props.size       ? `font-size:${props.size}`             : '',
                props.weight     ? `font-weight:${props.weight}`         : '',
                props.lineHeight ? `line-height:${props.lineHeight}`     : '',
            ].filter(Boolean).join(';');
            const meta = Object.entries(props).map(([k, v]) => `${k}: ${v}`).join(' · ');
            return `<div class="type-specimen"><div class="type-meta">${esc(name)} — ${esc(meta)}</div><div style="${cssProps}">Aa Bb Cc 123</div></div>`;
        }).join('');
        return `<h2>Typography</h2>${specimens}`;
    }

    private _spacingSection(tokens: TokenMap): string | null {
        const entries = Object.entries(tokens).filter(([k]) => k.startsWith('spacing.'));
        if (entries.length === 0) {
            return null;
        }
        const bars = entries.map(([key, value]) => {
            const label = key.slice('spacing.'.length);
            const px = parseFloat(value);
            const width = isNaN(px) ? 4 : Math.max(2, Math.min(Math.round(px * 2), 200));
            return `<div class="spacing-row"><div class="spacing-bar" style="width:${width}px"></div><span class="spacing-label">${esc(label)}: ${esc(value)}</span></div>`;
        }).join('');
        return `<h2>Spacing</h2>${bars}`;
    }

    private _shapesSection(tokens: TokenMap): string | null {
        return this._tableSection(tokens, 'shapes', 'Shapes');
    }

    private _elevationSection(tokens: TokenMap): string | null {
        return this._tableSection(tokens, 'elevation', 'Elevation');
    }

    private _componentsSection(tokens: TokenMap): string | null {
        return this._tableSection(tokens, 'components', 'Components');
    }

    private _tableSection(tokens: TokenMap, prefix: string, title: string): string | null {
        const entries = Object.entries(tokens).filter(([k]) => k.startsWith(`${prefix}.`));
        if (entries.length === 0) {
            return null;
        }
        const rows = entries.map(([key, value]) => {
            const label = key.slice(prefix.length + 1);
            return `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`;
        }).join('');
        return `<h2>${title}</h2><table>${rows}</table>`;
    }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** HTML-escapes a string for safe inline insertion into attribute values and text nodes. */
function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
