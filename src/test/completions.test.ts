/**
 * Integration tests for the completion item provider.
 *
 * These tests run inside the VS Code extension host because
 * `CompletionItemProvider` depends on `vscode.TextDocument` and the extension
 * must be active for its providers to be registered.
 *
 * Completions are exercised via `vscode.executeCompletionItemProvider` so the
 * full registration → dispatch → response chain is tested.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

/** Wait for `ms` milliseconds (used to let the extension host settle). */
function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

suite('Completions provider', function () {
    this.timeout(15000);

    suiteSetup(async () => {
        // Opening a design-md document triggers the onLanguage:design-md activation
        // event, which causes the extension to register all its providers.
        const doc = await vscode.workspace.openTextDocument({
            language: 'design-md',
            content: '---\ncolors:\n  primary: "#B8422E"\n---\n## Overview\n',
        });
        await vscode.window.showTextDocument(doc);
        // Allow the extension host time to finish registering providers.
        await wait(500);
    });

    test('indent-0 in front matter offers all six top-level keys', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'design-md',
            // Line 1 (index 1) is empty inside the front matter at indent 0.
            content: '---\n\n---\n## Overview\n',
        });
        await vscode.window.showTextDocument(doc);

        const position = new vscode.Position(1, 0);
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position
        );

        const labels = result.items.map(i =>
            typeof i.label === 'string' ? i.label : i.label.label
        );
        for (const key of ['colors', 'typography', 'spacing', 'elevation', 'shapes', 'components']) {
            assert.ok(labels.includes(key), `expected "${key}" in completions`);
        }
    });

    test('indented under typography: offers sub-keys (family, size, weight, lineHeight)', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'design-md',
            content: '---\ntypography:\n  \n---\n## Overview\n',
        });
        await vscode.window.showTextDocument(doc);

        // Line 2, col 2 — indented under `typography:`.
        const position = new vscode.Position(2, 2);
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position
        );

        const labels = result.items.map(i =>
            typeof i.label === 'string' ? i.label : i.label.label
        );
        for (const key of ['family', 'size', 'weight', 'lineHeight']) {
            assert.ok(labels.includes(key), `expected sub-key "${key}" under typography`);
        }
    });

    test('indented under colors: offers inline entry template (not sub-keys)', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'design-md',
            content: '---\ncolors:\n  \n---\n## Overview\n',
        });
        await vscode.window.showTextDocument(doc);

        const position = new vscode.Position(2, 2);
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position
        );

        const labels = result.items.map(i =>
            typeof i.label === 'string' ? i.label : i.label.label
        );
        assert.ok(labels.includes('new color token'), 'expected inline entry template for colors');
        // colors does not have fixed sub-keys like typography.
        assert.ok(!labels.includes('family'), '"family" should not appear under colors');
    });

    test('Region B: hex completions offered on colors.* value line starting with #', async () => {
        const content = '---\ncolors:\n  primary: "#"\n---\n## Overview\n';
        const doc = await vscode.workspace.openTextDocument({ language: 'design-md', content });
        await vscode.window.showTextDocument(doc);

        // Position after the `#` on line 2: `  primary: "#"` — char 13.
        const position = new vscode.Position(2, 13);
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position,
            '#'
        );

        assert.ok(result.items.length > 0, 'expected hex palette completions on colors.* line');
        const allAreColors = result.items.every(
            i => i.kind === vscode.CompletionItemKind.Color
        );
        assert.ok(allAreColors, 'all Region B items should be Color kind');
    });

    test('Region B: hex completions suppressed on spacing.* value line', async () => {
        // spacing.* has type 'dimension' — hex completions must not appear there.
        const content = '---\nspacing:\n  base: "#"\n---\n## Overview\n';
        const doc = await vscode.workspace.openTextDocument({ language: 'design-md', content });
        await vscode.window.showTextDocument(doc);

        const position = new vscode.Position(2, 11);
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position,
            '#'
        );

        const colorItems = result.items.filter(
            i => i.kind === vscode.CompletionItemKind.Color
        );
        assert.strictEqual(colorItems.length, 0, 'no Color completions expected for spacing.* values');
    });
});
