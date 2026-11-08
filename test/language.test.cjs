const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('../dist/language/document.js');
const { parseMath, MathSyntaxError } = require('../dist/language/math.js');

const example = name => fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf8');

test('all executable authoring examples parse without diagnostics', () => {
  for (const name of ['bell.qp', 'fourier.qp']) {
    const document = parseDocument(example(name));
    assert.deepEqual(document.diagnostics, [], name);
    assert.ok(document.sections.some(section => section.kind === 'algorithm'));
    assert.ok(document.sections.some(section => section.kind === 'proof'));
    for (const item of document.sections.flatMap(section => section.items)) {
      if (item.math !== undefined) assert.ok(item.ast, `${name}: ${item.math}`);
    }
    assert.equal('verified' in document, false, 'syntax parsing must not manufacture a verification result');
  }
});

test('paper example carries exactly one importable block', () => {
  const text = example('paper-import.tex');
  const blocks = [...text.matchAll(/\\begin\{qparam\}([\s\S]*?)\\end\{qparam\}/g)];
  assert.equal(blocks.length, 1);
  assert.deepEqual(parseDocument(blocks[0][1]).diagnostics, []);
});

test('Bell specification keeps fractions, roots, kets, tensor nodes, and exact offsets', () => {
  const source = String.raw`\frac{1}{\sqrt{2}}(\ket{00} + \ket{11})`;
  const ast = parseMath(source);
  assert.equal(ast.kind, 'binary');
  assert.equal(ast.operator, 'multiply');
  assert.equal(ast.left.kind, 'fraction');
  assert.equal(ast.left.denominator.elements[0].kind, 'root');
  assert.equal(ast.right.elements[0].operator, '+');
  assert.equal(ast.start, 0);
  assert.equal(ast.end, source.length);
  assert.equal(ast.right.elements[0].left.argument.elements[0].value, '00');
  assert.equal(parseMath(String.raw`\ket{0}\otimes\ket{1}`).operator, 'tensor');
});

test('indexed sums and tensors preserve binders and limits', () => {
  const sum = parseMath(String.raw`\sum_{x=0}^{N-1}\alpha_x\ket{x}`);
  assert.equal(sum.kind, 'aggregate');
  assert.equal(sum.operator, 'sum');
  assert.equal(sum.lower.elements[0].operator, '=');
  assert.equal(sum.upper.elements[0].operator, '-');
  assert.equal(sum.body.kind, 'binary');
  assert.equal(sum.body.left.kind, 'script');
  const tensor = parseMath(String.raw`\bigotimes_{j=0}^{n-1}\ket{0}`);
  assert.equal(tensor.operator, 'bigotimes');
  assert.throws(() => parseMath(String.raw`\sum x`), /explicit lower limit/);
  assert.throws(() => parseMath(String.raw`\sum_{i=0}_{j=0}x`), /Duplicate lower/);
});

test('mathematical grammar has deterministic precedence and application', () => {
  const expression = parseMath('a + b c^2');
  assert.equal(expression.operator, '+');
  assert.equal(expression.right.operator, 'multiply');
  assert.equal(expression.right.right.kind, 'script');
  const quantified = parseMath(String.raw`\forall x \in S, P(x)`);
  assert.equal(quantified.kind, 'quantifier');
  assert.equal(quantified.binder.operator, 'in');
  assert.equal(quantified.body.kind, 'application');
  assert.equal(parseMath(String.raw`x \mapsto \ket{x}`).operator, 'maps-to');
  assert.equal(parseMath(String.raw`\braket{\phi}{\psi}`).kind, 'inner-product');
  assert.equal(parseMath(String.raw`\norm{\ket{\psi}}^{2}`).base.kind, 'norm');
  assert.equal(parseMath(String.raw`U^{\dagger}`).kind, 'script');
});

test('ASCII and Unicode relations and tensor syntax are accepted', () => {
  for (const source of ['n ≥ 1', 'n >= 1', String.raw`n \geq 1`, 'α ⊗ β', '∀ x ∈ S, P(x)']) {
    assert.ok(parseMath(source));
  }
});

test('unknown TeX, malformed delimiters, empty expressions, and ambiguous scripts are rejected', () => {
  for (const source of [String.raw`\input{secrets}`, String.raw`\htmlClass{x}{y}`, String.raw`\def{x}{y}`, '', '{}', '(x]', 'x +', 'x_1_2', 'x^2^3', String.raw`\frac{1}`, String.raw`\ket x`]) {
    assert.throws(() => parseMath(source), MathSyntaxError, source);
  }
});

test('multi-character unbraced scripts are rejected instead of disagreeing with TeX', () => {
  for (const source of ['x^12', 'x_12', 'x^1.5', 'x_01', String.raw`\sum_12 x`]) {
    assert.throws(() => parseMath(source), /braces around a multi-character script/, source);
  }
  for (const source of ['x^{12}', 'x_{12}', 'x^{1.5}', 'x^1', 'x_n', String.raw`x^\alpha`]) {
    assert.ok(parseMath(source), source);
  }
});

