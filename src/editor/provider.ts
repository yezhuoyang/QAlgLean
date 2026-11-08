import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { renderEditor } from './view';
import { documentLimit, EditResult, validateEdit } from './protocol';
import { escapeHtml } from '../preview/render';

interface RecoveryDraft { source: string; base: string }

/** VS Code owns the text, file lifecycle, dirty state, save and undo history. */
export class MathEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  static readonly viewType = 'qparam.mathEditor';
  private readonly editors = new Map<vscode.WebviewPanel, vscode.TextDocument>();
  private active: vscode.TextDocument | undefined;
  private readonly drafts = new Map<string, RecoveryDraft>();

  constructor(private readonly context: vscode.ExtensionContext, private readonly preview: (doc: vscode.TextDocument) => Promise<void>) {}

  get activeDocument() { return this.active; }
  get documents() { return [...this.editors.values()].map(doc => doc.uri.toString()); }

  private draftKey(document: vscode.TextDocument) { return `qparam.draft:${document.uri.toString()}`; }

  getRecoveryDraft(document: vscode.TextDocument): RecoveryDraft | undefined {
    const draft = this.drafts.get(this.draftKey(document)) ?? this.context.workspaceState.get<RecoveryDraft>(this.draftKey(document));
    return draft && typeof draft.source === 'string' && typeof draft.base === 'string' &&
      draft.source.length <= documentLimit && draft.base.length <= documentLimit && draft.source !== this.source(document) ? draft : undefined;
  }

  async preserveDraft(document: vscode.TextDocument, value: unknown) {
    if (!value || typeof value !== 'object' || document.uri.scheme === 'untitled') return;
    const draft = value as RecoveryDraft;
    if (typeof draft.source !== 'string' || typeof draft.base !== 'string' ||
        draft.source.length > documentLimit || draft.base.length > documentLimit) return;
    const key = this.draftKey(document);
    if (draft.source === this.source(document)) {
      this.drafts.delete(key);
      await this.context.workspaceState.update(key, undefined);
    } else {
      const saved = { source: draft.source, base: draft.base };
      this.drafts.set(key, saved);
      await this.context.workspaceState.update(key, saved);
    }
  }

  private async clearAppliedDraft(document: vscode.TextDocument) {
    const key = this.draftKey(document);
    const draft = this.drafts.get(key) ?? this.context.workspaceState.get<RecoveryDraft>(key);
    if (draft?.source === this.source(document)) {
      this.drafts.delete(key);
      await this.context.workspaceState.update(key, undefined);
    }
  }

  insertNotation(document: vscode.TextDocument, latex: string) {
    for (const [panel, doc] of this.editors) {
      if (doc === document && panel.visible) { void panel.webview.postMessage({ type: 'insert-notation', latex }); break; }
    }
  }

  async applyEdit(document: vscode.TextDocument, input: unknown): Promise<EditResult> {
    const source = this.source(document);
    const request = validateEdit(source, document.version, input);
    const rawId = (input as { requestId?: unknown } | null)?.requestId;
    const requestId = typeof rawId === 'number' && Number.isSafeInteger(rawId) ? rawId : -1;
    let accepted = false;
    let reason: string | undefined;
    if (request) {
      const edits = new vscode.WorkspaceEdit();
      const starts = [0];
      for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
      const position = (offset: number) => {
        let lo = 0; let hi = starts.length;
        while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (starts[mid] <= offset) lo = mid; else hi = mid; }
        return new vscode.Position(lo, offset - starts[lo]);
      };
      for (const change of request.changes) {
        edits.replace(document.uri, new vscode.Range(position(change.from), position(change.to)), change.text);
      }
      try { accepted = await vscode.workspace.applyEdit(edits); }
      catch { reason = 'VS Code could not apply this edit. Your draft is still in the editor.'; }
    } else reason = 'The file changed or this edit exceeds the supported bounds. Review your preserved draft.';
    if (accepted) await this.clearAppliedDraft(document);
    return { type: 'edit-result', requestId, accepted, source: this.source(document), version: document.version, reason };
  }

  private source(document: vscode.TextDocument) { return document.getText().replace(/\r\n/g, '\n'); }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    this.editors.set(panel, document);
    this.active = document;
    const webview = panel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    const asset = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', ...parts)).toString();
    const editorOptions = {
      source: this.source(document), version: document.version, sourceName: document.uri.path.split('/').pop() || 'Untitled.qp',
      nonce: randomBytes(18).toString('base64'), cspSource: webview.cspSource,
      katexCssUri: asset('katex', 'katex.min.css'), styleUri: asset('editor.css'), scriptUri: asset('editor.js'),
      recovered: this.getRecoveryDraft(document)
    };
    const tooLarge = editorOptions.source.length > documentLimit;
    webview.html = tooLarge ? `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${editorOptions.nonce}'"></head><body style="color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)"><p>${escapeHtml(editorOptions.sourceName)} exceeds the mathematical editor's 500,000-character limit.</p><button id="source">Open Text Editor</button><script nonce="${editorOptions.nonce}">const api=acquireVsCodeApi();document.getElementById('source').onclick=()=>api.postMessage({type:'source'});</script></body></html>` : renderEditor(editorOptions);
    const sync = () => webview.postMessage({ type: 'document', source: this.source(document), version: document.version });
    const disposables: vscode.Disposable[] = [];
    disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === document.uri.toString()) { void sync(); void this.clearAppliedDraft(document); }
    }));
    disposables.push(panel.onDidChangeViewState(event => {
      if (event.webviewPanel.active) this.active = document;
      else if (this.active === document) this.active = undefined;
    }));
    // Each view serializes its own writes. Version guards reject conflicting split-view edits.
    let queue = Promise.resolve();
    disposables.push(webview.onDidReceiveMessage((message: unknown) => {
      // Save recoverable text immediately, including typing queued behind an in-flight edit.
      if (message && typeof message === 'object' && (message as { type?: string }).type === 'draft') {
        void this.preserveDraft(document, message).catch(() => { /* The live document still uses normal VS Code persistence. */ });
        return;
      }
      queue = queue.then(async () => {
        if (!message || typeof message !== 'object') return;
        const m = message as { type?: string; text?: unknown };
        if (m.type === 'ready') await sync();
        else if (m.type === 'edit') await webview.postMessage(await this.applyEdit(document, message));
        else if (m.type === 'save') await document.save();
        else if (m.type === 'source') await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
        else if (m.type === 'preview') await this.preview(document);
        // Recovery copying must also work for a paste larger than the editing limit.
        else if (m.type === 'copy' && typeof m.text === 'string') await vscode.env.clipboard.writeText(m.text);
        else if ((m.type === 'undo' || m.type === 'redo') && panel.active) {
          await vscode.commands.executeCommand(m.type);
          await sync();
        }
      }).catch(async () => { await sync(); });
    }));
    panel.onDidDispose(() => {
      disposables.forEach(disposable => disposable.dispose());
      this.editors.delete(panel);
      if (this.active === document) this.active = undefined;
    });
  }

  dispose() { for (const panel of this.editors.keys()) panel.dispose(); this.editors.clear(); }
}
