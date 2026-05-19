/**
 * Test runner entry point for `@vscode/test-electron`.
 *
 * This script is compiled to `out/test/runTest.js` and executed with plain
 * Node.js (`node out/test/runTest.js`). It downloads a VS Code instance
 * (cached in `.vscode-test/`), opens the extension under test, and hands
 * control to the Mocha suite defined in `out/test/suite/index.js`.
 *
 * Note: the first run downloads the VS Code binary (~200 MB). Subsequent
 * runs reuse the cache. Running without a display server on headless Linux
 * requires `Xvfb`; on Windows and macOS no extra setup is needed.
 */
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    // The extension root — where `package.json` lives.
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The compiled test suite runner (Mocha entry point).
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({ extensionDevelopmentPath, extensionTestsPath });
}

main().catch(err => {
    console.error('Failed to run tests:', err);
    process.exit(1);
});
