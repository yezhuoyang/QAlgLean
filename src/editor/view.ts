import { escapeHtml } from '../preview/render';

export interface EditorOptions {
  source: string;
  version: number;
  nonce: string;
  cspSource: string;
  katexCssUri: string;
  styleUri: string;
  scriptUri: string;
  sourceName: string;
  recovered?: { source: string; base: string };
}

/** Only local assets run; document text is inert JSON, never executable HTML. */
export function renderEditor(options: EditorOptions): string {
  const bootstrap = JSON.stringify({ source: options.source, version: options.version, ...(options.recovered ? { recovered: options.recovered } : {}) })
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const csp = `default-src 'none'; img-src ${options.cspSource} data:; font-src ${options.cspSource}; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';`;
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <title>${escapeHtml(options.sourceName)}</title>
  <link rel="stylesheet" href="${escapeHtml(options.katexCssUri)}">
  <link rel="stylesheet" href="${escapeHtml(options.styleUri)}">
</head><body>
  <header class="editor-toolbar" aria-label="Editor options">
    <span class="filename">${escapeHtml(options.sourceName)}</span>
    <div class="mode-buttons" role="group" aria-label="Mathematical display">
      <button type="button" id="math-mode" aria-pressed="true" title="Typeset formulas; click a formula to edit its LaTeX">Math</button>
      <button type="button" id="source-mode" aria-pressed="false" title="Show editable LaTeX source">Source</button>
    </div>
    <button type="button" id="native-editor" title="Open this file in VS Code's standard text editor">Open Text Editor</button>
  </header>
  <aside id="conflict" hidden role="alert">
    <span>The file changed elsewhere. Your draft is preserved here.</span>
    <button type="button" id="copy-draft">Copy draft</button>
    <button type="button" id="use-file">Use file version</button>
    <button type="button" id="use-draft">Apply my draft</button>
  </aside>
  <main id="editor" aria-label="QParam mathematical source editor"></main>
  <div id="problems" hidden aria-label="Syntax problems"></div>
  <footer class="editor-status">
    <button type="button" id="syntax-status" aria-expanded="false">Checking syntax…</button>
    <span class="status-hint">Click a formula to edit · Esc to typeset · $ for notation</span>
    <span id="sync-status" role="status" aria-live="polite"></span>
    <span title="This frontend does not yet check mathematical truth or program correctness">Proof checking not connected</span>
  </footer>
  <script nonce="${escapeHtml(options.nonce)}" type="application/json" id="qparam-document">${bootstrap}</script>
  <script nonce="${escapeHtml(options.nonce)}" src="${escapeHtml(options.scriptUri)}"></script>
</body></html>`;
}
