import { Annotation, EditorSelection, EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection, WidgetType } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, CompletionContext, completionKeymap, snippet, snippetCompletion } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { search, searchKeymap } from '@codemirror/search';
import { renderMath } from '../preview/render';
import { parseDocument } from '../language/document';
import { insideMath, notations } from './notation';
import { difference, MathSpan, mathSpans, mergeUnrelated } from './spans';
import { codeMirrorSnippet } from './snippets';

declare function acquireVsCodeApi(): { postMessage(value: unknown): void; getState(): { raw?: boolean } | undefined; setState(state: unknown): void };
const host = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const initial = JSON.parse(document.getElementById('qparam-document')!.textContent!) as { source: string; version: number; recovered?: { source: string; base: string } };
const rawMode = StateEffect.define<boolean>();
const fromHost = Annotation.define<boolean>();
const forceRender = StateEffect.define<boolean>();
const rawField = StateField.define({
  create: () => host?.getState()?.raw ?? false,
  update: (value, transaction) => transaction.effects.reduce((current, effect) => effect.is(rawMode) ? effect.value : current, value),
});
const renderedSelection = StateField.define({
  create: () => false,
  update: (value, transaction) => {
    if (transaction.effects.some(effect => effect.is(forceRender))) return true;
    return transaction.selection || transaction.docChanged ? false : value;
  },
});

class Formula extends WidgetType {
  constructor(readonly span: MathSpan) { super(); }
  eq(other: Formula): boolean { return this.span.latex === other.span.latex; }
  toDOM(view: EditorView): HTMLElement {
    const element = document.createElement('span');
    element.className = 'qp-math';
    element.contentEditable = 'false';
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `Edit formula: ${this.span.latex}`);
    element.title = 'Click to edit LaTeX';
    element.innerHTML = renderMath(this.span.latex, true);
    const edit = () => {
      // Widgets can survive edits before them; resolve the current source offset.
      view.dispatch({ selection: EditorSelection.cursor(view.posAtDOM(element) + 1), scrollIntoView: true });
      view.focus();
    };
    element.addEventListener('mousedown', event => { event.preventDefault(); edit(); });
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit(); }
    });
    return element;
  }
  ignoreEvent(): boolean { return true; }
}

function typeset(state: EditorState): DecorationSet {
  if (state.field(rawField)) return Decoration.none;
  const revealSelected = !state.field(renderedSelection);
  const ranges = mathSpans(state.doc.toString()).flatMap(span => {
    const selected = revealSelected && state.selection.ranges.some(range => range.empty
      ? range.from > span.from && range.from < span.to
      : range.from < span.to && range.to > span.from);
    return selected ? [] : [Decoration.replace({ widget: new Formula(span) }).range(span.from, span.to)];
  });
  return Decoration.set(ranges, true);
}
const formulas = StateField.define<DecorationSet>({
  create: typeset,
  update: (value, transaction) => transaction.docChanged || transaction.selection || transaction.effects.length ? typeset(transaction.state) : value,
  provide: field => EditorView.decorations.from(field),
});

const keywords = new Set('qparam title description parameter assume state oracle classical algorithm spec proof requires ensures costs probability goal admit by lean repeat in measure call controlled adjoint let var set if else while return allocate discard assert invariant'.split(' '));
const types = new Set('Qubit Nat Int Real Complex Bool Bit Math'.split(' '));
const gates = new Set('H X Y Z S T CX CZ SWAP CCX Rx Ry Rz Phase reset'.split(' '));
const qparamLanguage = StreamLanguage.define({
  startState: () => ({ math: false }),
  token(stream, state) {
    if (state.math) {
      while (!stream.eol()) {
        const character = stream.next();
        if (character === '\\') stream.next();
        else if (character === '$') { state.math = false; break; }
      }
      return 'string';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.eat('$')) { state.math = true; return 'string'; }
    if (stream.eat('"')) {
      while (!stream.eol()) { const character = stream.next(); if (character === '\\') stream.next(); else if (character === '"') break; }
      return 'string';
    }
    if (stream.match(/\d+/)) return 'number';
    const name = stream.match(/[A-Za-z_][A-Za-z_0-9]*/);
    if (name) { const word = (name as RegExpMatchArray)[0]; return keywords.has(word) ? 'keyword' : types.has(word) ? 'typeName' : gates.has(word) ? 'variableName.function' : 'variableName'; }
    if (stream.match(/[:=+*<>!|-]+/)) return 'operator';
    stream.next();
    return null;
  },
});
const highlighting = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--vscode-symbolIcon-keywordForeground, #c586c0)' },
  { tag: tags.typeName, color: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)' },
  { tag: tags.function(tags.variableName), color: 'var(--vscode-symbolIcon-methodForeground, #dcdcaa)' },
  { tag: tags.variableName, color: 'var(--vscode-symbolIcon-variableForeground, #9cdcfe)' },
  { tag: tags.number, color: 'var(--vscode-symbolIcon-numberForeground, #b5cea8)' },
  { tag: tags.string, color: 'var(--vscode-symbolIcon-stringForeground, #ce9178)' },
  { tag: tags.comment, color: 'var(--vscode-editorLineNumber-foreground, #858585)', fontStyle: 'italic' },
]);

