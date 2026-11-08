const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('../dist/language/document');
const { renderDocument, renderMath } = require('../dist/preview/render');
const { exportLatex } = require('../dist/editor/latex');
const { parseMath } = require('../dist/language/math');
const options = { katexCssUri: '/media/katex/katex.min.css', styleUri: '/media/preview.css', scriptUri: '/media/preview.js', cspSource: "'self'", nonce: 'test-nonce', sourceName: 'example.qp' };

test('paper renderer includes real typesetting and exact source signatures', () => {
  const doc = parseDocument(fs.readFileSync(path.join(__dirname, '../examples/bell.qp'), 'utf8'));
  const html = renderDocument(doc, options);
  assert.ok(html.includes('class="katex"'));
  assert.ok(html.includes('Proof checking not connected'));
  assert.ok(html.includes('Qubit'));
  assert.ok(html.includes('data-line='));
  assert.ok(!html.includes('math-error'), 'valid Bell formulas render');
});

test('Fourier sums, nested tensors and phases render without math errors', () => {
  const doc = parseDocument(fs.readFileSync(path.join(__dirname, '../examples/fourier.qp'), 'utf8'));
  assert.equal(doc.diagnostics.length, 0);
  assert.ok(!renderDocument(doc, options).includes('math-error'));
});

test('all prose and error strings are escaped before HTML insertion', () => {
  const doc = parseDocument('qparam Safe\ntitle "<img src=x onerror=alert(1)>"\nstate x := $\\input{private}$\n');
  const html = renderDocument(doc, options);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes('default-src &#39;none&#39;'));
});

test('preview refuses macro definitions and unbounded expansion inputs', () => {
  assert.ok(renderMath('\\def\\x{\\x}\\x').includes('math-error'));
  assert.ok(renderMath('a'.repeat(32_769)).includes('preview limit'));
  assert.ok(!renderMath('\\href{javascript:alert(1)}{x}').includes('href="javascript:'));
});

test('conditional postconditions retain their event in reading view and paper export', () => {
  const doc = parseDocument(String.raw`qparam Conditional
algorithm f(q : Qubit[], c : Bit[]) {
  measure q[0] -> c[0]
}
spec f {
  ensures $\ket{0}$ given $c_0=0$
  outcomes none
}
`);
  assert.deepEqual(doc.diagnostics, []);
  const html = renderDocument(doc, options);
  assert.match(html, /class="condition"/);
  assert.ok(html.includes('given'));
  assert.ok(html.includes('c_0=0'));
  const tex = exportLatex(doc);
  assert.ok(tex.includes('\\textbf{given}'));
  assert.ok(tex.includes('\\[c_0=0\\]'));
  assert.ok(tex.includes('none'));
});

test('Dirac sign labels and escaped operator names parse and render without weakening ordinary arithmetic', () => {
  for (const source of [String.raw`\ket{+}`, String.raw`\bra{-}`, String.raw`\ketbra{+}{-}`, String.raw`\braket{-}{+}`, '|+⟩', '⟨-|', String.raw`\operatorname{table\_value}(n)`]) {
    assert.ok(parseMath(source));
    assert.doesNotMatch(renderMath(source), /class="math-error/, source);
  }
  for (const source of ['+', '-', '(+)', String.raw`\sqrt{-}`, String.raw`\operatorname{table_value}`, String.raw`\operatorname{a\input{file}}`]) {
    assert.throws(() => parseMath(source), undefined, source);
  }
});
