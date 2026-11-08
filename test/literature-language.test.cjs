const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDocument } = require('../dist/language/document.js');

function parse(body, declarations = '') {
  return parseDocument(`qparam Literature\n${declarations}\nalgorithm run(n : Nat) -> Math {\n${body}\n}`);
}

test('classical literature control flow retains guards, calls, results, and loop obligations', () => {
  const source = String.raw`qparam ClassicalControl
classical sample(N : Nat) -> Nat
classical gcd(a : Nat, b : Nat) -> Nat
algorithm try_factor(N : Nat) -> Nat {
  var k : Nat := $0$
  while $k < N$ {
    invariant $0 \le k \le N$
    let a : Nat := call sample(N)
    let d : Nat := call gcd(a, N)
    if $1 < d < N$ {
      assert $d \mid N$
      return $d$
    } else {
      set k := $k + 1$
    }
  }
  return $1$
}`;
  const document = parseDocument(source);
  assert.deepEqual(document.diagnostics, []);
  assert.equal(document.parserVersion, '0.4');
  assert.equal(document.program.classicals.length, 2);
  assert.ok(document.program.classicals.every(item => item.opaque && item.body.length === 0));
  const algorithm = document.program.algorithms[0];
  assert.deepEqual(algorithm.result, { type: 'Nat' });
  const loop = algorithm.body[1];
  assert.equal(loop.kind, 'while');
  assert.equal(loop.condition.source, 'k < N');
  assert.equal(loop.body[0].kind, 'invariant');
  assert.deepEqual(loop.body[1].value, { kind: 'classical-call', name: 'sample', arguments: [{ kind: 'register', name: 'N' }] });
  const branch = loop.body[3];
  assert.equal(branch.kind, 'if');
  assert.deepEqual(branch.then.map(item => item.kind), ['assert', 'return']);
  assert.deepEqual(branch.otherwise.map(item => item.kind), ['set']);
  assert.equal(branch.otherwise[0].name, 'k');
  assert.equal('verified' in branch.then[0], false);
});

test('allocation, reset, discard, measured results, and classical arrays are distinct syntax', () => {
  const source = String.raw`qparam Hybrid
parameter bits : Bit[4]
parameter A : Math
classical decode(y : Bit[4]) -> Math
algorithm prepare(n : Nat) -> Math {
  allocate q : Qubit[n]
  repeat j in 0..n {
    invariant $\norm{\ket{\psi}}=1$
    H(q[j])
  }
  reset(q[0])
  measure q -> y
  let result : Math := call decode(y)
  discard q
  return $result$
}`;
  const document = parseDocument(source);
  assert.deepEqual(document.diagnostics, []);
  const body = document.program.algorithms[0].body;
  assert.deepEqual(body.map(item => item.kind), ['allocate', 'repeat', 'gate', 'measure', 'let', 'discard', 'return']);
  assert.equal(body[2].name, 'reset');
  assert.equal(body[3].result, 'y');
  assert.deepEqual(body[5].operand, { kind: 'register', name: 'q' });
  assert.equal(document.program.classicals[0].parameters[0].type, 'Bit');
});

test('control scopes reject escaped names, shadowing, and mutation of immutable locals', () => {
  const cases = [
    ['let x : Nat := $0$\nset x := $1$', /declare a mutable local with var/],
    ['set absent := $1$', /Unknown mutable local/],
    ['let n : Nat := $0$', /already active/],
    ['var n : Nat := $0$', /already active/],
    ['repeat j in 0..n {\n}\nallocate q : Qubit[j]', /Unknown circuit index j/],
    ['if $n > 0$ {\nallocate q : Qubit[n]\n}\nH(q[0])', /Unknown (quantum register|circuit argument) q/],
    ['if $n > 0$ {\nlet x : Nat := $0$\n} else {\ncall consume(x)\n}', /Unknown circuit argument x/],
    ['allocate q : Qubit[n]\nmeasure q -> y\nmeasure q -> y', /already active/],
    ['repeat j in 0..n {\nrepeat j in 0..n {\n}\n}', /Loop index j is already active/],
  ];
  for (const [body, pattern] of cases) {
    const document = parse(body, 'oracle consume(x : Nat)');
    assert.ok(document.diagnostics.some(item => pattern.test(item.message)), body);
  }
  assert.deepEqual(parse('if $n > 0$ {\nlet x : Nat := $0$\n} else {\nlet x : Nat := $1$\n}\nlet x : Nat := $2$').diagnostics, []);
});

