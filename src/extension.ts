import * as vscode from 'vscode';
import { DesignMdColorProvider } from './colorDecorations.js';
import { registerCompletionProvider } from './completionProvider.js';
import { registerDefinitionProvider } from './definitionProvider.js';
import { registerDiagnostics } from './diagnostics.js';
import { registerCssExportCommand } from './exporters/cssExporter.js';
import { registerTailwindExportCommand } from './exporters/tailwindExporter.js';
import { registerHoverProvider } from './hoverProvider.js';
import { disposeLog } from './log.js';
import { registerPreviewPanel } from './previewPanel.js';
import { clearCache } from './tokenCache.js';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerColorProvider(
            { language: 'design-md' },
            new DesignMdColorProvider()
        )
    );

    registerDiagnostics(context);
    registerCssExportCommand(context);
    registerTailwindExportCommand(context);
    registerHoverProvider(context);
    registerCompletionProvider(context);
    registerDefinitionProvider(context);
    registerPreviewPanel(context);
}

export function deactivate(): void {
    clearCache();
    disposeLog();
}
