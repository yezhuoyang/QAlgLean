const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFormalRVSource, renderFormalRVProgram, splitFormalRVArguments,
  formalRVIndex, FormalRVSyntaxError
} = require('../dist/import/formalrv-program');

test('FormalRV reader retains multiline footprints, invocations and source locations', () => {
  const source = `params n, top
map id()(i) = i
gadget add[q: top,
           c: cb + n](n, cb):
  for 0 ≤ i < n:
    helper(n, min(i + 1, n),
           T[i + 2], cb + i) @ shift(3*i)
    measure (3*i+2) ↦ c[cb+i]
spec add:
  outcomes none
`;
  const blocks = parseFormalRVSource(source, 'Arithmetic/add.prog');
  assert.deepEqual(blocks.map(block => block.kind), ['params', 'map', 'gadget', 'spec']);
  const block = blocks[2], program = block.program;
  assert.equal(block.line, 3);
  assert.deepEqual(program.capacity, { q: 'top', c: 'cb + n' });
  assert.deepEqual(program.parameters, ['n', 'cb']);
  assert.equal(program.body[0].line, 5);
  const [call, measure] = program.body[0].body;
  assert.equal(call.line, 6);
  assert.equal(call.endLine, 7);
  assert.deepEqual(call.arguments, ['n', 'min(i + 1, n)', 'T[i + 2]', 'cb + i']);
  assert.deepEqual(call.placement, { name: 'shift', arguments: ['3*i'] });
  assert.equal(measure.record, 'cb+i');
  assert.equal(measure.line, 8);
});

test('translation preserves reverse traversal, static branches, dynamic guards and controlled blocks', () => {
  const block = parseFormalRVSource(`gadget sample[q: top, c: cb + n](n, cb):
  for ((n + 1)//2) > i ≥ 0:
    if T[i] % 2 = 1:
      X(i)
    else:
      ctrl i:
        Rz(i+1, 2)
    when ⊕ b < n . (c[cb+b] ∧ T[b] = 1):
      Z(i)
`, 'sample.prog')[0];
  const rendered = renderFormalRVProgram(block, source => `M(${source})`);
  assert.match(rendered.text, /reverse repeat i in 0\.\.\(\(n \+ 1\) div 2\)/);
  assert.match(rendered.text, /if \$M\(T\[i\] % 2 = 1\)\$/);
  assert.match(rendered.text, /\} else \{/);
  assert.match(rendered.text, /controlled\(q\[i\]\) \{/);
  assert.match(rendered.text, /RzDyadic\(q\[i\+1\], 2\)/);
  assert.match(rendered.text, /when \$M\(⊕ b < n/);
  assert.deepEqual(rendered.operations.map(operation => operation.kind),
    ['for', 'if', 'gate', 'controlled', 'gate', 'when', 'gate']);
  assert.equal(rendered.operations[0].reverse, true);
});

test('translation carries shared memory, record destinations and placement through calls', () => {
  const block = parseFormalRVSource(`program main[q: top, c: cb+2]:
  worker(2, max(0, T[k])) @ shift(base)
  H(base)
  measure base ↦ c[cb+1]
`, 'main.prog')[0];
  const rendered = renderFormalRVProgram(block, source => source);
  assert.match(rendered.text, /algorithm main\(q : Qubit\[\], c : Bit\[\]\)/);
  assert.match(rendered.text, /capacity q \$top\$/);
  assert.match(rendered.text, /capacity c \$cb\+2\$/);
  assert.match(rendered.text, /call worker\(q, c, 2, max\(0, T\[k\]\)\) @ shift\(base\)/);
  assert.match(rendered.text, /measure q\[base\] -> c\[cb\+1\]/);
  assert.equal(rendered.operations.length, 3);
});

test('source reader fails closed on unknown operations and malformed nesting', () => {
  const malformed = [
    'gadget f[q: n]():\n  silently_skip_this\n',
    'gadget f[q: n]():\n  UnknownGate(0)\n',
    'gadget f[q: n]():\n  CX(0)\n',
    'gadget f[q: n]():\n  X(0) trailing\n',
    'gadget f[q: n]():\n  measure 0 ↦ unknown[1]\n',
    'gadget f[q: n]():\n  for 0 ≤ i < n:\n  H(i)\n',
    'gadget f[q: n]():\n  H(0)\n    X(1)\n',
    'gadget f[q: n]():\n  else:\n    H(0)\n',
    'gadget f[q: n]():\n  H([0))\n',
    'gadget f[q: n]():\n  H(0\n',
    'gadget f[q: n, q: m]():\n  H(0)\n',
    'gadget f[q: n](i, i):\n  H(0)\n',
    'gadget f[q: n](q):\n  H(0)\n',
    'unsupported declaration\n',
    '  H(0)\n'
  ];
  for (const source of malformed) assert.throws(() => parseFormalRVSource(source, 'bad.prog'), FormalRVSyntaxError, source);
});

test('argument splitting respects nested table accesses and rejects discarded delimiters', () => {
  assert.deepEqual(splitFormalRVArguments('x, max(y, 2), T[f(1, 2) + 3]'), ['x', 'max(y, 2)', 'T[f(1, 2) + 3]']);
  for (const source of ['x,', ',x', 'f(x]', 'T[x', 'x,,y']) assert.throws(() => splitFormalRVArguments(source));
  assert.equal(formalRVIndex('a//b + c // d'), 'a div b + c div d');
});

test('program reader rejects excessive nesting instead of exhausting the call stack', () => {
  const source = 'gadget f[q: n]():\n' + Array.from({ length: 70 }, (_, index) => '  '.repeat(index + 1) + 'for 0 ≤ i < n:\n').join('') + '  '.repeat(71) + 'H(0)\n';
  assert.throws(() => parseFormalRVSource(source), /nesting exceeds 64/);
});

test('all pinned Gidney source bodies and operations are retained, with exact source spans', () => {
  const fixture = require('./fixtures/formalrv/gidney.json');
  const counts = {}, bodies = [];
  for (const source of fixture.sources) {
    const lines = source.text.replace(/\r/g, '').split('\n');
    for (const block of parseFormalRVSource(source.text, source.path)) {
      if (!block.program) continue;
      bodies.push(block);
      for (const operation of renderFormalRVProgram(block, text => text).operations) {
        counts[operation.kind] = (counts[operation.kind] ?? 0) + 1;
        const located = lines.slice(operation.line - 1, operation.endLine).map(line => line.trim()).join(' ');
        assert.equal(operation.source, located, `${source.path}:${operation.line}`);
      }
    }
  }
  assert.equal(bodies.length, 106);
  assert.deepEqual(counts, { call: 238, gate: 139, for: 106, if: 21, measure: 20, when: 35, controlled: 1 });
});
