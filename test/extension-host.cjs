/* Exercise the real editor registration, snippets, diagnostics, symbols, and preview. */
const assert = require('node:assert/strict');
const vscode = require('vscode');
const waitFor = async (predicate, label) => {
  for (let i = 0; i < 60; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
};
exports.run = async () => {
  const extension = vscode.extensions.getExtension('yezhuoyang.qparam-studio');
  assert.ok(extension, 'extension discovered');
  const api = await extension.activate();
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, 'examples/bell.qp'));
  const document = await vscode.workspace.openTextDocument({ language: 'qparam', content: Buffer.from(bytes).toString('utf8') });
  const editor = await vscode.window.showTextDocument(document);
  await waitFor(() => api.diagnostics.get(document.uri) !== undefined, 'initial syntax diagnostics');
  assert.equal(api.diagnostics.get(document.uri).filter(d => d.severity === 0).length, 0);
  const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
  assert.ok(symbols.some(s => s.name === 'bell'), 'algorithm in document outline');
  await vscode.commands.executeCommand('qparam.openPreview');
  assert.equal(api.getPreviewDocument(), document.uri.toString());
  await editor.edit(edit => edit.insert(new vscode.Position(document.lineCount, 0), '\nthis_is_not_qparam\n'));
  await waitFor(() => (api.diagnostics.get(document.uri) || []).some(d => d.severity === 0), 'live invalid syntax');
  const completionDoc = await vscode.workspace.openTextDocument({ language: 'qparam', content: 'qparam Completion\nstate psi := $sum' });
  const completionEditor = await vscode.window.showTextDocument(completionDoc);
  const cursor = completionDoc.lineAt(1).range.end;
  const completions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', completionDoc.uri, cursor);
  const sum = completions.items.find(item => item.label === '$sum');
  assert.ok(sum, '$sum completion');
  await completionEditor.insertSnippet(sum.insertText, sum.range);
  assert.ok(completionDoc.getText().includes('$\\sum_'), 'completion retains literal math delimiter and LaTeX');
  assert.ok(completionDoc.getText().endsWith('$'), 'completion balances math delimiter');
  assert.equal(api.parseDocument(completionDoc.getText()).diagnostics.length, 0, 'inserted sum parses');
  console.log('QPARAM_EXTENSION_TESTS_PASSED');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
};
