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

  // Opening an actual .qp file chooses the mathematical editor automatically.
  const fixture = vscode.Uri.joinPath(extension.extensionUri, '.vscode-test/math-editor.qp');
  const original = 'qparam InlineMath\r\nstate psi := $\\ket{0}$\r\n';
  await vscode.workspace.fs.writeFile(fixture, Buffer.from(original));
  await vscode.commands.executeCommand('vscode.open', fixture);
  await waitFor(() => api.getMathEditorDocuments().includes(fixture.toString()), 'default mathematical editor');
  const mathDoc = await vscode.workspace.openTextDocument(fixture);
  const version = mathDoc.version;
  const source = mathDoc.getText().replace(/\r\n/g, '\n');
  const offset = source.indexOf('{0}') + 1;
  const request = { type: 'edit', requestId: 1, version, changes: [{ from: offset, to: offset + 1, text: '1' }] };
  await api.preserveMathDraft(mathDoc, { source: source.replace('{0}', '{1}'), base: source });
  assert.equal(api.getMathDraft(mathDoc).source, source.replace('{0}', '{1}'), 'queued typing has a recovery draft');
  const result = await api.applyMathEdit(mathDoc, request);
  assert.equal(result.accepted, true, 'webview edits apply to the real TextDocument');
  assert.equal(api.getMathDraft(mathDoc), undefined, 'applied drafts retire automatically');
  assert.equal(mathDoc.getText(), original.replace('{0}', '{1}'), 'LF wire offsets preserve a CRLF file');
  assert.equal(mathDoc.isDirty, true, 'normal VS Code dirty state');
  assert.equal((await api.applyMathEdit(mathDoc, request)).accepted, false, 'stale edit rejected');
  await mathDoc.save();
  assert.equal(Buffer.from(await vscode.workspace.fs.readFile(fixture)).toString('utf8'), original.replace('{0}', '{1}'));
  await vscode.commands.executeCommand('undo');
  await waitFor(() => mathDoc.getText() === original, 'VS Code undo restores LaTeX source');
  await vscode.commands.executeCommand('redo');
  await waitFor(() => mathDoc.getText().includes('{1}'), 'VS Code redo restores edit');
  await mathDoc.save();
  await vscode.commands.executeCommand('vscode.openWith', fixture, 'default');
  await waitFor(() => vscode.window.activeTextEditor?.document.uri.toString() === fixture.toString(), 'ordinary source editor');
  assert.ok(vscode.window.activeTextEditor.document.getText().includes('$\\ket{1}$'), 'source and mathematical views share text');
  console.log('QPARAM_EXTENSION_TESTS_PASSED');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
};
