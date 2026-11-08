const test = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');
const fs = require('node:fs');
const path = require('node:path');
const { parseMath, MathSyntaxError, toMathLatex } = require('../dist/language/math');
const { mathMacros, latexMathPreamble } = require('../dist/language/math-syntax');
const { parseDocument } = require('../dist/language/document');
const { exportLatex } = require('../dist/editor/latex');
const { notations } = require('../dist/editor/notation');

// These are notation fixtures, not proofs or claims of complete algorithm implementations.
const formulas = {
  deutschJozsa: String.raw`\frac{1}{2^n}\sum_{x\in\{0,1\}^n}(-1)^{f(x)}\ket{x}`,
  bernsteinVazirani: String.raw`f(x)=s\cdot x\bmod 2`,
  grover: String.raw`\sin^{2}((2r+1)\arcsin(\sqrt{M/N}))`,
  roundedGroverIterations: String.raw`r=\lfloor\frac{\pi}{4}\sqrt{N/M}\rfloor`,
  fourier: String.raw`\frac{1}{\sqrt{N}}\sum_{y=0}^{N-1}\exp(2\pi i x y/N)\ket{y}`,
  orderFinding: String.raw`a^r\equiv 1\pmod{N}`,
  coprimality: String.raw`\operatorname{gcd}(a,N)=1`,
  rationalApproximation: String.raw`\abs{\frac{y}{Q}-\frac{s}{r}}\le\frac{1}{2r^{2}}`,
  hamiltonian: String.raw`U(t)=\mathcal{T}\exp(-i\int_{0}^{t}H(s)\,\mathrm{d}s)`,
  schrodinger: String.raw`i\hbar\frac{\partial}{\partial t}\ket{\psi(t)}=\hat{H}\ket{\psi(t)}`,
  blockEncoding: String.raw`\norm{A-\alpha(\bra{0}^{\otimes a}\otimes I)U(\ket{0}^{\otimes a}\otimes I)}\le\epsilon`,
  densityOperator: String.raw`\rho=\sum_{j=0}^{m-1}p_j\ketbra{\psi_j}{\psi_j}`,
  traceDistance: String.raw`\frac{1}{2}\norm{\rho-\sigma}_{1}\le\epsilon`,
  positiveOperator: String.raw`\rho\succeq 0\land\Tr(\rho)=1`,
  conditionalProbability: String.raw`\Pr_{x\sim D}[P(x)\mid E]\ge 1-\epsilon`,
  gaussian: String.raw`\rho_s(\mathbf{x})=\exp(-\pi\norm{\mathbf{x}}_{2}^{2}/s^{2})`,
  latticeCoset: String.raw`\Lambda_q^{\perp}(A)=\set{\mathbf{x}\in\mathbb{Z}^m}{A\mathbf{x}=0\pmod{q}}`,
  lweDistribution: String.raw`\mathbf{b}=A\mathbf{s}+\mathbf{e}\pmod{q}`,
  assumptions: String.raw`\forall x\in S,\exists y\in T,P(x,y)\implies Q(x)`,
  queryBound: String.raw`Q\in\widetilde{\mathcal{O}}(\alpha t\log(1/\epsilon))`,
  tensorPreparation: String.raw`\bigotimes_{j=0}^{n-1}\ket{0}_j=\ket{0}^{\otimes n}`,
  innerProduct: String.raw`\ip{\mathbf{x}}{\mathbf{y}}=\sum_{j=0}^{n-1}\bar{x}_j y_j`,
  hadamardMatrix: String.raw`H=\frac{1}{\sqrt{2}}\begin{bmatrix}1&1\\1&-1\end{bmatrix}`,
  cases: String.raw`\delta_{x,y}=\begin{cases}1&x=y\\0&\text{otherwise}\end{cases}`,
  aligned: String.raw`\begin{aligned}U^{\dagger}U&=I\\\norm{U\ket{\psi}}&=\norm{\ket{\psi}}\end{aligned}`,
  nativeDirac: String.raw`\left|\psi\right\rangle\left\langle\psi\right|`,
  plainDirac: String.raw`|\psi\rangle\langle\phi|`,
  rawInnerProduct: String.raw`\langle\phi|\psi\rangle`,
  unicodeDirac: String.raw`|ψ⟩⟨φ|`,
  visibleNorm: String.raw`\left\lVert A\right\rVert_{2}\le\lceil t\rceil`,
  numberSystems: String.raw`\mathbb{N}\subseteq\mathbb{Z}\subseteq\mathbb{R}\subseteq\mathbb{C}`,
  setExpression: String.raw`(A\cup B)\setminus(A\cap B)`,
  higherRoot: String.raw`\sqrt[n]{x}=x^{1/n}`,
};

test('representative quantum algorithm and specification notation has both an AST and a safe rendering', () => {
  for (const [name, source] of Object.entries(formulas)) {
    let ast;
    assert.doesNotThrow(() => { ast = parseMath(source); }, `${name}: ${source}`);
    assert.equal(ast.start, 0, name);
    assert.equal(ast.end, source.length, name);
    const html = katex.renderToString(source, { macros: { ...mathMacros }, throwOnError: true, strict: 'error', trust: false });
    assert.ok(html.includes('katex'), name);
  }
});

