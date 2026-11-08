const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument, parseIndex } = require('../dist/language/document');

const example = name => parseDocument(fs.readFileSync(path.join(__dirname, '../examples', name), 'utf8'));

test('every gallery document parses into mathematical and circuit syntax, without verification claims', () => {
  for (const name of fs.readdirSync(path.join(__dirname, '../examples')).filter(name => name.endsWith('.qp'))) {
    const doc = example(name);
    assert.deepEqual(doc.diagnostics, [], name);
    for (const item of doc.sections.flatMap(section => section.items)) {
      if (item.math !== undefined) assert.ok(item.ast, `${name}: ${item.math}`);
    }
    assert.equal('verified' in doc, false);
    assert.ok(doc.sections.some(section => section.items.some(item => item.kind === 'admit')), name);
  }
});

test('QFT retains nested dependent loop bounds, angle AST, bit reversal, and adjoint call', () => {
  const doc = example('qft.qp');
  const [qft, inverse] = doc.program.algorithms;
  assert.equal(qft.body[0].kind, 'repeat');
  const nested = qft.body[0].body[1];
  assert.equal(nested.kind, 'repeat');
  assert.deepEqual(nested.from, { kind: 'arithmetic', operator: '+', left: { kind: 'variable', name: 'j' }, right: { kind: 'integer', value: '1' } });
  const phase = nested.body[0];
  assert.equal(phase.name, 'Phase');
  assert.equal(phase.modifiers[0].kind, 'controlled');
  assert.equal(phase.arguments[0].kind, 'math');
  assert.ok(phase.arguments[0].ast);
  assert.equal(qft.body[1].to.operator, '/');
  assert.equal(qft.body[1].body[0].arguments[1].index.operator, '-');
  assert.equal(inverse.body[0].kind, 'call');
  assert.deepEqual(inverse.body[0].modifiers, [{ kind: 'adjoint' }]);
});

test('Grover preserves multi-control register slices and query-loop call targets', () => {
  const doc = example('grover.qp');
  assert.equal(doc.program.oracles[0].name, 'mark');
  assert.equal(doc.program.oracles[0].opaque, true);
  const diffuse = doc.program.algorithms.find(algorithm => algorithm.name === 'diffuse');
  const controls = diffuse.body[1].modifiers[0].controls;
  assert.equal(controls[0].index.value, '0');
  assert.equal(controls[0].end.operator, '-');
  const search = doc.program.algorithms.find(algorithm => algorithm.name === 'search');
  assert.deepEqual(search.body[1].body.map(instruction => instruction.name), ['mark', 'diffuse']);
});

test('call resolution accepts forward declarations but rejects undeclared and mismatched signatures', () => {
  const source = 'qparam Test\nalgorithm caller(q : Qubit[2]) {\ncall U(q[0], q[1])\n}\noracle U(a : Qubit, b : Qubit)';
  assert.deepEqual(parseDocument(source).diagnostics, []);
  for (const [bad, message] of [
    [source.replace('call U(q[0], q[1])', 'call Missing(q)'), /Unknown circuit Missing/],
    [source.replace('call U(q[0], q[1])', 'call U(q)'), /requires 2 argument/],
    [source + '\nalgorithm U(q : Qubit) {\n}', /Duplicate circuit U/],
  ]) assert.ok(parseDocument(bad).diagnostics.some(diagnostic => message.test(diagnostic.message)), message.source);
});

test('malformed circuit arguments and nonunitary gate modifiers produce diagnostics', () => {
  for (const [instruction, message] of [
    ['controlled() X(q[0])', /at least one control/],
    ['controlled(q[0]) reset(q[1])', /not unitary/],
    ['adjoint reset(q[0])', /not unitary/],
    ['Rz(q[0], q[1])', /angle/],
    ['Phase($x$, q[0], q[1])', /requires 2/],
    ['CCX(q[0], q[1])', /requires 3/],
    ['H(q[0..1..2])', /two endpoints/],
    ['H(q[x+])', /Expected a natural/],
    ['controlled(missing) X(q[0])', /Unknown quantum register/],
    ['H(q[typo])', /Unknown circuit index/],
  ]) {
    const doc = parseDocument(`qparam Bad\nalgorithm f(q : Qubit[2]) {\n${instruction}\n}`);
    assert.ok(doc.diagnostics.some(diagnostic => message.test(diagnostic.message)), instruction);
  }
});

