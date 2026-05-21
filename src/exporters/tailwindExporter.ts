/**
 * DesWatch Tailwind CSS config exporter.
 *
 * Exports all tokens from the active DESIGN.md file as a complete
 * `tailwind.config.js` file with a `theme.extend` block.
 *
 * Top-level key → Tailwind theme section mapping:
 * | Token prefix              | Tailwind section            |
 * |---------------------------|-----------------------------|
 * | `colors.*`                | `theme.extend.colors`       |
 * | `spacing.*`               | `theme.extend.spacing`      |
 * | `typography.*.family`     | `theme.extend.fontFamily`   |
 * | `typography.*.size`       | `theme.extend.fontSize`     |
 * | `typography.*.weight`     | `theme.extend.fontWeight`   |
 * | `typography.*.lineHeight` | `theme.extend.lineHeight`   |
 * | `shapes.*`                | `theme.extend.borderRadius` |
 * | `elevation.*`             | `theme.extend.boxShadow`    |
 * | `components.*.*`          | (skipped — no Tailwind equivalent) |
 */
import * as vscode from 'vscode';
import { getCachedResult } from '../tokenCache.js';
import { TokenMap } from '../parser.js';
import { log } from '../log.js';

/**
 * Registers the `deswatch.exportTailwindConfig` command.
 *
 * @param context The extension activation context.
 */
export function registerTailwindExportCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('deswatch.exportTailwindConfig', exportTailwindConfig)
    );
}

async function exportTailwindConfig(): Promise<void> {
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

    const js = buildTailwindOutput(result.tokens);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder, 'tailwind.config.js')
        : undefined;

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'JavaScript files': ['js'] },
        saveLabel: 'Export Tailwind Config',
    });
    if (!saveUri) {
        return; // user cancelled
    }

    try {
        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(js, 'utf8'));
        vscode.window.showInformationMessage('Tokens exported to tailwind.config.js');
    } catch (err) {
        const msg = `Failed to write Tailwind config: ${String(err)}`;
        log(msg);
        vscode.window.showErrorMessage(msg);
    }
}

/** Nested object model for the Tailwind `theme.extend` block. */
interface ThemeExtend {
    colors?: Record<string, string>;
    spacing?: Record<string, string>;
    fontFamily?: Record<string, string>;
    fontSize?: Record<string, string>;
    fontWeight?: Record<string, string>;
    lineHeight?: Record<string, string>;
    borderRadius?: Record<string, string>;
    boxShadow?: Record<string, string>;
}

/**
 * Converts a `TokenMap` into a complete `tailwind.config.js` file string.
 *
 * @param tokens The flat token map from the parsed front matter.
 */
export function buildTailwindOutput(tokens: TokenMap): string {
    const extend = buildThemeExtend(tokens);
    const extendStr = serializeThemeExtend(extend);
    return `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  theme: {\n    extend: ${extendStr}\n  }\n};\n`;
}

/**
 * Maps design tokens to Tailwind `theme.extend` sections.
 *
 * Typography tokens are split by their leaf property name:
 *   `typography.<style>.family`     → `fontFamily.<style>`
 *   `typography.<style>.size`       → `fontSize.<style>`
 *   `typography.<style>.weight`     → `fontWeight.<style>`
 *   `typography.<style>.lineHeight` → `lineHeight.<style>`
 *
 * `components.*` tokens are skipped because component compositions are
 * defined in component CSS or class utilities, not in the Tailwind theme.
 */
function buildThemeExtend(tokens: TokenMap): ThemeExtend {
    const extend: ThemeExtend = {};

    for (const [path, value] of Object.entries(tokens)) {
        const segments = path.split('.');
        const topKey = segments[0];

        switch (topKey) {
            case 'colors':
                (extend.colors ??= {})[segments[1]] = value;
                break;
            case 'spacing':
                (extend.spacing ??= {})[segments[1]] = value;
                break;
            case 'shapes':
                (extend.borderRadius ??= {})[segments[1]] = value;
                break;
            case 'elevation':
                (extend.boxShadow ??= {})[segments[1]] = value;
                break;
            case 'typography': {
                if (segments.length < 3) {
                    break;
                }
                const styleName = segments[1];
                const property = segments[2];
                switch (property) {
                    case 'family':
                        (extend.fontFamily ??= {})[styleName] = value;
                        break;
                    case 'size':
                        (extend.fontSize ??= {})[styleName] = value;
                        break;
                    case 'weight':
                        (extend.fontWeight ??= {})[styleName] = value;
                        break;
                    case 'lineHeight':
                        (extend.lineHeight ??= {})[styleName] = value;
                        break;
                }
                break;
            }
            case 'components':
                // components.* tokens have no direct Tailwind equivalent.
                // Component compositions are defined in component CSS, not in theme.
                break;
        }
    }

    return extend;
}

/**
 * Serialises a `ThemeExtend` object to a JavaScript object literal string
 * with 2-space indentation (4 spaces inside `theme.extend`).
 */
function serializeThemeExtend(extend: ThemeExtend): string {
    const sectionEntries = Object.entries(extend) as Array<[string, Record<string, string>]>;
    if (sectionEntries.length === 0) {
        return '{}';
    }

    const sectionLines = sectionEntries.map(([section, values]) => {
        const innerLines = Object.entries(values)
            .map(([key, val]) => `        ${JSON.stringify(key)}: ${JSON.stringify(val)}`)
            .join(',\n');
        return `      ${section}: {\n${innerLines}\n      }`;
    });

    return `{\n${sectionLines.join(',\n')}\n    }`;
}