test('sized delimiters require correctly matched left and right commands', () => {
  for (const source of [String.raw`\left x \right`, String.raw`\left(x)`, String.raw`(x\right)`, String.raw`\left(x`, String.raw`\left(x\right]`, String.raw`\left(x+\left[y\right)\right]`, String.raw`\left.x\right)`]) {
    assert.throws(() => parseMath(source), MathSyntaxError, source);
  }
  for (const source of [String.raw`\left(x\right)`, String.raw`\left[x + (y)\right]`, String.raw`\left(x+\left[y\right]\right)`]) {
    assert.equal(parseMath(source).kind, 'group', source);
  }
});

test('invisible TeX groups cannot silently change the displayed mathematical precedence', () => {
  for (const source of ['{a+b}c', String.raw`\sum_{x=0}^{n}{a_x+b_x}`]) {
    assert.throws(() => parseMath(source), /visible parentheses/, source);
  }
  assert.ok(parseMath('(a+b)c'));
  assert.ok(parseMath(String.raw`\sum_{x=0}^{n}(a_x+b_x)`));
  assert.ok(parseMath(String.raw`\frac{a+b}{c}`));
});

test('multiline mathematical diagnostics point at the original source token', () => {
  const source = 'qparam Demo\nstate bad := $\n  \\ket{0} + \\unsupported{x}\n$\n';
  const document = parseDocument(source);
  assert.equal(document.diagnostics.length, 1);
  const diagnostic = document.diagnostics[0];
  assert.equal(diagnostic.line, 2);
  assert.equal(diagnostic.column, 12);
  assert.equal(diagnostic.length, '\\unsupported'.length);
  assert.equal(document.sections[0].items[0].mathLine, 1);
});

test('comments, semicolons, CRLF, and strings preserve document structure', () => {
  const source = [
    '// heading',
    'qparam Demo;',
    'title "Research // notebook $1";',
    'parameter n : Nat // dimension',
    'assume positive : $n \\ge 1$;',
    'algorithm prepare(q : Qubit[n]) {',
    '  repeat j in 0..n {',
    '    H(q[j]); // gate',
    '  }',
    '}',
  ].join('\r\n');
  const document = parseDocument(source);
  assert.deepEqual(document.diagnostics, []);
  assert.equal(document.title, 'Research // notebook $1');
  const algorithm = document.sections.find(section => section.kind === 'algorithm');
  assert.equal(algorithm.line, 5);
  assert.equal(algorithm.endLine, 9);
  assert.deepEqual(algorithm.items.map(item => item.kind), ['loop', 'operation', 'loop-end']);
  assert.match(algorithm.source, /Qubit\[n\]/);
});

test('syntax diagnostics reject unknown programs, wrong arity, bad headers, and duplicate declarations', () => {
  const cases = [
    ['state x := $x$', /first declaration/],
    ['qparam Demo\nqparam Other', /exactly one/],
    ['qparam Demo\nparameter n : Nat\nparameter n : Nat', /Duplicate declaration/],
    ['qparam Demo\nalgorithm f(q : Qubit[2]) {\nCX(q[0])\n}', /requires 2/],
    ['qparam Demo\nalgorithm f(q : Qubit[2]) {\nmagic(q)\n}', /Unsupported program/],
    ['qparam Demo\nalgorithm f(q : UnknownType) {\n}', /Expected Qubit/],
    ['qparam Demo\nalgorithm f(q : Qubit) {\nH(q)', /Unclosed algorithm/],
    ['qparam Demo\nstate psi : $x$', /Use :=/],
    ['qparam Demo\nassume positive := $n > 0$', /Use :/],
    ['qparam Demo\nstate x := $x$ $y$', /one mathematical expression/],
    ['qparam Demo\n}', /Unexpected closing/],
    ['qparam Demo\nspec f {\nassert $x = x$\n}', /Expected requires/],
  ];
  for (const [source, expected] of cases) {
    assert.ok(parseDocument(source).diagnostics.some(diagnostic => expected.test(diagnostic.message)), source);
  }
});

test('a Lean reference and admission remain unresolved authoring items', () => {
  const document = parseDocument('qparam Demo\nproof foo {\nby lean "Mathlib.someTheorem"\nadmit "Later"\n}');
  assert.deepEqual(document.diagnostics, []);
  assert.deepEqual(document.sections[0].items.map(item => item.kind), ['lean', 'admit']);
  for (const item of document.sections[0].items) assert.equal('verified' in item, false);
});

test('deep or oversized editable expressions produce diagnostics rather than crashes', () => {
  const deep = '{'.repeat(150) + 'x' + '}'.repeat(150);
  assert.throws(() => parseMath(deep), /nesting/);
  const document = parseDocument(`qparam Demo\nstate deep := $${deep}$`);
  assert.ok(document.diagnostics.some(diagnostic => /nesting/.test(diagnostic.message)));
  assert.throws(() => parseMath('x'.repeat(32_769)), /character/);
  assert.ok(parseDocument(' '.repeat(1_000_001)).diagnostics.some(diagnostic => /character/));
  const unary = '-'.repeat(20_000) + 'x';
  assert.doesNotThrow(() => parseDocument(`qparam Demo\nstate deep := $${unary}$`));
});