test('bad classical signatures, call kinds, arities, and duplicate callable names are diagnosed', () => {
  const cases = [
    ['classical f(q : Qubit) -> Nat', '', /classical external signature uses classical values/],
    ['classical f() -> Qubit', '', /classical external signature uses classical values/],
    ['classical f() -> Alien', '', /Expected Qubit/],
    ['classical f() -> Nat', 'call f()', /returns a value/],
    ['classical f(x : Nat) -> Nat', 'let y : Nat := call f()', /requires 1 argument/],
    ['', 'let y : Nat := call missing()', /Unknown value-returning/],
    ['oracle f(q : Qubit)', 'let y : Nat := call f($0$)', /Unknown value-returning/],
    ['classical f() -> Nat\noracle f()', '', /Duplicate circuit f/],
  ];
  for (const [declarations, body, pattern] of cases) {
    const document = parse(body, declarations);
    assert.ok(document.diagnostics.some(item => pattern.test(item.message)), `${declarations}\n${body}`);
  }
  const document = parse('let result : Nat := call recover(n)', 'algorithm recover(n : Nat) -> Nat {\nreturn $n$\n}');
  assert.deepEqual(document.diagnostics, []);
});

test('malformed control flow and misplaced obligations have useful diagnostics', () => {
  const cases = [
    ['invariant $n > 0$', /inside a repeat or while/],
    ['} else {', /else must immediately continue/],
    ['if $n > 0$ {\n} else {\n} else {\n}', /else must immediately continue/],
    ['if n > 0 {\n}', /delimited by/],
    ['while $n > 0$ {', /Unclosed algorithm/],
    ['let x : Qubit := $0$', /Use allocate/],
    ['allocate x : Nat', /allocate requires Qubit/],
    ['controlled(q) discard q', /Unknown quantum register|Unsupported program/],
    ['let x : Alien[3] := $0$', /Expected Qubit/],
  ];
  for (const [body, pattern] of cases) {
    const document = parse(body);
    assert.ok(document.diagnostics.some(item => pattern.test(item.message)), body);
  }
  assert.ok(parseDocument('qparam R\nalgorithm r() {\nreturn $0$\n}').diagnostics.some(item => /requires an algorithm result type/.test(item.message)));
});

test('multiline inline assertions retain source coordinates and structured mathematical content', () => {
  const source = String.raw`qparam Assertions
algorithm prepare(q : Qubit) {
  assert $
    \norm{\ket{\psi}}=1
  $
  H(q)
}`;
  const document = parseDocument(source);
  assert.deepEqual(document.diagnostics, []);
  const item = document.sections[0].items[0];
  assert.equal(item.kind, 'assert');
  assert.equal(item.mathLine, 2);
  assert.equal(item.mathColumn, 10);
  assert.equal(document.program.algorithms[0].body[0].expression.ast.kind, 'binary');
  const bad = parseDocument(source.replace('\\norm', '\\unknown'));
  assert.ok(bad.diagnostics.some(item => item.line === 3 && item.column === 4));
});

test('mathematical values deliberately remain untyped authoring expressions', () => {
  const document = parse('let object : Math := $A$\nassert $unknown = unknown$\nreturn $object$');
  assert.deepEqual(document.diagnostics, []);
  assert.equal(document.program.algorithms[0].body[0].value.ast.kind, 'identifier');
  assert.equal('checked' in document.program.algorithms[0], false);
  assert.equal('verified' in document, false);
});
