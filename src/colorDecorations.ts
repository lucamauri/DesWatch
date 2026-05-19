import * as vscode from 'vscode';

const HEX_COLOR_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

function frontMatterEndLine(document: vscode.TextDocument): number {
    if (document.lineCount === 0 || document.lineAt(0).text.trim() !== '---') {
        return -1;
    }
    for (let i = 1; i < document.lineCount; i++) {
        if (document.lineAt(i).text.trim() === '---') {
            return i;
        }
    }
    return -1;
}

function hexToColor(hex: string): vscode.Color {
    if (hex.length === 3) {
        return new vscode.Color(
            parseInt(hex[0] + hex[0], 16) / 255,
            parseInt(hex[1] + hex[1], 16) / 255,
            parseInt(hex[2] + hex[2], 16) / 255,
            1
        );
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
    return new vscode.Color(r, g, b, a);
}

export class DesignMdColorProvider implements vscode.DocumentColorProvider {
    provideDocumentColors(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ColorInformation[] {
        const fmEnd = frontMatterEndLine(document);

        // Fence lines (opening `---` at 0 and closing `---` at fmEnd) never
        // contain hex values — skip them. Scan all other lines: front matter
        // content (1…fmEnd-1) and the full Markdown body (fmEnd+1…end).
        const fenceLines = new Set<number>([0]);
        if (fmEnd !== -1) {
            fenceLines.add(fmEnd);
        }

        const colors: vscode.ColorInformation[] = [];

        for (let lineIdx = 0; lineIdx < document.lineCount; lineIdx++) {
            if (fenceLines.has(lineIdx)) {
                continue;
            }
            const lineText = document.lineAt(lineIdx).text;
            HEX_COLOR_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = HEX_COLOR_RE.exec(lineText)) !== null) {
                const range = new vscode.Range(
                    new vscode.Position(lineIdx, match.index),
                    new vscode.Position(lineIdx, match.index + match[0].length)
                );
                colors.push(new vscode.ColorInformation(range, hexToColor(match[1])));
            }
        }

        return colors;
    }

    provideColorPresentations(
        color: vscode.Color,
        _context: { readonly document: vscode.TextDocument; readonly range: vscode.Range },
        _token: vscode.CancellationToken
    ): vscode.ColorPresentation[] {
        const r = Math.round(color.red * 255).toString(16).padStart(2, '0');
        const g = Math.round(color.green * 255).toString(16).padStart(2, '0');
        const b = Math.round(color.blue * 255).toString(16).padStart(2, '0');
        if (color.alpha < 1) {
            const a = Math.round(color.alpha * 255).toString(16).padStart(2, '0');
            return [new vscode.ColorPresentation(`#${r}${g}${b}${a}`)];
        }
        return [new vscode.ColorPresentation(`#${r}${g}${b}`)];
    }
}
