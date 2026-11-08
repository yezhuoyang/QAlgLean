import * as katex from 'katex';
import { QDocument } from '../language/document';
import { mathMacros } from '../language/math-syntax';
import { toMathLatex } from '../language/math';

export interface PreviewOptions {
  katexCssUri: string;
  styleUri: string;
  scriptUri: string;
  cspSource: string;
  nonce: string;
  sourceName: string;
}

type Section = QDocument['sections'][number];
type Item = Section['items'][number];
interface Group { kind: string; name: string; sections: Section[] }

const kindNames: Record<string, string> = {
  parameter: 'Parameters', assumption: 'Assumptions', state: 'Quantum states',
  oracle: 'Oracle interface', algorithm: 'Algorithm', spec: 'Specification', proof: 'Proof',
};

/** All source content crosses this escaping boundary before entering HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]!));
}

/** Render the bounded presentation language; macro definitions are not allowed. */
export function renderMath(source: string, displayMode = true): string {
  const forbidden = /\\(?:def|gdef|edef|xdef|let|futurelet|global|long|outer|newcommand|renewcommand|providecommand|newenvironment|renewenvironment|catcode|csname|endcsname|input|include|write|openout|read|htmlClass|htmlId|htmlStyle|htmlData)\b/;
  if (source.length > 20_000 || forbidden.test(source)) {
    return `<span class="math-error" role="note">${escapeHtml(source.length > 20_000
      ? 'This expression exceeds the preview limit.'
      : 'User-defined TeX commands are not supported. Use the QParam notation library.')}</span>`;
  }
  try {
    return katex.renderToString(toMathLatex(source), {
      displayMode, output: 'htmlAndMathml', throwOnError: true,
      trust: false, strict: 'error', maxExpand: 500, maxSize: 12,
      macros: { ...mathMacros },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Cannot render this expression.';
    return `<span class="math-error" title="${escapeHtml(reason)}">${escapeHtml(source)}</span>`;
  }
}

function icon(name: 'source' | 'copy' | 'chevron'): string {
  const paths = {
    source: '<path d="m6 5-4 4 4 4m6-8 4 4-4 4m-2-10-2 14"/>',
    copy: '<rect x="6" y="6" width="9" height="10" rx="2"/><path d="M12 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>',
    chevron: '<path d="m6 4 5 5-5 5"/>',
  };
  return `<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function sourceButton(line: number, compact = false): string {
  return `<button class="source-button${compact ? ' compact' : ''}" data-action="reveal" data-line="${line}" title="View source, line ${line + 1}" aria-label="View source, line ${line + 1}">${icon('source')}${compact ? '' : '<span>View source</span>'}</button>`;
}

function copyButton(source: string): string {
  return `<button class="copy-button" data-action="copy" data-copy="${escapeHtml(source)}" title="Copy LaTeX" aria-label="Copy LaTeX">${icon('copy')}</button>`;
}

function groupsFor(sections: Section[]): Group[] {
  const groups: Group[] = [];
  for (const section of sections) {
    const previous = groups.at(-1);
    const groupable = ['parameter', 'assumption', 'state'].includes(section.kind);
    if (groupable && previous?.kind === section.kind) previous.sections.push(section);
    else groups.push({
      kind: section.kind,
      name: groupable ? kindNames[section.kind] : section.name || kindNames[section.kind] || section.kind,
      sections: [section],
    });
  }
  return groups;
}

function renderCode(source: string): string {
  const tokens = /(\/\/[^\r\n]*|\$[^$\r\n]*\$|\b(?:oracle|algorithm|apply|prepare|measure|return|repeat|for|in|let|if|else|allocate|discard|control|controlled|adjoint|call|end)\b|\b(?:H|X|Y|Z|S|T|CX|CZ|CNOT|CCX|SWAP|QFT|Rz|Ry|Rx|reset)\b|\b\d+\b|\b(?:Qubit|QReg|Nat|Real|Complex|Bool)\b)/g;
  let last = 0;
  let html = '';
  for (const match of source.matchAll(tokens)) {
    html += escapeHtml(source.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('$')) html += `<span class="code-math">${renderMath(token.slice(1, -1), false)}</span>`;
    else {
      const kind = /^\/\//.test(token) ? 'comment' : /^\d/.test(token) ? 'number'
        : /^(H|X|Y|Z|S|T|CX|CZ|CNOT|CCX|SWAP|QFT|Rz|Ry|Rx|reset)$/.test(token) ? 'gate'
        : /^(Qubit|QReg|Nat|Real|Complex|Bool)$/.test(token) ? 'type' : 'keyword';
      html += `<span class="token-${kind}">${escapeHtml(token)}</span>`;
    }
    last = (match.index ?? 0) + token.length;
  }
  return html + escapeHtml(source.slice(last));
}

function renderItem(item: Item, section: Section): string {
  const hasMath = typeof item.math === 'string';
  if (section.kind === 'parameter') {
    const typeSymbols: Record<string, string> = { Nat: '\\mathbb{N}', Real: '\\mathbb{R}', Complex: '\\mathbb{C}', Int: '\\mathbb{Z}', Bool: '\\mathbb{B}' };
    const type = (item.text ?? '').trim();
    return `<div class="parameter" data-line="${item.line}"><code class="parameter-name">${escapeHtml(item.label || section.name)}</code><span class="parameter-colon">:</span><span class="parameter-type">${typeSymbols[type] ? renderMath(typeSymbols[type], false) : escapeHtml(type)}</span>${sourceButton(item.line, true)}</div>`;
  }
  if (item.kind === 'lean') {
    return `<div class="external-reference"><span class="lean-mark">L</span><div><span class="item-caption">Lean reference</span><code>${escapeHtml(item.text ?? item.label)}</code></div><span class="status-tag neutral">Not checked</span>${sourceButton(item.line, true)}</div>`;
  }
  if (item.kind === 'admit') {
    return `<div class="assumption-note"><span class="assumption-symbol" aria-hidden="true">!</span><div><span class="item-caption">Open proof obligation</span><p>${escapeHtml(item.text || 'This step is explicitly admitted.')}</p></div>${sourceButton(item.line, true)}</div>`;
  }
  const clause = ['requires', 'ensures', 'costs', 'probability'].includes(item.kind);
  const label = clause ? item.kind : item.label || section.name;
  const status = section.kind === 'assumption' ? '<span class="status-tag assumed">Assumed</span>'
    : section.kind === 'proof' && hasMath ? '<span class="status-tag open">Open obligation</span>' : '';
  return `<div class="expression${clause ? ` clause clause-${escapeHtml(item.kind)}` : ''}" data-line="${item.line}">
    <div class="expression-heading"><span class="${clause ? 'clause-label' : 'expression-label'}">${escapeHtml(label)}</span>${status}<span class="expression-actions">${hasMath ? copyButton(item.math!) : ''}${sourceButton(item.line, true)}</span></div>
    ${hasMath ? `<div class="equation">${renderMath(item.math!)}</div>` : `<p class="item-text">${escapeHtml(item.text ?? '')}</p>`}
  </div>`;
}

function renderGroup(group: Group, index: number): string {
  const items = group.sections.flatMap(section => section.kind === 'algorithm' || section.kind === 'oracle'
    ? section.source.split(/\r?\n/).map((source, lineIndex) => {
      const line = section.line + lineIndex;
      return `<div class="program-line" data-line="${line}"><button class="line-number" data-action="reveal" data-line="${line}" aria-label="View source, line ${line + 1}">${line + 1}</button><code>${renderCode(source)}</code></div>`;
    })
    : section.items.map(item => renderItem(item, section)));
  const isNamed = !['parameter', 'assumption', 'state'].includes(group.kind);
  const label = kindNames[group.kind] || group.kind;
  const firstSection = group.sections[0];
  return `<section class="document-section kind-${escapeHtml(group.kind)}" id="section-${index}" data-line="${firstSection.line}" aria-labelledby="heading-${index}">
    <div class="section-heading"><h2 id="heading-${index}">${isNamed ? `<span class="section-kind">${escapeHtml(label)} </span>` : ''}${escapeHtml(group.name)}</h2>${sourceButton(firstSection.line)}</div>
    <div class="section-body${group.kind === 'parameter' ? ' parameter-grid' : ''}${group.kind === 'algorithm' || group.kind === 'oracle' ? ' program' : ''}">${items.join('') || '<p class="empty-section">No statements.</p>'}</div>
  </section>`;
}

export function renderDocument(document: QDocument, options: PreviewOptions): string {
  const groups = groupsFor(document.sections);
  const errors = document.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
  const title = document.title || document.name || 'Untitled quantum program';
  const csp = `default-src 'none'; img-src ${options.cspSource} data:; font-src ${options.cspSource}; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';`;
  const diagnostics = document.diagnostics.length ? `<aside class="diagnostics" aria-label="Source diagnostics"><div class="diagnostics-title">Syntax problems</div>${document.diagnostics.map(diagnostic => `<button class="diagnostic diagnostic-${escapeHtml(diagnostic.severity)}" data-action="reveal" data-line="${diagnostic.line}"><span class="diagnostic-location">L${diagnostic.line + 1}:${diagnostic.column + 1}</span><span>${escapeHtml(diagnostic.message)}</span>${icon('chevron')}</button>`).join('')}</aside>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <title>${escapeHtml(title)} · QParam</title>
  <link rel="stylesheet" href="${escapeHtml(options.katexCssUri)}">
  <link rel="stylesheet" href="${escapeHtml(options.styleUri)}">
</head>
<body>
  <div class="document-toolbar"><span class="source-name">${escapeHtml(options.sourceName)} · Preview</span><span class="parse-status${errors.length ? ' has-errors' : ''}">${errors.length ? `${errors.length} syntax ${errors.length === 1 ? 'issue' : 'issues'}` : 'Syntax parsed'}</span><span>Proof checking not connected</span></div>
  <main class="workspace" id="top">
    <article class="paper">
      <header class="paper-title"><h1>${escapeHtml(title)}</h1>${document.description ? `<p class="document-description">${escapeHtml(document.description)}</p>` : ''}</header>
      ${diagnostics}
      ${groups.length ? groups.map(renderGroup).join('') : '<p class="empty-document">Add a parameter, state, algorithm, or specification.</p>'}
    </article>
  </main>
  <div class="toast" role="status" aria-live="polite"></div>
  <script nonce="${escapeHtml(options.nonce)}" src="${escapeHtml(options.scriptUri)}"></script>
</body>
</html>`;
}
