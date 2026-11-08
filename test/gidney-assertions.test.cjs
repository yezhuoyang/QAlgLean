const test = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');
const fixture = require('./fixtures/formalrv/gidney.json');
const { parseFormalRVSource } = require('../dist/import/formalrv-program');
const {
  parseFormalrvSpec, transcribeFormalrvSpec, formalrvAssertionExpression,
  formalrvAssertionMath, parseFormalrvDefinition, transcribeFormalrvDefinition,
} = require('../dist/import/formalrv-assertions');
const { parseMath, toMathLatex } = require('../dist/language/math');
const { mathMacros } = require('../dist/language/math-syntax');

const blocks = fixture.sources.flatMap(source => parseFormalRVSource(source.text, source.path));

test('Gidney contracts retain universal scope, state premises, outcomes and separate counters', () => {
  const source = `spec correction:
  ∀ i < W . ∀α .
  requires 0 < W ∧ cb + W ≤ dim
  assumes {{ Σ z < 2^dim . α(z) * |z⟩_q[0, dim) }}
  ensures {{ Σ z < 2^dim . α(z) * (|z⟩_q[0, cb) ⊗ |z >> (cb+W)⟩_q[cb+W,dim)) }}
  outcomes Pr[ c[i] = 1 ] = 1/2
  resource { meas: W, toffoli: 0, clifford: 2*W + 3*2^kL*2^kH }`;
  const parsed = parseFormalrvSpec(source);
  assert.deepEqual(parsed.binders, ['i < W', 'α']);
  assert.deepEqual(parsed.clauses.map(clause => clause.kind), ['requires', 'assumes', 'ensures', 'outcomes', 'resource']);
  assert.deepEqual(parsed.clauses.at(-1).entries.map(entry => entry.name), ['meas', 'toffoli', 'clifford']);
  const output = transcribeFormalrvSpec(source);
  assert.equal((output.match(/  requires /g) || []).length, 2);
  assert.match(output, /  bind \$/);
  assert.match(output, /  assumes \$/);
  assert.match(output, /  outcomes \$/);
  assert.match(output, /  resource meas := \$/);
  assert.doesNotMatch(output, /\bassume\b|\badmit\b/);
});

test('Gidney quantum bands and classical records retain their bounds and strides', () => {
  assert.equal(formalrvAssertionExpression('|s⟩_q[accBase+1, accBase+3*maskBits+1 : 3)'),
    'ketband(s,accBase+1,accBase+3*maskBits+1,3)');
  assert.equal(formalrvAssertionExpression('|0⟩_q[accBase+3*(f+1)+1]'),
    'ketat(0,accBase+3*(f+1)+1)');
  assert.equal(formalrvAssertionExpression('Pr[ recover(c[base,base+n), c[i]) ] ≥ 1/2'),
    'probability( recover(recordband(base,base+n,1), recordat(i)) ) ≥ 1/2');
  assert.equal(formalrvAssertionExpression('q[lo,hi : 3)'), 'qband(lo,hi,3)');
  assert.equal(formalrvAssertionExpression('|+⟩_q[0]'), 'ketat(plusstate,0)');
  assert.equal(formalrvAssertionExpression('|−⟩_q[0,n)'), 'ketband(minusstate,0,n,1)');
  assert.equal(formalrvAssertionExpression('|rec⟩_q[map t < count . position(t)]'),
    'ketmapped(rec,map t < count . position(t))');
  assert.equal(formalrvAssertionExpression('c[map t < count . position(t)-top]'),
    'recordmapped(map t < count . position(t)-top)');
  assert.throws(() => formalrvAssertionExpression('|z⟩'), /register selector/);
  assert.throws(() => formalrvAssertionExpression('|z⟩_q[0,n]'), /band must/);
  assert.throws(() => formalrvAssertionExpression('|z⟩_q[0,n : )'), /Malformed band/);
  assert.throws(() => formalrvAssertionExpression('Pr[c[i] = 1'), /Unclosed/);
});

