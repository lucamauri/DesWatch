/**
 * Integration tests for the go-to-definition provider.
 *
 * These tests run inside the VS Code extension host. Definitions are resolved
 * via `vscode.executeDefinitionProvider` so the full registration → dispatch →
 * response chain is tested, matching real-world F12 / Ctrl+Click usage.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

/** Wait for `ms` milliseconds (used to let the extension host settle). */
function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Opens an untitled design-md document, shows it, and waits briefly for
 * providers to be ready.
 */
async function openDoc(content: string): Promise<vscode.TextDocument> {
    const doc = await vscode.workspace.openTextDocument({
        language: 'design-md',
        content,
    });
    await vscode.window.showTextDocument(doc);
    await wait(200);
    return doc;
}

suite('Definition provider', function () {
    this.timeout(15000);

    suiteSetup(async () => {
        // Trigger extension activation via a design-md document.
        const doc = await vscode.workspace.openTextDocument({
            language: 'design-md',
            content: '---\ncolors:\n  primary: "#B8422E"\n---\n## Overview\n',
        });
        await vscode.window.showTextDocument(doc);
        await wait(500);
    });

    test('unique leaf name returns a single-element Location[]', async () => {
        const content =
            '---\ncolors:\n  primary: "#B8422E"\n---\n\n## Overview\n\nUse the `primary` color.\n';
        const doc = await openDoc(content);

        // `primary` appears on line 7 (0-based) in the body. Find its column.
        const bodyLine = doc.lineAt(7).text; // "Use the `primary` color."
        const col = bodyLine.indexOf('primary');
        assert.ok(col >= 0, 'test fixture must contain "primary" in the body');

        const locs = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            doc.uri,
            new vscode.Position(7, col + 2) // somewhere inside the word
        );

        assert.ok(Array.isArray(locs) && locs.length > 0, 'expected at least one definition location');
        assert.strictEqual(locs.length, 1, 'unique leaf should produce exactly one location');
        // The definition must point back into the same document's front matter.
        assert.strictEqual(locs[0].uri.toString(), doc.uri.toString());
        // `primary` is defined on document line 2 (0-based).
        assert.strictEqual(locs[0].range.start.line, 2);
    });

    test('ambiguous leaf name returns a Location[] with two entries', async () => {
        // Both colors.primary and spacing.primary share the leaf name "primary".
        const content =
            '---\ncolors:\n  primary: "#B8422E"\nspacing:\n  primary: 8px\n---\n\n## Overview\n\nThe `primary` token.\n';
        const doc = await openDoc(content);

        const bodyLine = doc.lineAt(9).text; // "The `primary` token."
        const col = bodyLine.indexOf('primary');
        assert.ok(col >= 0);

        const locs = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            doc.uri,
            new vscode.Position(9, col + 2)
        );

        assert.ok(Array.isArray(locs), 'expected a Location array');
        assert.ok(locs.length >= 2, `expected 2+ locations for ambiguous leaf, got ${locs.length}`);
    });

    test('leaf name not present in front matter returns no locations', async () => {
        const content =
            '---\ncolors:\n  primary: "#B8422E"\n---\n\n## Overview\n\nSee the `nonexistent` token.\n';
        const doc = await openDoc(content);

        const bodyLine = doc.lineAt(7).text;
        const col = bodyLine.indexOf('nonexistent');
        assert.ok(col >= 0);

        const locs = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            doc.uri,
            new vscode.Position(7, col + 2)
        );

        // VS Code normalises `undefined` returns to an empty array in executeCommand.
        const isEmpty = !locs || locs.length === 0;
        assert.ok(isEmpty, 'unknown token name should produce no definition locations');
    });
});