test('matrices, cases, named operators, tensor powers, and accents retain structural information', () => {
  const matrix = parseMath(String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`);
  assert.equal(matrix.kind, 'table');
  assert.equal(matrix.environment, 'pmatrix');
  assert.deepEqual(matrix.rows.map(row => row.map(cell => cell.value)), [['a', 'b'], ['c', 'd']]);
  const piecewise = parseMath(String.raw`\begin{cases}1&x=0\\0&\text{otherwise}\end{cases}`);
  assert.equal(piecewise.rows[0][1].operator, '=');
  assert.equal(piecewise.rows[1][1].kind, 'text');
  const operator = parseMath(String.raw`\operatorname{poly}(n)`);
  assert.equal(operator.kind, 'application');
  assert.equal(operator.function.kind, 'operator');
  assert.equal(operator.function.value, 'poly');
  const power = parseMath(String.raw`\ket{0}^{\otimes n}`);
  assert.equal(power.superscript.elements[0].operator, 'tensor-power');
  assert.equal(parseMath(String.raw`\hat{H}`).style, 'hat');
  assert.equal(parseMath(String.raw`\set{x\in S}{P(x)}`).kind, 'set-builder');
  assert.equal(parseMath(String.raw`\ketbra{a}{b}`).kind, 'outer-product');
  assert.equal(parseMath(String.raw`\sqrt[3]{x}`).degree.elements[0].value, '3');
});

test('probabilities and trigonometric powers keep their scripts on the function', () => {
  const probability = parseMath(String.raw`\Pr_{x\sim D}[P(x)\mid E]`);
  assert.equal(probability.kind, 'function');
  assert.equal(probability.name, 'Pr');
  assert.equal(probability.subscript.elements[0].operator, 'similar');
  assert.equal(probability.argument.elements[0].operator, 'such-that');
  const sine = parseMath(String.raw`\sin^{2}(x)`);
  assert.equal(sine.superscript.elements[0].value, '2');
  assert.equal(sine.argument.elements[0].value, 'x');
});

test('matrix shape errors, hidden TeX, malformed environments, and invisible macro injection are rejected', () => {
  for (const source of [
    String.raw`\begin{bmatrix}a&b\\c\end{bmatrix}`,
    String.raw`\begin{cases}a\\b\end{cases}`,
    String.raw`\begin{matrix}\end{matrix}`,
    String.raw`\begin{matrix}a&\end{matrix}`,
    String.raw`\begin{matrix}a\end{pmatrix}`,
    String.raw`\begin{array}{cc}a&b\end{array}`,
    String.raw`\text{\input{secret}}`,
    String.raw`\operatorname{\def\x{x}}`,
    String.raw`\operatorname{not_a_plain_name}(x)`,
    String.raw`\left\lVert x\right)`,
    String.raw`\Pr_{x}_{y}[P(x)]`,
    String.raw`\otimes n`,
  ]) assert.throws(() => parseMath(source), MathSyntaxError, source);
});

test('ASCII relation aliases preserve the meaning of the rendered mathematics', () => {
  assert.equal(toMathLatex('x <= y => z != 0'), String.raw`x \le  y \implies  z \ne  0`);
  assert.equal(toMathLatex(String.raw`x\ge 0+\text{a!=b}`), String.raw`x\ge 0+\text{a!=b}`);
  const paper = exportLatex(parseDocument('qparam Alias\nassume bound : $x >= 1$'));
  assert.ok(paper.includes(String.raw`x \ge  1`));
});

test('gallery math parses, renders, and exports with the same fixed macro vocabulary', () => {
  const folder = path.join(__dirname, '../examples');
  for (const name of fs.readdirSync(folder).filter(name => name.endsWith('.qp'))) {
    const document = parseDocument(fs.readFileSync(path.join(folder, name), 'utf8'));
    assert.deepEqual(document.diagnostics, [], name);
    const paper = exportLatex(document);
    for (const macro of latexMathPreamble) assert.ok(paper.includes(macro));
    for (const item of document.sections.flatMap(section => section.items)) {
      if (item.math !== undefined) {
        assert.ok(item.ast, `${name}: ${item.math}`);
        assert.doesNotThrow(() => katex.renderToString(item.math, { macros: { ...mathMacros }, throwOnError: true, strict: 'error', trust: false }), name);
      }
    }
  }
});

test('completion palette contains no duplicate names and includes the expanded families', () => {
  assert.equal(new Set(notations.map(item => item.name)).size, notations.length);
  for (const name of ['matrix', 'cases', 'norm', 'Pr', 'int', 'ketbra', 'set', 'operatorname', 'pmod', 'oplus', 'varepsilon', 'hbar']) {
    assert.ok(notations.some(item => item.name === name), name);
  }
});
