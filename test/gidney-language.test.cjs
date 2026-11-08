const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDocument, parseIndex } = require('../dist/language/document.js');

function errors(source, imports) {
  return parseDocument(source, imports ? { imports } : {}).diagnostics.map(item => item.message);
}

test('Gidney structural arithmetic preserves table access, calls, shifts and division precedence', () => {
  const tree = parseIndex('T[max(j, 1) + n div 2] >> k % 2');
  assert.equal(tree.kind, 'arithmetic');
  assert.equal(tree.operator, '>>');
  assert.equal(tree.left.kind, 'lookup');
  assert.equal(tree.left.name, 'T');
  assert.equal(tree.left.index.left.kind, 'index-call');
  assert.equal(tree.left.index.right.operator, 'div');
  assert.equal(tree.right.operator, '%');
  assert.equal(parseIndex('-2^n').operand.operator, '^');
  assert.equal(parseIndex('2^3^n').right.operator, '^');
  for (const bad of ['T[]', 'min(,n)', 'min(n,)', 'T[n', 'n div', 'n // 2', 'n[0][1]']) {
    assert.throws(() => parseIndex(bad), undefined, bad);
  }
});

test('maps, classical measurement records, conditional corrections and dyadic rotations have distinct nodes', () => {
  const source = String.raw`qparam Records
parameter dim : Nat
parameter T : Nat[]
define width(n : Math) := $n+1$
map id()(i : Nat) := $i$
map shift(base : Nat)(i : Nat) := $\operatorname{base}+i$
algorithm correction(q : Qubit[], c : Bit[], n : Nat) {
  capacity q $\operatorname{dim}$
  capacity c $n+1$
  reverse repeat j in 0..width(n) {
    H(q[j])
    measure q[j] -> c[j]
    when c[j] {
      Z(q[j])
    }
    when $\bigoplus_{k=0}^{n-1} c_{k}=1$ {
      CZ(q[j], q[n])
    }
  }
  controlled(q[n]) {
    RzDyadic(q[n-1], n div 2)
  }
}
algorithm top(q : Qubit[], c : Bit[], n : Nat) {
  call correction(q, c, T[n] >> 1) @ shift(n)
}`;
  const doc = parseDocument(source);
  assert.deepEqual(doc.diagnostics, []);
  const circuit = doc.program.algorithms[0];
  assert.equal(circuit.capacities.c.source, 'n+1');
  assert.equal(circuit.parameters[1].array, true);
  const loop = circuit.body[0];
  assert.equal(loop.direction, 'reverse');
  assert.equal(loop.to.kind, 'index-call');
  assert.deepEqual(loop.body[1].target, { kind: 'register', name: 'c', index: { kind: 'variable', name: 'j' } });
  assert.equal(loop.body[2].condition.name, 'c');
  assert.equal(loop.body[3].condition.ast.left.kind, 'aggregate');
  assert.equal(circuit.body[1].kind, 'controlled-block');
  assert.equal(circuit.body[1].body[0].name, 'RzDyadic');
  assert.equal(circuit.body[1].body[0].arguments[1].expression.operator, 'div');
  const call = doc.program.algorithms[1].body[0];
  assert.equal(call.placement.name, 'shift');
  assert.equal(call.arguments[2].expression.left.kind, 'lookup');
});

test('coherent and conditional assertions keep state premises, outcomes and counters separate', () => {
  const doc = parseDocument(String.raw`qparam Contract
configuration surface $d=31$
spec measured {
  bind $(\alpha,r)$
  requires $n>0$
  assumes $\sum_{z=0}^{2^{n}-1}\alpha(z)\ket{z}$
  ensures $\ket{r}$ given $c_{0}=r$
  outcomes $\Pr(c_{0}=r)=\abs{\alpha(r)}^{2}$
  resource toffoli := $2^{n}-n-1$
  resource meas := $n$
}
spec unitary {
  outcomes none
}`);
  assert.deepEqual(doc.diagnostics, []);
  const items = doc.sections[1].items;
  assert.deepEqual(items.map(item => item.kind), ['bind', 'requires', 'assumes', 'ensures', 'outcomes', 'resource', 'resource']);
  assert.equal(items[3].condition.source, 'c_{0}=r');
  assert.equal(items[3].conditionMathLine, 6);
  assert.equal(items[3].conditionMathColumn, 27);
  assert.equal(items[5].label, 'toffoli');
  assert.equal(doc.sections[2].items[0].text, 'none');
  assert.equal(doc.sections[0].kind, 'configuration');
  assert.equal('verified' in doc, false);
});

