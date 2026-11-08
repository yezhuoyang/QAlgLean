import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { parseDocument, QDocument } from './language/document';
import { renderDocument } from './preview/render';
import { insideMath, notations } from './editor/notation';
import { exportLatex, importLatex } from './editor/latex';
import { MathEditorProvider, readDocumentProject } from './editor/provider';
import { documentLimit } from './editor/protocol';

/** The extension provides syntax services and a paper view, never a proof verdict. */
export function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('qparam');
  const selector: vscode.DocumentSelector = [{ language: 'qparam' }];
  let panel: vscode.WebviewPanel | undefined;
  let previewDocument: vscode.TextDocument | undefined;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const dependencies = new Map<string, Set<string>>();
  const mathEditors = new MathEditorProvider(context, doc => openPreview(doc));
  context.subscriptions.push(mathEditors, vscode.window.registerCustomEditorProvider(MathEditorProvider.viewType, mathEditors, {
    webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false
  }));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
  status.command = 'qparam.openPreview';
  status.tooltip = 'Open the paper preview. This release checks syntax, not proofs.';
  context.subscriptions.push(diagnostics, status, { dispose() { timers.forEach(clearTimeout); panel?.dispose(); } });

  function parse(doc: vscode.TextDocument): QDocument {
    if (doc.getText().length > documentLimit) {
      return { name: 'Document', title: 'Document size limit', description: '', sections: [], program: { algorithms: [], oracles: [], classicals: [] }, diagnostics: [
        { line: 0, column: 0, length: 1, severity: 'error', message: `The interactive frontend supports documents up to ${documentLimit.toLocaleString('en-US')} characters.` }
      ] };
    }
    const result = readDocumentProject(doc);
    dependencies.set(doc.uri.toString(), new Set(result.dependencies));
    return result.document;
  }

  function update(doc: vscode.TextDocument) {
    if (doc.languageId !== 'qparam') return;
    const parsed = parse(doc);
    diagnostics.set(doc.uri, parsed.diagnostics.map(d => {
      const line = Math.min(Math.max(0, d.line), doc.lineCount - 1);
      const start = Math.min(d.column, doc.lineAt(line).text.length);
      const range = new vscode.Range(line, start, line, Math.min(start + Math.max(1, d.length), doc.lineAt(line).text.length));
      const result = new vscode.Diagnostic(range, d.message, d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
      result.source = 'QParam syntax';
      return result;
    }));
    if (vscode.window.activeTextEditor?.document === doc) {
      const errors = parsed.diagnostics.filter(d => d.severity === 'error').length;
      status.text = errors ? `$(symbol-operator) QParam · ${errors} syntax ${errors === 1 ? 'issue' : 'issues'}` : '$(symbol-operator) QParam · Paper preview';
      status.show();
    }
    if (panel && previewDocument?.uri.toString() === doc.uri.toString()) {
      const asset = (...parts: string[]) => panel!.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', ...parts)).toString();
      panel.title = `QParam · ${parsed.title || parsed.name}`;
      panel.webview.html = renderDocument(parsed, {
        katexCssUri: asset('katex', 'katex.min.css'), styleUri: asset('preview.css'), scriptUri: asset('preview.js'),
        cspSource: panel.webview.cspSource, nonce: randomBytes(18).toString('base64'), sourceName: doc.uri.path.split('/').pop() || 'Untitled.qp'
      });
    }
  }

  async function openPreview(doc?: vscode.TextDocument) {
    const source = doc || mathEditors.activeDocument || vscode.window.activeTextEditor?.document || previewDocument;
    if (!source || source.languageId !== 'qparam') {
      await vscode.window.showInformationMessage('Open a .qp document, or use QParam: Open an Example.');
      return;
    }
    previewDocument = source;
    if (!panel) {
      panel = vscode.window.createWebviewPanel('qparam.paper', 'QParam', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
        enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')], retainContextWhenHidden: true
      });
      panel.onDidDispose(() => { panel = undefined; previewDocument = undefined; }, undefined, context.subscriptions);
      panel.webview.onDidReceiveMessage(async (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const m = message as { type?: string; line?: unknown; text?: unknown };
        if (m.type === 'reveal' && previewDocument && typeof m.line === 'number' && Number.isInteger(m.line) && m.line >= 0 && m.line < previewDocument.lineCount) {
          const editor = await vscode.window.showTextDocument(previewDocument, vscode.ViewColumn.One);
          const range = new vscode.Range(m.line, 0, m.line, 0);
          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } else if (m.type === 'copy' && typeof m.text === 'string' && m.text.length <= 100_000) {
          try {
            await vscode.env.clipboard.writeText(m.text);
            await panel?.webview.postMessage({ type: 'copied' });
          } catch { await panel?.webview.postMessage({ type: 'copy-error' }); }
        }
      }, undefined, context.subscriptions);
    } else panel.reveal(vscode.ViewColumn.Beside, true);
    update(source);
  }

  async function getExamples() {
    const result: (vscode.QuickPickItem & { file: string; hasImports: boolean })[] = [];
    async function visit(relative: string) {
      const directory = vscode.Uri.joinPath(context.extensionUri, 'examples', relative);
      for (const [name, kind] of await vscode.workspace.fs.readDirectory(directory)) {
        const file = relative ? relative + '/' + name : name;
        if (kind === vscode.FileType.Directory) await visit(file);
        else if (kind === vscode.FileType.File && name.endsWith('.qp')) {
          const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, name)));
          const doc = parseDocument(content);
          result.push({ label: doc.title || doc.name, description: file, detail: doc.description, file, hasImports: !!doc.imports?.length });
        }
      }
    }
    await visit('');
    return result.sort((a, b) => a.file.localeCompare(b.file));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('qparam.openMathEditor', async () => {
      const doc = mathEditors.activeDocument || vscode.window.activeTextEditor?.document;
      if (doc?.languageId === 'qparam') await vscode.commands.executeCommand('vscode.openWith', doc.uri, MathEditorProvider.viewType);
    }),
    vscode.commands.registerCommand('qparam.openPreview', () => openPreview()),
    vscode.commands.registerCommand('qparam.openExample', async () => {
      const selected = await vscode.window.showQuickPick(await getExamples(), {
        title: 'QParam examples and literature corpus', matchOnDescription: true, matchOnDetail: true
      });
      if (!selected) return;
      const uri = vscode.Uri.joinPath(context.extensionUri, 'examples', selected.file);
      const doc = selected.hasImports ? await vscode.workspace.openTextDocument(uri)
        : await vscode.workspace.openTextDocument({ language: 'qparam', content: new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)) });
      await vscode.commands.executeCommand('vscode.openWith', doc.uri, MathEditorProvider.viewType);
    }),
    vscode.commands.registerCommand('qparam.insertMath', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!mathEditors.activeDocument && editor?.document.languageId !== 'qparam') return;
      const mathDocument = mathEditors.activeDocument;
      const chosen = await vscode.window.showQuickPick(notations.map(n => ({ label: n.label, description: n.detail, notation: n })), { title: 'Insert mathematical notation' });
      if (!chosen) return;
      if (mathDocument) { mathEditors.insertNotation(mathDocument, chosen.notation.latex); return; }
      if (!editor) return;
      const prefix = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.active));
      const body = insideMath(prefix) ? chosen.notation.latex : `\\$${chosen.notation.latex}\\$`;
      await editor.insertSnippet(new vscode.SnippetString(body));
    }),
    vscode.commands.registerCommand('qparam.exportLatex', async () => {
      const doc = mathEditors.activeDocument || (vscode.window.activeTextEditor?.document.languageId === 'qparam' ? vscode.window.activeTextEditor.document : previewDocument);
      if (!doc) { await vscode.window.showInformationMessage('Open a QParam document to export.'); return; }
      try {
        const parsed = parse(doc);
        const content = exportLatex(parsed);
        const uri = await vscode.window.showSaveDialog({ filters: { LaTeX: ['tex'] }, saveLabel: 'Export paper' });
        if (uri) await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
      } catch (error) { await vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to export this document.'); }
    }),
    vscode.commands.registerCommand('qparam.importLatex', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      try {
        const content = importLatex(editor.document.getText());
        const doc = await vscode.workspace.openTextDocument({ language: 'qparam', content });
        await vscode.commands.executeCommand('vscode.openWith', doc.uri, MathEditorProvider.viewType);
      } catch (error) { await vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to import this document.'); }
    }),
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId !== 'qparam') return;
      const key = event.document.uri.toString();
      const previous = timers.get(key);
      if (previous) clearTimeout(previous);
      const delay = vscode.workspace.getConfiguration('qparam').get<number>('preview.updateDelay', 180);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        // An unsaved library edit changes every open importing document's interface.
        const changed = event.document.uri.toString();
        vscode.workspace.textDocuments.filter(doc => doc.uri.toString() === changed || dependencies.get(doc.uri.toString())?.has(changed)).forEach(update);
      }, delay));
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnostics.delete(doc.uri);
      const timer = timers.get(doc.uri.toString());
      if (timer) clearTimeout(timer);
      timers.delete(doc.uri.toString());
      dependencies.delete(doc.uri.toString());
      vscode.workspace.textDocuments.filter(open => dependencies.get(open.uri.toString())?.has(doc.uri.toString())).forEach(update);
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.languageId === 'qparam') {
        if (panel) previewDocument = editor.document;
        update(editor.document);
      } else if (editor) status.hide();
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(doc, position) {
        const prefix = doc.getText(new vscode.Range(new vscode.Position(0, 0), position));
        const match = prefix.match(/([$\\])([a-zA-Z]*)$/);
        if (!match) return [];
        const before = prefix.slice(0, -match[0].length);
        if (match[1] === '$' && insideMath(before)) return [];
        const wholeSpan = !insideMath(before);
        const followingDollar = wholeSpan && doc.lineAt(position.line).text[position.character] === '$';
        const range = new vscode.Range(position.translate(0, -match[0].length), position.translate(0, followingDollar ? 1 : 0));
        return notations.map((n, index) => {
          const item = new vscode.CompletionItem(`${match[1]}${n.name}`, vscode.CompletionItemKind.Snippet);
          item.detail = n.label;
          item.documentation = n.detail;
          item.insertText = new vscode.SnippetString(wholeSpan ? `\\$${n.latex}\\$` : n.latex);
          item.range = range;
          item.sortText = index.toString().padStart(2, '0');
          return item;
        });
      }
    }, '$', '\\'),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(doc) {
        return parse(doc).sections.map(section => {
          const start = new vscode.Position(section.line, 0);
          const end = doc.lineAt(Math.min(section.endLine, doc.lineCount - 1)).range.end;
          return new vscode.DocumentSymbol(section.name, section.kind, section.kind === 'algorithm' ? vscode.SymbolKind.Function : vscode.SymbolKind.Variable, new vscode.Range(start, end), new vscode.Range(start, start));
        });
      }
    }),
    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges(doc) {
        return parse(doc).sections.filter(s => s.endLine > s.line).map(s => new vscode.FoldingRange(s.line, s.endLine));
      }
    }),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, position) {
        const section = parse(doc).sections.find(s => position.line >= s.line && position.line <= s.endLine);
        if (!section) return;
        const contents = new vscode.MarkdownString();
        contents.appendText(`${section.kind}: ${section.name}\n\n`);
        contents.appendText(section.kind === 'assumption' ? 'An explicit mathematical premise. This frontend does not discharge it.' : 'QParam mathematical source. Syntax parsing does not establish correctness.');
        return new vscode.Hover(contents);
      }
    })
  );
  const sourceWatcher = vscode.workspace.createFileSystemWatcher('**/*.qp');
  const refreshImports = (uri: vscode.Uri) => {
    vscode.workspace.textDocuments.filter(doc => dependencies.get(doc.uri.toString())?.has(uri.toString())).forEach(update);
  };
  context.subscriptions.push(sourceWatcher, sourceWatcher.onDidChange(refreshImports), sourceWatcher.onDidCreate(refreshImports), sourceWatcher.onDidDelete(refreshImports));
  vscode.workspace.textDocuments.forEach(update);
  // A small inspection surface for extension-host integration tests; no proof engine is implied.
  return { parseDocument, parseTextDocument: parse, getEditorProject: (doc: vscode.TextDocument) => readDocumentProject(doc).project, diagnostics, getExamples, getPreviewDocument: () => previewDocument?.uri.toString(),
    getMathEditorDocuments: () => mathEditors.documents,
    preserveMathDraft: (doc: vscode.TextDocument, value: unknown) => mathEditors.preserveDraft(doc, value),
    getMathDraft: (doc: vscode.TextDocument) => mathEditors.getRecoveryDraft(doc),
    applyMathEdit: (doc: vscode.TextDocument, input: unknown) => mathEditors.applyEdit(doc, input) };
}