function notationCompletions(context: CompletionContext) {
  const prefix = context.state.doc.sliceString(0, context.pos);
  const before = context.matchBefore(/[\\$][A-Za-z]*/);
  if (!before || !insideMath(prefix)) return null;
  const wholeSpan = before.text[0] === '$';
  return {
    from: before.from,
    options: notations.map(notation => snippetCompletion(
      (wholeSpan ? '$' : '') + codeMirrorSnippet(notation.latex) + (wholeSpan ? '$' : ''),
      { label: (wholeSpan ? '$' : '\\') + notation.name, displayLabel: notation.label, detail: notation.detail, type: 'text' },
    )),
    validFor: /^[\\$][A-Za-z]*$/,
  };
}

let base = initial.source.replace(/\r\n/g, '\n');
let version = initial.version;
let requestNumber = 0;
let inFlight: { requestId: number; before: string; after: string } | undefined;
let deferredSnapshot: { source: string; version: number } | undefined;
let conflict: { source: string; version: number } | undefined;
let syntaxTimer: ReturnType<typeof setTimeout> | undefined;
const deferredCommands: Array<'save' | 'undo' | 'redo' | 'source'> = [];
const status = document.getElementById('sync-status')!;

function publishDraft(): void {
  host?.postMessage({ type: 'draft', source: view.state.doc.toString(), base });
}

function replaceSource(source: string): void {
  const change = difference(view.state.doc.toString(), source);
  if (change) view.dispatch({ changes: { from: change.from, to: change.to, insert: change.text }, annotations: fromHost.of(true) });
}
function showConflict(source: string, nextVersion: number, message = 'The file changed elsewhere. Your draft is preserved here.'): void {
  conflict = { source, version: nextVersion };
  document.getElementById('conflict')!.hidden = false;
  document.querySelector('#conflict > span')!.textContent = message;
  status.textContent = 'Draft needs review';
}
function reconcile(source: string, nextVersion: number, mergeBase: string = base): void {
  const local = view.state.doc.toString();
  const merged = mergeUnrelated(mergeBase, local, source);
  base = source;
  version = nextVersion;
  if (merged === undefined) { showConflict(source, nextVersion); return; }
  replaceSource(merged);
  publishDraft();
  status.textContent = '';
}
function flush(): void {
  if (inFlight || conflict) return;
  const current = view.state.doc.toString();
  const change = difference(base, current);
  if (change) {
    if (current.length > 500_000) { showConflict(base, version, 'The editor limit is 500,000 characters. Your draft is preserved; copy it or shorten it before applying.'); return; }
    if (!host) { base = current; version++; status.textContent = ''; flush(); return; }
    inFlight = { requestId: ++requestNumber, before: base, after: current };
    status.textContent = 'Syncing…';
    host.postMessage({ type: 'edit', requestId: inFlight.requestId, version, changes: [change] });
  } else {
    const command = deferredCommands.shift();
    if (command) { host?.postMessage({ type: command }); if (command === 'save' || command === 'source') flush(); }
  }
}
function command(type: 'save' | 'undo' | 'redo' | 'source'): boolean {
  deferredCommands.push(type);
  flush();
  return true;
}