test('recursive mathematical equations retain signatures and ordered structural patterns', () => {
  const source = String.raw`qparam Definitions
define xorLow(k : Math, x : Math, y : Math)
equation xorLow(0, x, y) := $0$
equation xorLow(k+1, x, y) := $\operatorname{xorLow}(k,x,y)+2^{k}(x\oplus y)$
algorithm run(q : Qubit[], n : Nat) {
  X(q[xorLow(n, 0, 1)])
}`;
  const doc = parseDocument(source);
  assert.deepEqual(doc.diagnostics, []);
  assert.equal(doc.sections[0].definition.expression, undefined);
  assert.equal(doc.sections[1].definition.patterns[0].kind, 'integer');
  assert.equal(doc.sections[2].definition.patterns[0].operator, '+');
  assert.ok(errors(source.replace('xorLow(n, 0, 1)', 'xorLow(n)')).some(message => /requires 3 argument/.test(message)));
  assert.ok(errors(source.replace('equation xorLow(0, x, y)', 'equation xorLow(0)')).some(message => /requires 3 pattern/.test(message)));
  assert.ok(errors('qparam E\nequation absent(0) := $0$').some(message => /Unknown equation target/.test(message)));
});

test('imports resolve actual transitive interfaces and do not authorize unknown callees', () => {
  const base = parseDocument(String.raw`qparam Base
parameter width : Nat
parameter T : Nat[]
define stride(n : Math) := $3n$
map id()(i : Nat) := $i$
algorithm prepare(q : Qubit[]) {
  H(q[0])
}`);
  assert.deepEqual(base.diagnostics, []);
  const middle = parseDocument('qparam Middle\nimport "base.qp"', { imports: [base] });
  const source = 'qparam Top\nimport "middle.qp"\nalgorithm run(q : Qubit[]) {\ncall prepare(q) @ id()\nX(q[stride(T[width])])\n}';
  const doc = parseDocument(source, { imports: [middle] });
  assert.deepEqual(doc.diagnostics, []);
  assert.deepEqual(doc.imports, ['middle.qp']);
  assert.equal(doc.importedDocuments[0], middle);
  assert.ok(errors(source).some(message => /Unresolved import/.test(message)));
  assert.ok(errors(source.replace('prepare(q)', 'missing(q)'), [middle]).some(message => /Unknown circuit missing/.test(message)));
  assert.ok(errors(source.replace('@ id()', '@ absent()'), [middle]).some(message => /Unknown placement map absent/.test(message)));
  assert.ok(errors(source.replace('stride(T[width])', 'absent(T[width])'), [middle]).some(message => /Unknown circuit arithmetic function absent/.test(message)));
  const invalid = parseDocument('qparam Invalid\nnot_valid');
  assert.ok(errors('qparam D\nimport "invalid.qp"', [invalid]).some(message => /has syntax or dependency errors/.test(message)));
  assert.ok(errors('qparam D', [base]).some(message => /more imports/.test(message)));
});

test('record, capacity and map mistakes receive diagnostics without accepting opaque statements', () => {
  const wrap = body => `qparam Invalid\nalgorithm run(q : Qubit[], c : Bit[], n : Nat) {\n${body}\n}`;
  const cases = [
    ['measure q[0] -> q[1]', /indexed classical Bit/],
    ['measure q[0] -> c[0..n]', /indexed classical Bit/],
    ['measure q[0] -> missing[0]', /Unknown circuit argument/],
    ['when q[0] {\n}', /indexed classical Bit/],
    ['capacity n $n$', /capacity names a Qubit or Bit/],
    ['H(q[0])\ncapacity q $n$', /before all algorithm instructions/],
    ['capacity q $n$\ncapacity q $n$', /Duplicate capacity/],
    ['controlled() {\n}', /requires at least one/],
    ['X(q[0]) @ missing()', /Unknown placement map/],
    ['RzDyadic(q[0], absent)', /Unknown circuit argument/],
    ['X(q[n div])', /Expected a natural numeral/],
  ];
  for (const [body, expected] of cases) assert.ok(errors(wrap(body)).some(message => expected.test(message)), body);
  assert.ok(errors('qparam Map\nmap shift(n : Nat)(j : Math) := $n+j$').some(message => /exactly one index of type Nat/.test(message)));
});

test('reverse loops scope their index and can shadow a document scalar without replacing it', () => {
  const doc = parseDocument(String.raw`qparam Reverse
parameter g : Nat
algorithm run(q : Qubit[], n : Nat) {
  reverse repeat g in 0..n {
    X(q[g])
  }
  X(q[g])
}`);
  assert.deepEqual(doc.diagnostics, []);
  assert.equal(doc.program.algorithms[0].body[0].direction, 'reverse');
  const nested = 'qparam Deep\nalgorithm run(q : Qubit) {\n' + 'atomic {\n'.repeat(65) + 'H(q)\n' + '}\n'.repeat(66);
  assert.ok(errors(nested).some(message => /control nesting exceeds 64/.test(message)));
});
