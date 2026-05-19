import * as vscode from 'vscode';
import { DesignMdColorProvider } from './colorDecorations.js';
import { registerCompletionProvider } from './completionProvider.js';
import { registerDiagnostics } from './diagnostics.js';
import { registerHoverProvider } from './hoverProvider.js';
import { disposeLog } from './log.js';
import { clearCache } from './tokenCache.js';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerColorProvider(
            { language: 'design-md' },
            new DesignMdColorProvider()
        )
    );

    registerDiagnostics(context);
    registerHoverProvider(context);
    registerCompletionProvider(context);
}

export function deactivate(): void {
    clearCache();
    disposeLog();
}