function updateSyntax(): void {
  const diagnostics = parseDocument(view.state.doc.toString()).diagnostics;
  const syntax = document.getElementById('syntax-status')!;
  syntax.textContent = diagnostics.length ? `${diagnostics.length} syntax ${diagnostics.length === 1 ? 'issue' : 'issues'}` : 'Syntax parsed';
  syntax.classList.toggle('has-errors', diagnostics.some(diagnostic => diagnostic.severity === 'error'));
  const panel = document.getElementById('problems')!;
  panel.replaceChildren(...diagnostics.map(diagnostic => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${diagnostic.line + 1}:${diagnostic.column + 1}  ${diagnostic.message}`;
    button.addEventListener('click', () => {
      const line = view.state.doc.line(Math.min(diagnostic.line + 1, view.state.doc.lines));
      view.dispatch({ selection: { anchor: Math.min(line.from + diagnostic.column, line.to) }, scrollIntoView: true });
      view.focus();
    });
    return button;
  }));
}

const view = new EditorView({
  parent: document.getElementById('editor')!,
  state: EditorState.create({
    doc: base,
    extensions: [
      rawField, renderedSelection, formulas, lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), rectangularSelection(),
      qparamLanguage, syntaxHighlighting(highlighting), bracketMatching(), indentOnInput(), closeBrackets(),
      search({ top: true }),
      autocompletion({ override: [notationCompletions], activateOnTyping: true }),
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({ 'aria-label': 'QParam source; formulas render when the cursor leaves them', spellcheck: 'false' }),
      Prec.highest(keymap.of([
        { key: 'Mod-z', run: () => command('undo') },
        { key: 'Mod-Shift-z', run: () => command('redo') },
        { key: 'Mod-y', run: () => command('redo') },
        { key: 'Mod-s', run: () => command('save') },
        { key: 'Escape', run: editor => { editor.dispatch({ effects: forceRender.of(true) }); return true; } },
      ])),
      keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...defaultKeymap, indentWithTab]),
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        clearTimeout(syntaxTimer);
        syntaxTimer = setTimeout(updateSyntax, 180);
        if (update.transactions.every(transaction => transaction.annotation(fromHost))) return;
        publishDraft();
        status.textContent = conflict ? 'Draft needs review' : 'Syncing…';
        flush();
      }),
    ],
  }),
});

function setMode(raw: boolean): void {
  view.dispatch({ effects: rawMode.of(raw) });
  host?.setState({ raw });
  document.getElementById('math-mode')!.setAttribute('aria-pressed', String(!raw));
  document.getElementById('source-mode')!.setAttribute('aria-pressed', String(raw));
}
document.getElementById('math-mode')!.addEventListener('click', () => { setMode(false); view.dispatch({ effects: forceRender.of(true) }); });
document.getElementById('source-mode')!.addEventListener('click', () => { setMode(true); view.focus(); });
document.getElementById('native-editor')!.addEventListener('click', () => command('source'));
document.getElementById('syntax-status')!.addEventListener('click', event => {
  const panel = document.getElementById('problems')!;
  panel.hidden = !panel.hidden;
  (event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!panel.hidden));
});
document.getElementById('copy-draft')!.addEventListener('click', () => {
  if (host) host.postMessage({ type: 'copy', text: view.state.doc.toString() });
  else navigator.clipboard?.writeText(view.state.doc.toString());
});
document.getElementById('use-file')!.addEventListener('click', () => {
  if (!conflict) return;
  base = conflict.source; version = conflict.version;
  replaceSource(base);
  publishDraft();
  conflict = undefined;
  document.getElementById('conflict')!.hidden = true;
  status.textContent = '';
  flush();
});
document.getElementById('use-draft')!.addEventListener('click', () => {
  if (!conflict) return;
  base = conflict.source; version = conflict.version;
  conflict = undefined;
  document.getElementById('conflict')!.hidden = true;
  flush();
});

window.addEventListener('message', event => {
  const message = event.data;
  if (message?.type === 'insert-notation' && typeof message.latex === 'string' && message.latex.length <= 10_000) {
    const selection = view.state.selection.main;
    const math = insideMath(view.state.doc.sliceString(0, selection.from));
    const template = (math ? '' : '$') + codeMirrorSnippet(message.latex) + (math ? '' : '$');
    snippet(template)(view, null, selection.from, selection.to);
    view.focus();
    return;
  }
  if (!message || typeof message.source !== 'string' || !Number.isSafeInteger(message.version)) return;
  const snapshot = { source: message.source.replace(/\r\n/g, '\n'), version: message.version as number };
  if (message.type === 'document') {
    if (snapshot.version < version) return;
    if (conflict) { conflict = snapshot; return; }
    if (inFlight) { if (!deferredSnapshot || snapshot.version >= deferredSnapshot.version) deferredSnapshot = snapshot; return; }
    reconcile(snapshot.source, snapshot.version);
    flush();
  } else if (message.type === 'edit-result' && inFlight && message.requestId === inFlight.requestId) {
    const submitted = inFlight;
    inFlight = undefined;
    if (!message.accepted && snapshot.source === submitted.before) {
      base = snapshot.source;
      version = snapshot.version;
      showConflict(snapshot.source, snapshot.version, typeof message.reason === 'string' ? message.reason : 'VS Code could not apply this edit. Your draft is preserved here; copy it or retry explicitly.');
      deferredSnapshot = undefined;
      return;
    }
    reconcile(snapshot.source, snapshot.version, message.accepted ? submitted.after : submitted.before);
    if (deferredSnapshot && deferredSnapshot.version > version) {
      if (conflict) { conflict = deferredSnapshot; base = deferredSnapshot.source; version = deferredSnapshot.version; }
      else reconcile(deferredSnapshot.source, deferredSnapshot.version);
    }
    deferredSnapshot = undefined;
    flush();
  }
});
window.addEventListener('blur', flush);
setMode(view.state.field(rawField));
if (initial.recovered && typeof initial.recovered.source === 'string' && initial.recovered.source.length <= 500_000 && initial.recovered.source !== base) {
  replaceSource(initial.recovered.source.replace(/\r\n/g, '\n'));
  showConflict(base, version, 'Recovered a draft that was not fully synchronized. Review it before applying it to the file.');
}
updateSyntax();
host?.postMessage({ type: 'ready' });
view.focus();
