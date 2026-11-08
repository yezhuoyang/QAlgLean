import * as katex from 'katex';
import { QDocument } from '../language/document';

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
  algorithm: 'Algorithm', spec: 'Specification', proof: 'Proof workspace',
};

const macros: Record<string, string> = {
  '\\ket': '\\left|#1\\right\\rangle',
  '\\bra': '\\left\\langle#1\\right|',
  '\\braket': '\\left\\langle#1\\middle|#2\\right\\rangle',
  '\\norm': '\\left\\lVert#1\\right\\rVert',
  '\\Tr': '\\operatorname{Tr}',
  '\\abs': '\\left|#1\\right|',
  '\\ip': '\\left\\langle#1,#2\\right\\rangle',
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
    return katex.renderToString(source, {
      displayMode, output: 'htmlAndMathml', throwOnError: true,
      trust: false, strict: 'error', maxExpand: 500, maxSize: 12,
      macros: { ...macros },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Cannot render this expression.';
    return `<span class="math-error" title="${escapeHtml(reason)}">${escapeHtml(source)}</span>`;
  }
}

function icon(name: 'source' | 'copy' | 'sun' | 'moon' | 'arrow' | 'chevron'): string {
  const paths = {
    source: '<path d="m6 5-4 4 4 4m6-8 4 4-4 4m-2-10-2 14"/>',
    copy: '<rect x="6" y="6" width="9" height="10" rx="2"/><path d="M12 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>',
    sun: '<circle cx="9" cy="9" r="3"/><path d="M9 1v1m0 14v1M1 9h1m14 0h1M3.3 3.3l.7.7m10 10 .7.7m0-11.4-.7.7M4 14l-.7.7"/>',
    moon: '<path d="M15.5 10.2A6.7 6.7 0 0 1 7.8 2.5a6.7 6.7 0 1 0 7.7 7.7Z"/>',
    arrow: '<path d="M3 9h12m-5-5 5 5-5 5"/>',
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
  const tokens = /(\/\/[^\r\n]*|\$[^$\r\n]*\$|\b(?:algorithm|apply|prepare|measure|return|repeat|for|in|let|if|else|allocate|discard|control|controlled|call|end)\b|\b(?:H|X|Y|Z|S|T|CX|CZ|CNOT|CCX|SWAP|QFT|Rz|Ry|Rx|reset)\b|\b\d+\b|\b(?:Qubit|QReg|Nat|Real|Complex|Bool)\b)/g;
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
  const number = String(index + 1).padStart(2, '0');
  const items = group.sections.flatMap(section => section.kind === 'algorithm'
    ? section.source.split(/\r?\n/).map((source, lineIndex) => {
      const line = section.line + lineIndex;
      return `<div class="program-line" data-line="${line}"><button class="line-number" data-action="reveal" data-line="${line}" aria-label="View source, line ${line + 1}">${String(lineIndex + 1).padStart(2, '0')}</button><code>${renderCode(source)}</code></div>`;
    })
    : section.items.map(item => renderItem(item, section)));
  const isNamed = !['parameter', 'assumption', 'state'].includes(group.kind);
  const label = kindNames[group.kind] || group.kind;
  const firstSection = group.sections[0];
  return `<section class="document-section kind-${escapeHtml(group.kind)}" id="section-${index}" data-line="${firstSection.line}" aria-labelledby="heading-${index}">
    <div class="section-heading"><span class="section-number">${number}</span><div class="section-heading-text">${isNamed ? `<span class="section-kind">${escapeHtml(label)}</span>` : ''}<h2 id="heading-${index}">${escapeHtml(group.name)}</h2></div>${sourceButton(firstSection.line)}</div>
    <div class="section-body${group.kind === 'parameter' ? ' parameter-grid' : ''}${group.kind === 'algorithm' ? ' program' : ''}">${items.join('') || '<p class="empty-section">This section has no statements yet.</p>'}</div>
  </section>`;
}

export function renderDocument(document: QDocument, options: PreviewOptions): string {
  const groups = groupsFor(document.sections);
  const errors = document.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
  const equations = document.sections.reduce((count, section) => count + section.items.filter(item => typeof item.math === 'string').length, 0);
  const assumptions = document.sections.reduce((count, section) => count + (section.kind === 'assumption' ? section.items.length : 0), 0);
  const proofGaps = document.sections.reduce((count, section) => count + section.items.filter(item => item.kind === 'admit').length, 0);
  const algorithms = document.sections.filter(section => section.kind === 'algorithm').length;
  const fact = (count: number, singular: string, cssClass = '') => `<span${cssClass ? ` class="${cssClass}"` : ''}><strong>${count}</strong> ${singular}${count === 1 ? '' : 's'}</span>`;
  const title = document.title || document.name || 'Untitled quantum program';
  const csp = `default-src 'none'; img-src ${options.cspSource} data:; font-src ${options.cspSource}; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';`;
  const diagnostics = document.diagnostics.length ? `<aside class="diagnostics" aria-label="Source diagnostics"><div class="diagnostics-title">${errors.length ? 'A few details need attention' : 'Source notes'}</div>${document.diagnostics.map(diagnostic => `<button class="diagnostic diagnostic-${escapeHtml(diagnostic.severity)}" data-action="reveal" data-line="${diagnostic.line}"><span class="diagnostic-location">L${diagnostic.line + 1}:${diagnostic.column + 1}</span><span>${escapeHtml(diagnostic.message)}</span>${icon('chevron')}</button>`).join('')}</aside>` : '';
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <title>${escapeHtml(title)} · QParam</title>
  <link rel="stylesheet" href="${escapeHtml(options.katexCssUri)}">
  <link rel="stylesheet" href="${escapeHtml(options.styleUri)}">
</head>
<body>
  <header class="studio-header"><a class="brand" href="#top" aria-label="QParam research studio"><span class="brand-mark" aria-hidden="true">Q<span>·</span></span><span class="brand-name">QParam</span><span class="brand-divider"></span><span class="brand-context">Research studio</span></a><div class="header-actions"><span class="preview-tag">Frontend preview</span><button class="theme-toggle" data-action="theme" aria-label="Switch to dark paper" title="Switch paper theme"><span class="theme-moon">${icon('moon')}</span><span class="theme-sun">${icon('sun')}</span></button></div></header>
  <div class="document-toolbar"><span class="source-name">${icon('source')}<span>${escapeHtml(options.sourceName)}</span></span><div class="document-status"><span class="parse-status${errors.length ? ' has-errors' : ''}"><span class="status-dot"></span>${errors.length ? `${errors.length} syntax ${errors.length === 1 ? 'issue' : 'issues'}` : 'Syntax parsed'}</span><span class="status-separator">/</span><span class="unconnected-status">Proof checking not connected</span></div></div>
  <main class="workspace" id="top">
    <article class="paper">
      <div class="paper-topline"><span class="edition">A PARAMETRIC QUANTUM PROGRAM</span><span class="document-symbol" aria-hidden="true">ψ</span></div>
      <header class="paper-title"><h1>${escapeHtml(title)}</h1>${document.description ? `<p class="document-description">${escapeHtml(document.description)}</p>` : '<p class="document-description">Algorithms, mathematical specifications, and proof intent in one research document.</p>'}<div class="document-facts">${fact(algorithms, 'algorithm')}${fact(equations, 'expression')}${fact(assumptions, 'assumption', 'assumption-count')}${fact(proofGaps, 'proof gap', 'assumption-count')}<span class="draft-label">RESEARCH DRAFT</span></div></header>
      ${diagnostics}
      ${groups.length ? groups.map(renderGroup).join('') : '<section class="empty-document"><span class="empty-symbol">ψ</span><h2>Your next quantum idea starts here.</h2><p>Add a parameter, a state, or an algorithm to see your mathematical program take shape.</p></section>'}
      <footer class="paper-footer"><span class="footer-wordmark">QParam</span><span>Mathematics you can read. Programs you can inspect.</span><span class="footer-version">FRONTEND EXPLORATION · 01</span></footer>
    </article>
    <aside class="document-rail" aria-label="Document outline"><div class="rail-sticky"><span class="rail-label">IN THIS DOCUMENT</span><nav>${groups.map((group, index) => `<a href="#section-${index}" class="outline-link kind-${escapeHtml(group.kind)}"><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(group.name)}</a>`).join('')}</nav><div class="trust-note"><span class="trust-note-icon">◌</span><h3>A clear proof boundary</h3><p>The notation is rendered and the source is parsed. Mathematical truth and program correctness are not checked in this preview.</p></div><div class="rail-hint">Select <strong>View source</strong> to return to the corresponding statement.</div></div></aside>
  </main>
  <div class="toast" role="status" aria-live="polite"></div>
  <script nonce="${escapeHtml(options.nonce)}" src="${escapeHtml(options.scriptUri)}"></script>
</body>
</html>`;
}
