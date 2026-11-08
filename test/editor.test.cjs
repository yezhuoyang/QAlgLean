const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('../dist/language/document');
const { exportLatex, importLatex, escapeLatex } = require('../dist/editor/latex');
const { insideMath } = require('../dist/editor/notation');

test('LaTeX import extracts a single literal QParam block and never executes TeX', () => {
  assert.equal(importLatex('\\documentclass{article}\n\\begin{qparam}\nqparam Example\n\\end{qparam}'), 'qparam Example\n');
  assert.throws(() => importLatex('\\input{secret}'), /exactly one/);
  assert.throws(() => importLatex('\\begin{qparam}a\\end{qparam}\\begin{qparam}b\\end{qparam}'), /exactly one/);
});

test('paper export preserves mathematics and marks proof status honestly', () => {
  const document = parseDocument(fs.readFileSync(path.join(__dirname, '../examples/bell.qp'), 'utf8'));
  const paper = exportLatex(document);
  assert.ok(paper.includes('\\documentclass'));
  assert.ok(paper.includes('have not been proof-checked'));
  assert.ok(paper.includes('\\ket'));
  assert.ok(paper.endsWith('\\end{document}\n'));
});

test('export rejects syntax errors and escapes prose separately', () => {
  assert.throws(() => exportLatex(parseDocument('this is not a document')), /syntax errors/);
  assert.equal(escapeLatex('a_b & 50%'), 'a\\_b \\& 50\\%');
  assert.ok(escapeLatex('\\end{document}').startsWith('\\textbackslash{}'));
});

test('Unicode mathematics uses a Unicode-capable LaTeX engine and font', () => {
  const paper = exportLatex(parseDocument('qparam Unicode\nstate psi := $α ⊗ β$'));
  assert.ok(paper.includes('fontspec,unicode-math'));
  assert.ok(paper.includes('latinmodern-math.otf'));
  assert.ok(paper.includes('α ⊗ β'));
});

test('math completion distinguishes balanced and escaped delimiters', () => {
  assert.equal(insideMath('state x := $\\alpha'), true);
  assert.equal(insideMath('state x := $\\alpha$'), false);
  assert.equal(insideMath('literal \\$'), false);
  assert.equal(insideMath('state x := $\\alpha\n + '), true);
});

test('math completion ignores dollars in descriptions, titles, and comments', () => {
  const prefixes = [
    'qparam Demo\ntitle "Research $1"\n',
    'qparam Demo\ndescription "An example costs $1."\n',
    'qparam Demo\n// Type $sum to open notation.\n',
    'qparam Demo\ntitle "A \\"quoted\\" $ sign"\r\n',
  ];
  for (const prefix of prefixes) {
    assert.equal(insideMath(prefix + 'state psi := '), false, prefix);
    assert.equal(insideMath(prefix + 'state psi := $\\ket'), true, prefix);
    assert.equal(insideMath(prefix + 'state psi := $\\ket{0}$'), false, prefix);
  }
  assert.equal(insideMath('// $'), false);
  assert.equal(insideMath('description "$'), false);
  assert.equal(insideMath('state x := $x // y'), true, 'a comment marker inside mathematics does not end math');
});
