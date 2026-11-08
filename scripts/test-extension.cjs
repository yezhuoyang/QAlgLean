/* Run real VS Code extension-host checks in an isolated profile. */
const { runTests } = require('@vscode/test-electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const local = process.env.VSCODE_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Microsoft VS Code/Code.exe' : '');
const options = {
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, 'test/extension-host.cjs'),
  launchArgs: [root, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-extensions',
    '--user-data-dir=' + path.join(root, '.vscode-test/user-data'),
    '--extensions-dir=' + path.join(root, '.vscode-test/extensions')]
};
if (local && fs.existsSync(local)) options.vscodeExecutablePath = local;
runTests(options).catch(error => { console.error(error); process.exitCode = 1; });
