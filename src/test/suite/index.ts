/**
 * Mocha test suite runner.
 *
 * This module is loaded by `@vscode/test-electron` inside the VS Code
 * extension host. It discovers all `*.test.js` files in the parent directory
 * (`out/test/`) and runs them with Mocha's TDD interface.
 *
 * Note: `suite()` and `test()` are Mocha TDD globals injected by the test
 * harness — they do not need to be imported.
 */
import Mocha from 'mocha';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Called by `@vscode/test-electron` after the extension is activated.
 * Must return a promise that resolves when all tests have finished.
 */
export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10_000 });

    // Test files live one level up from this suite directory (in `out/test/`).
    const testsRoot = path.resolve(__dirname, '..');

    const testFiles = fs
        .readdirSync(testsRoot)
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.resolve(testsRoot, f));

    testFiles.forEach(f => mocha.addFile(f));

    return new Promise<void>((resolve, reject) => {
        mocha.run(failures => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}
