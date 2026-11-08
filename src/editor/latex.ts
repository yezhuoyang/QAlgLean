import { QDocument } from '../language/document';
import { latexMathPreamble } from '../language/math-syntax';
import { toMathLatex } from '../language/math';
import { mathSpans, programLines } from './spans';

/** Text is escaped separately from the deliberately restricted mathematical fragment. */
export function escapeLatex(text: string): string {
  const replacements: Record<string, string> = {
    '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$',
    '&': '\\&', '#': '\\#', '_': '\\_', '%': '\\%', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}'
  };
  return text.replace(/[\\{}$&#_%~^]/g, c => replacements[c]);
}

export function exportLatex(doc: QDocument): string {
  if (doc.diagnostics.some(d => d.severity === 'error')) throw new Error('Resolve syntax errors before exporting the paper.');
  const lines = [
    '% Compile with XeLaTeX or LuaLaTeX (Unicode mathematical source).',
    '\\documentclass[11pt]{article}', '\\usepackage{amsmath,geometry,xcolor}',
    '\\usepackage{fontspec,unicode-math}',
    '\\setmainfont{lmroman10-regular.otf}[BoldFont=lmroman10-bold.otf,ItalicFont=lmroman10-italic.otf,BoldItalicFont=lmroman10-bolditalic.otf]',
    '\\setmathfont{latinmodern-math.otf}', '\\geometry{margin=1in}',
    ...latexMathPreamble,
    `\\title{${escapeLatex(doc.title || doc.name)}}`, '\\author{QParam research document}', '\\date{}',
    '\\begin{document}', '\\maketitle', escapeLatex(doc.description),
    '\\begin{quote}\\small Frontend document. Mathematical claims and programs have not been proof-checked.\\end{quote}'
  ];
  for (const section of doc.sections) {
    lines.push(`\\subsection*{${escapeLatex(section.kind)}: ${escapeLatex(section.name)}}`);
    if (['algorithm', 'oracle', 'classical', 'definition', 'equation', 'map', 'import', 'configuration'].includes(section.kind)) {
      for (const { source } of programLines(section.source)) {
        let cursor = 0;
        const parts: string[] = [];
        const text = (value: string) => `\\texttt{${escapeLatex(value).replace(/^ +/, spaces => '\\hspace*{' + spaces.length * 0.5 + 'em}')}}`;
        for (const span of mathSpans(source)) {
          parts.push(text(source.slice(cursor, span.from)), `\\(\\displaystyle ${toMathLatex(span.latex)}\\)`);
          cursor = span.to;
        }
        parts.push(text(source.slice(cursor)));
        lines.push(`\\noindent ${parts.join('')}\\par\\smallskip`);
      }
      continue;
    }
    for (const item of section.items) {
      if (item.label) lines.push(`\\noindent\\textbf{${escapeLatex(item.label)}}\\quad`);
      if (item.math) lines.push(`\\[${toMathLatex(item.math)}\\]`);
      else if (item.text) lines.push(`\\noindent\\texttt{${escapeLatex(item.text)}}\\par`);
      if (item.condition) lines.push('\\noindent\\textbf{given}', `\\[${toMathLatex(item.condition.source)}\\]`);
    }
  }
  lines.push('\\end{document}', '');
  return lines.join('\n');
}

/** Import only an explicit QParam environment; arbitrary TeX is never executed. */
export function importLatex(source: string): string {
  const blocks = [...source.matchAll(/\\begin\{qparam\}([\s\S]*?)\\end\{qparam\}/g)];
  if (blocks.length !== 1) throw new Error('Include exactly one \\begin{qparam} ... \\end{qparam} block containing QParam source.');
  return blocks[0][1].replace(/^\r?\n/, '').trimEnd() + '\n';
}
