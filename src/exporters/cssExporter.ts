/**
 * DesWatch CSS custom properties exporter.
 *
 * Exports all tokens from the active DESIGN.md file as CSS custom properties
 * inside a `:root {}` block. Example output:
 *
 * ```css
 * :root {
 *   --colors-primary: #B8422E;
 *   --typography-body-size: 16px;
 *   --spacing-base: 8px;
 * }
 * ```
 *
 * Token path transformation: each dot in the path becomes a hyphen, and the
 * whole name is prefixed with `--`. So:
 *   `colors.primary`       → `--colors-primary`
 *   `typography.body.size` → `--typography-body-size`
 */
import * as vscode from 'vscode';
import { getCachedResult } from '../tokenCache.js';
import { TokenMap } from '../parser.js';
import { log } from '../log.js';

/**
 * Registers the `deswatch.exportCssVariables` command.
 *
 * @param context The extension activation context.
 */
export function registerCssExportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('deswatch.exportCssVariables', exportCssVariables)
    );
}

async function exportCssVariables(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'design-md') {
        vscode.window.showErrorMessage('No DESIGN.md file is currently active.');
        return;
    }

    const result = getCachedResult(editor.document);
    if (!result.ok) {
        vscode.window.showErrorMessage(
            `Cannot export: YAML parse error — ${result.error.message}`
        );
        return;
    }

    const css = buildCssOutput(result.tokens);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder, 'design-tokens.css')
        : undefined;

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'CSS files': ['css'] },
        saveLabel: 'Export CSS',
    });
    if (!saveUri) {
        return; // user cancelled
    }

    try {
        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(css, 'utf8'));
        vscode.window.showInformationMessage('Tokens exported to design-tokens.css');
    } catch (err) {
        const msg = `Failed to write CSS file: ${String(err)}`;
        log(msg);
        vscode.window.showErrorMessage(msg);
    }
}

/**
 * Converts a `TokenMap` to CSS custom properties inside a `:root {}` block.
 *
 * Transformation: dot-separated path → kebab-case with `--` prefix.
 *   `colors.primary`       → `--colors-primary: #B8422E;`
 *   `typography.body.size` → `--typography-body-size: 16px;`
 *
 * @param tokens The flat token map from the parsed front matter.
 */
export function buildCssOutput(tokens: TokenMap): string {
    const lines = Object.entries(tokens).map(([path, value]) => {
        // Replace every dot with a hyphen to produce valid CSS custom property names.
        const varName = '--' + path.replace(/\./g, '-');
        return `  ${varName}: ${value};`;
    });
    return `:root {\n${lines.join('\n')}\n}\n`;
}
