const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('../dist/language/document');
const { parseMath, toMathLatex } = require('../dist/language/math');
const { mathSpans, programLines } = require('../dist/editor/spans');
const { renderDocument, renderMath } = require('../dist/preview/render');
const { exportLatex } = require('../dist/editor/latex');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'examples/literature/index.json'), 'utf8'));
const files = fs.readdirSync(path.join(root, 'examples'), { recursive: true })
  .filter(file => file.endsWith('.qp')).map(file => 'examples/' + file.replaceAll('\\', '/'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const preview = { katexCssUri: 'katex.css', styleUri: 'preview.css', scriptUri: 'preview.js', cspSource: "'self'", nonce: 'test', sourceName: 'corpus.qp' };

test('every gallery program has mathematical ASTs, rendering and mathematical LaTeX export', t => {
  let formulas = 0, algorithms = 0, assertions = 0, interfaces = 0;
  for (const file of files) {
    const source = read(file);
    const doc = parseDocument(source);
    assert.deepEqual(doc.diagnostics, [], file);
    assert.equal('verified' in doc, false, file);
    const tex = exportLatex(doc);
    for (const span of mathSpans(source)) {
      assert.ok(parseMath(span.latex), file);
      assert.doesNotMatch(renderMath(span.latex), /class="math-error/, `${file}: ${span.latex}`);
      assert.ok(tex.includes(toMathLatex(span.latex)), `${file}: export must preserve typeset mathematics: ${span.latex}`);
      formulas++;
    }
    assert.doesNotMatch(renderDocument(doc, preview), /class="math-error/, file);
    assert.match(tex, /have not been proof-checked/);
    algorithms += doc.program.algorithms.length;
    interfaces += doc.program.oracles.length + doc.program.classicals.length;
    assertions += doc.sections.flatMap(s => s.items).filter(i => ['requires', 'ensures', 'probability', 'costs', 'assert', 'invariant'].includes(i.kind)).length;
  }
  t.diagnostic(`${files.length} documents; ${algorithms} algorithms; ${interfaces} external interfaces; ${formulas} mathematical spans; ${assertions} recorded clauses. Syntax/rendering only.`);
});

test('all literature documents have inspected-source provenance and explicit implementation limits', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, 'syntax-only');
  const ids = new Set();
  const linked = new Set();
  for (const source of manifest.sources) {
    assert.ok(!ids.has(source.id), `duplicate source ${source.id}`); ids.add(source.id);
    for (const key of ['title', 'url', 'locator', 'scope']) assert.ok(source[key]?.length, `${source.id}: ${key}`);
    assert.equal(source.sourceStatus, 'fulltext-inspected');
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.ok(source.authors.length && source.accessModel.length && source.limitations.length);
    for (const file of source.programs) {
      assert.ok(files.includes(file), `missing corpus file ${file}`);
      linked.add(file);
    }
  }
  for (const file of files.filter(file => file.startsWith('examples/literature/'))) {
    assert.ok(linked.has(file), `source needed for ${file}`);
    const doc = parseDocument(read(file));
    assert.ok(doc.program.algorithms.some(a => a.body.length > 0), `${file}: must contain a program, not only declarations`);
    assert.ok(doc.sections.some(s => s.kind === 'spec'), `${file}: specification needed`);
    assert.ok(doc.sections.some(s => s.items.some(i => i.kind === 'admit')), `${file}: unresolved obligations must remain visible`);
  }
});

test('factorial, primes and dual/conjugate stars retain distinct structural notation', () => {
  assert.equal(parseMath('k!').operator, 'factorial');
  assert.equal(parseMath('k!!').operator, 'double-factorial');
  assert.equal(parseMath('(k!)!').operand.kind, 'group');
  assert.equal(parseMath('k!^2').base.operator, 'factorial');
  assert.equal(parseMath('k!(x+1)').operator, 'multiply');
  assert.equal(parseMath("f'(x)").function.operator, 'prime');
  assert.equal(parseMath(String.raw`b_1^{*}`).superscript.elements[0].value, '*');
  assert.equal(parseMath('z^*').superscript.value, '*');
  assert.equal(parseMath('k!=1').operator, '!=');
  for (const source of ['!k', 'k!!!', '*x', 'x^{*2}', "x^2'", "x^{a}'", "x^{*}'"]) assert.throws(() => parseMath(source), undefined, source);
  for (const source of ["(x^2)'", "x'^2", String.raw`x^{2\prime}`]) {
    assert.ok(parseMath(source));
    assert.doesNotMatch(renderMath(source), /class="math-error/);
  }
});

test('multiline program assertions stay typeset with correct links and literal comment dollars', () => {
  const source = 'qparam Multiline\nalgorithm f() {\n  // $not_math$\n  assert $\\begin{aligned}a&=b\\\\\n    c&=d\\end{aligned}$\n}\n';
  const doc = parseDocument(source);
  assert.deepEqual(doc.diagnostics, []);
  const program = programLines(doc.sections[0].source);
  assert.equal(program.length, 4);
  assert.equal(program[2].line, 2);
  assert.equal(program[3].line, 4);
  const html = renderDocument(doc, preview);
  assert.doesNotMatch(html, /class="math-error/);
  assert.match(html, /class="code-math"/);
  const tex = exportLatex(doc);
  assert.ok(tex.includes('\\(\\displaystyle \\begin{aligned}'));
  assert.ok(tex.includes('\\$not\\_math\\$'));
});