test('Nat arithmetic is structured, bounded, and rejects trailing tokens', () => {
  const expression = parseIndex('n-1-j*2');
  assert.equal(expression.operator, '-');
  assert.equal(expression.left.operator, '-');
  assert.equal(expression.right.operator, '*');
  assert.equal(parseIndex('2^j^k').right.operator, '^');
  assert.equal(parseIndex('-1').kind, 'negative');
  assert.equal(parseIndex('f(n)').kind, 'index-call');
  for (const source of ['n++1', 'n.x', '', '-', 'n 2', 'f(n,)']) assert.throws(() => parseIndex(source), undefined, source);
  assert.throws(() => parseIndex('('.repeat(100) + '1' + ')'.repeat(100)), /nesting/);
});

test('LWE example remains an explicit obligation notebook with no surrogate implementation', () => {
  const doc = example('lwe-obligations.qp');
  assert.deepEqual(doc.program.algorithms, []);
  assert.deepEqual(doc.program.oracles, []);
  assert.match(doc.description, /not a transcription/);
  assert.ok(doc.sections.flatMap(section => section.items).some(item => item.kind === 'admit' && item.text.includes('neither reproduces')));
});

// Small floating-point regression fixture for the two concrete gallery circuits.
// This is not a production evaluator or a proof/certificate of their semantics.
const arithmetic = (operator, left, right) => {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '*' || operator === 'multiply') return left * right;
  if (operator === '/') return left / right;
  if (operator === '^') return left ** right;
  throw new Error(`Unimplemented test arithmetic ${operator}`);
};
const indexValue = (node, env) => {
  if (node.kind === 'integer') return Number(node.value);
  if (node.kind === 'variable') { assert.ok(node.name in env); return env[node.name]; }
  if (node.kind === 'arithmetic') {
    const value = arithmetic(node.operator, indexValue(node.left, env), indexValue(node.right, env));
    return node.operator === '/' ? Math.floor(value) : value;
  }
  throw new Error(`Unimplemented test index ${node.kind}`);
};
const angleValue = (node, env) => {
  if (node.kind === 'number') return Number(node.value);
  if (node.kind === 'identifier') return node.value === '\\pi' ? Math.PI : env[node.value];
  if (node.kind === 'group' && node.elements.length === 1) return angleValue(node.elements[0], env);
  if (node.kind === 'binary') return arithmetic(node.operator, angleValue(node.left, env), angleValue(node.right, env));
  if (node.kind === 'script' && node.superscript && !node.subscript) return angleValue(node.base, env) ** angleValue(node.superscript, env);
  throw new Error(`Unimplemented test angle ${node.kind}`);
};
function runGalleryCircuit(doc, circuitName, n, basis, constants = {}) {
  const amplitudes = Array.from({ length: 2 ** n }, (_, j) => [j === basis ? 1 : 0, 0]);
  const wire = (operand, env) => {
    assert.equal(operand.name, 'q', 'this fixture only interprets the gallery q register');
    assert.ok(operand.index && !operand.end);
    const index = indexValue(operand.index, env);
    assert.ok(index >= 0 && index < n);
    return 1 << (n - 1 - index);
  };
  const run = (instructions, env) => {
    for (const instruction of instructions) {
      if (instruction.kind === 'repeat') {
        for (let j = indexValue(instruction.from, env); j < indexValue(instruction.to, env); j++) run(instruction.body, { ...env, [instruction.index]: j });
        continue;
      }
      if (instruction.kind === 'measure') continue; // Inspect the distribution immediately before measurement.
      if (instruction.kind === 'call') {
        assert.deepEqual(instruction.modifiers, []);
        if (instruction.name === 'mark') amplitudes[constants.w] = amplitudes[constants.w].map(value => -value);
        else {
          const target = doc.program.algorithms.find(algorithm => algorithm.name === instruction.name);
          assert.ok(target); run(target.body, env);
        }
        continue;
      }
      let controls = 0;
      for (const modifier of instruction.modifiers) {
        assert.equal(modifier.kind, 'controlled');
        for (const operand of modifier.controls) {
          if (operand.end) {
            for (let j = indexValue(operand.index, env); j < indexValue(operand.end, env); j++) controls |= 1 << (n - 1 - j);
          } else controls |= wire(operand, env);
        }
      }
      const gate = instruction.name;
      const target = wire(instruction.arguments[gate === 'Phase' ? 1 : 0], env);
      if (gate === 'H' || gate === 'X') {
        for (let j = 0; j < amplitudes.length; j++) {
          if ((j & target) || (j & controls) !== controls) continue;
          const k = j | target, a = amplitudes[j], b = amplitudes[k];
          if (gate === 'X') [amplitudes[j], amplitudes[k]] = [b, a];
          else {
            amplitudes[j] = [(a[0] + b[0]) / Math.SQRT2, (a[1] + b[1]) / Math.SQRT2];
            amplitudes[k] = [(a[0] - b[0]) / Math.SQRT2, (a[1] - b[1]) / Math.SQRT2];
          }
        }
      } else if (gate === 'Z' || gate === 'Phase') {
        const angle = gate === 'Z' ? Math.PI : angleValue(instruction.arguments[0].ast, env);
        for (let j = 0; j < amplitudes.length; j++) {
          if (!(j & target) || (j & controls) !== controls) continue;
          const [real, imag] = amplitudes[j];
          amplitudes[j] = [real * Math.cos(angle) - imag * Math.sin(angle), real * Math.sin(angle) + imag * Math.cos(angle)];
        }
      } else if (gate === 'SWAP') {
        const other = wire(instruction.arguments[1], env);
        for (let j = 0; j < amplitudes.length; j++) {
          if ((j & target) || !(j & other)) continue;
          const k = j ^ target ^ other;
          [amplitudes[j], amplitudes[k]] = [amplitudes[k], amplitudes[j]];
        }
      } else throw new Error(`Unimplemented test gate ${gate}`);
    }
  };
  run(doc.program.algorithms.find(algorithm => algorithm.name === circuitName).body, { n, ...constants });
  return amplitudes;
}

