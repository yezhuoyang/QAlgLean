const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFormalrvMath, formalrvMath } = require('../dist/import/formalrv-math');
const { formalrvAssertionMath } = require('../dist/import/formalrv-assertions');
const { parseMath } = require('../dist/language/math');
const katex = require('katex');
const { mathMacros } = require('../dist/language/math-syntax');

function rendered(source, assertion = false) {
  const latex = assertion ? formalrvAssertionMath(source) : formalrvMath(source);
  assert.doesNotThrow(() => parseMath(latex), latex);
  assert.doesNotThrow(() => katex.renderToString(latex, { throwOnError: true, strict: 'error', macros: mathMacros }), latex);
  return latex;
}

test('FormalRV multi-letter names and table accesses remain atomic mathematical objects', () => {
  const expression = parseFormalrvMath('posStride * W + table_val[index + 1]');
  assert.equal(expression.left.left.value, 'posStride');
  assert.equal(expression.right.kind, 'index');
  assert.equal(expression.right.base.value, 'table_val');
  const latex = rendered('posStride * W + table_val[index + 1]');
  assert.match(latex, /\\operatorname\{posStride\}/);
  assert.match(latex, /\\operatorname\{table\\_val\}/);
  assert.equal(parseMath(formalrvMath('posStride')).kind, 'operator');
  assert.throws(() => formalrvMath('posStride·W'), /unexpected/);
});

test('source binders extend over their whole body and retain nested scope', () => {
  const expression = parseFormalrvMath('Σ i < n . Π j < i . a(i,j) + b(i,j)');
  assert.equal(expression.kind, 'binder');
  assert.equal(expression.variable, 'i');
  assert.equal(expression.body.kind, 'binder');
  assert.equal(expression.body.variable, 'j');
  assert.equal(expression.body.bound.value, 'i');
  assert.equal(expression.body.body.operator, '+');
  rendered('Σ i < n . Π j < i . a(i,j) + b(i,j)');
  const enclosed = parseFormalrvMath('(Σ i < n . i) + 1');
  assert.equal(enclosed.kind, 'binary');
  assert.equal(enclosed.left.kind, 'binder');
});

test('exact division, floor division, modulo and source leading-minus binding are distinct', () => {
  assert.equal(parseFormalrvMath('a / b').operator, '/');
  assert.equal(parseFormalrvMath('a // b').operator, '//');
  assert.match(rendered('a // b'), /\\lfloor/);
  assert.doesNotMatch(rendered('a / b'), /\\lfloor/);
  const leading = parseFormalrvMath('-a % n');
  assert.equal(leading.kind, 'unary');
  assert.equal(leading.value.operator, '%');
  const grouped = parseFormalrvMath('(-a) % n');
  assert.equal(grouped.kind, 'binary');
  assert.equal(grouped.left.kind, 'unary');
  rendered('-a % n');
  rendered('(-a) % n');
});

test('shift, xor, additive, multiplicative and power precedence matches FormalRV source', () => {
  const expression = parseFormalrvMath('a ⊕ b >> c + d*e^f^g');
  assert.equal(expression.operator, '⊕');
  assert.equal(expression.right.operator, '>>');
  assert.equal(expression.right.right.operator, '+');
  assert.equal(expression.right.right.right.operator, '*');
  assert.equal(expression.right.right.right.right.operator, '^');
  assert.equal(expression.right.right.right.right.right.operator, '^');
  assert.equal(parseFormalrvMath('a - b - c').left.operator, '-');
  rendered('a ⊕ b >> c + d*e^f^g');
});

test('quantifiers and logic preserve right association; comparisons cannot silently chain', () => {
  const expression = parseFormalrvMath('∀ i < n . ∃ j < m . a(i)=j ∧ j<n ∧ n<m → m>0');
  assert.equal(expression.body.operator, '∃');
  const implication = expression.body.body;
  assert.equal(implication.operator, '→');
  assert.equal(implication.left.operator, '∧');
  assert.equal(implication.left.right.operator, '∧');
  rendered('∀ i < n . ∃ j < m . a(i)=j ∧ j<n ∧ n<m → m>0');
  rendered('∀ α . ¬(a=0) ↔ a≠0');
  assert.throws(() => formalrvMath('a < b < c'), /comparisons do not chain/);
});

test('measurement parity guards are parsed indexed Boolean expressions', () => {
  const expression = parseFormalrvMath('⊕ i < W . (recordat(cb+i) ∧ Tbar[tOff+i] >> j % 2 = 1)');
  assert.equal(expression.kind, 'binder');
  assert.equal(expression.operator, '⊕');
  assert.equal(expression.body.operator, '∧');
  const latex = rendered('⊕ i < W . (c[cb+i] ∧ (Tbar[tOff+i] >> j) % 2 = 1)', true);
  assert.match(latex, /\\bigoplus/);
  assert.match(latex, /c_/);
});

test('state writers retain values, quantum locations, strided bands and mapped selectors', () => {
  const single = rendered('|z⟩_q[base]', true);
  const band = rendered('|z⟩_q[lo, hi : stride)', true);
  const mapped = rendered('|z⟩_q[map i < n . base + stride*i]', true);
  assert.match(single, /\\ket\{z\}_\{q_/);
  assert.match(band, /\\operatorname\{band\}/);
  assert.match(band, /\\operatorname\{stride\}/);
  assert.match(mapped, /\\operatorname\{map\}/);
  rendered('Σ z < 2^dim . α(z) * (|z⟩_q[0, cb) ⊗ |z >> (cb+W)⟩_q[cb+W, dim))', true);
  rendered('Pr[c[lo, hi : stride) = x] = 1', true);
  assert.throws(() => formalrvAssertionMath('|0⟩_c[0]'), /quantum register selector/);
});

test('synthetic state and probability constructors reject malformed arities or missing maps', () => {
  for (const source of [
    'ketat(x)', 'ketat(x,i,j)', 'ketband(x,lo,hi)', 'recordband(lo,hi)',
    'qat()', 'recordat(x,y)', 'probability(a,b)', 'ketmapped(x,n)', 'qmapped(n)'
  ]) assert.throws(() => formalrvMath(source), /requires/, source);
  rendered('ketmapped(x,map i<n . base+i)');
  for (const source of ['Σ i < n i', 'if a=b then x', 'f(x,)', 'a +', 'a # b']) assert.throws(() => formalrvMath(source), /FormalRV math/);
});
