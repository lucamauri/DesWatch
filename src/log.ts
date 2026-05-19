/**
 * Lazy-initialised DesWatch output channel.
 *
 * Import `log()` anywhere in the extension to write to the "DesWatch" panel
 * in the VS Code Output view. The channel is created on first use and
 * disposed when the extension deactivates via `disposeLog()`.
 */
import * as vscode from 'vscode';

let _channel: vscode.OutputChannel | undefined;

/** Returns the shared output channel, creating it if necessary. */
function channel(): vscode.OutputChannel {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel('DesWatch');
    }
    return _channel;
}

/**
 * Appends a timestamped line to the DesWatch output channel.
 * @param message Human-readable description of what happened or went wrong.
 */
export function log(message: string): void {
    channel().appendLine(`[DesWatch ${new Date().toISOString()}] ${message}`);
}

/**
 * Disposes the output channel. Called from `extension.deactivate()`.
 * Safe to call multiple times.
 */
export function disposeLog(): void {
    _channel?.dispose();
    _channel = undefined;
}