test('measurement-conditioned state claims keep the given event attached', () => {
  const conditional = blocks.filter(block => block.kind === 'spec')
    .flatMap(block => parseFormalrvSpec(block.source).clauses.filter(clause => clause.condition));
  assert.equal(conditional.length, 6);
  assert.ok(conditional.every(clause => clause.kind === 'ensures'));
  const source = 'spec measure:\n  ensures {{ |m⟩_q[slot] }} given c[slot-top,slot+1-top) = m\n  outcomes none';
  const output = transcribeFormalrvSpec(source);
  assert.match(output, /ensures \$[^$]+\$ given \$[^$]+\$/);
  assert.doesNotMatch(output, /requires|assumes/);
});

test('splitting preconditions never moves conjuncts out of quantifiers or implications', () => {
  for (const condition of [
    '∀ i < n . p(i) = 1 ∧ q(i) = 2',
    'p = 1 → q = 2 ∧ r = 3',
    'if x = 0 then p = 1 ∧ q = 2 else r = 3',
  ]) {
    const result = transcribeFormalrvSpec(`spec f:\n  requires ${condition}`);
    assert.equal((result.match(/  requires /g) || []).length, 1, condition);
    assert.ok(result.includes(formalrvAssertionMath(condition)));
  }
  const result = transcribeFormalrvSpec('spec f:\n  requires (p = 1 ∧ q = 2) ∧ (∀ i < n . r(i) = 3 ∧ s(i) = 4)');
  assert.equal((result.match(/  requires /g) || []).length, 3);
  assert.ok(result.includes(formalrvAssertionMath('∀ i < n . r(i) = 3 ∧ s(i) = 4')));
});

test('all pinned Gidney contracts and definition equations have mathematical syntax and render', () => {
  const specs = blocks.filter(block => block.kind === 'spec');
  const definitions = blocks.filter(block => block.kind === 'define');
  assert.equal(specs.length, 104);
  assert.equal(definitions.length, 284);
  for (const block of [...specs, ...definitions]) {
    const output = block.kind === 'spec'
      ? transcribeFormalrvSpec(block.source)
      : transcribeFormalrvDefinition(block.source);
    assert.ok(output.length, `${block.path}:${block.line}`);
    for (const match of output.matchAll(/\$([^$]+)\$/g)) {
      assert.doesNotThrow(() => {
        parseMath(match[1]);
        katex.renderToString(toMathLatex(match[1]), { macros: mathMacros, throwOnError: true, strict: 'error', trust: false, maxExpand: 10000 });
      }, `${block.path}:${block.line} ${block.name}`);
    }
  }
});

test('absent source postconditions and outcomes none are not upgraded to claims', () => {
  const contract = blocks.find(block => block.kind === 'spec' && block.name === 'gRestLane');
  assert.ok(contract);
  const parsed = parseFormalrvSpec(contract.source);
  assert.ok(!parsed.clauses.some(clause => clause.kind === 'ensures'));
  const output = transcribeFormalrvSpec(contract.source);
  assert.match(output, /outcomes none/);
  assert.doesNotMatch(output, /ensures|assumes|admit/);
});

test('definition recursion patterns and conditional arithmetic are preserved', () => {
  const definition = parseFormalrvDefinition('define rwFold(p+1, gSep, pieceLen, R, pc, z) = if p < pc then z else 0');
  assert.equal(definition.name, 'rwFold');
  assert.deepEqual(definition.patterns, ['p+1', 'gSep', 'pieceLen', 'R', 'pc', 'z']);
  assert.equal(definition.rhs, 'if p < pc then z else 0');
  assert.doesNotThrow(() => parseMath(formalrvAssertionMath(definition.rhs)));
});

test('malformed contract records, missing state wrappers and unknown prefixes are rejected', () => {
  assert.throws(() => parseFormalrvSpec('spec f:\n  resource { t: 1, t: 2 }'), /Duplicate resource/);
  assert.throws(() => parseFormalrvSpec('spec f:\n  assumes |0⟩_q[0,n)'), /Expected \{\{ state/);
  assert.throws(() => parseFormalrvSpec('spec f:\n  forall x\n  requires x = 0'), /Unrecognized contract prefix/);
  assert.throws(() => parseFormalrvSpec('spec f:\n  ∀ x\n  requires x = 0'), /binder must end/);
  assert.throws(() => parseFormalrvSpec('spec f:\n  resource { t: }'), /Malformed resource/);
  assert.throws(() => parseFormalrvDefinition('define f(x) ='), /right-hand side/);
});