test('QFT example basis columns match the positive Fourier transform for 1–4 qubits', () => {
  const doc = example('qft.qp');
  for (let n = 1; n <= 4; n++) for (let x = 0; x < 2 ** n; x++) {
    const output = runGalleryCircuit(doc, 'qft', n, x);
    for (let y = 0; y < output.length; y++) {
      const angle = 2 * Math.PI * x * y / output.length;
      assert.ok(Math.abs(output[y][0] - Math.cos(angle) / Math.sqrt(output.length)) < 1e-12, `real n=${n}, x=${x}, y=${y}`);
      assert.ok(Math.abs(output[y][1] - Math.sin(angle) / Math.sqrt(output.length)) < 1e-12, `imag n=${n}, x=${x}, y=${y}`);
    }
  }
});

test('Grover example success probability matches its claim for small registers and loop counts', () => {
  const doc = example('grover.qp');
  for (let n = 2; n <= 4; n++) for (let w = 0; w < 2 ** n; w++) for (let k = 0; k <= 3; k++) {
    const output = runGalleryCircuit(doc, 'search', n, 0, { k, w });
    const actual = output[w][0] ** 2 + output[w][1] ** 2;
    const expected = Math.sin((2 * k + 1) * Math.asin(1 / Math.sqrt(2 ** n))) ** 2;
    assert.ok(Math.abs(actual - expected) < 1e-12, `n=${n}, w=${w}, k=${k}`);
  }
});
