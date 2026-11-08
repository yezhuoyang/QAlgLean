import { mathIdentifiers, mathBinaryCommands, mathFunctions, mathStyles, mathAccents } from '../language/math-syntax';

/** A discoverable palette: $ opens a whole math span; backslash completes within one. */
export interface Notation { name: string; label: string; latex: string; detail: string }
export const notations: Notation[] = [
  { name: 'sum', label: '∑  Indexed sum', latex: '\\sum_{${1:x}=0}^{${2:N}-1} ${3:\\alpha_x \\ket{x}}', detail: 'Finite indexed superposition or scalar sum' },
  { name: 'tensor', label: '⨂  Indexed tensor product', latex: '\\bigotimes_{${1:j}=0}^{${2:n}-1} \\ket{${3:0}}_${1:j}', detail: 'An indexed family of quantum states' },
  { name: 'ket', label: '|ψ⟩  Ket', latex: '\\ket{${1:\\psi}}', detail: 'Dirac ket notation' },
  { name: 'bra', label: '⟨ψ|  Bra', latex: '\\bra{${1:\\psi}}', detail: 'Dirac bra notation' },
  { name: 'frac', label: 'a/b  Fraction', latex: '\\frac{${1:1}}{${2:2}}', detail: 'Exact mathematical fraction' },
  { name: 'sqrt', label: '√  Square root', latex: '\\sqrt{${1:N}}', detail: 'Square root' },
  { name: 'otimes', label: '⊗  Tensor product', latex: '\\otimes', detail: 'Tensor product of states or operators' },
  { name: 'alpha', label: 'α  Alpha', latex: '\\alpha', detail: 'Complex amplitude notation' },
  { name: 'beta', label: 'β  Beta', latex: '\\beta', detail: 'Complex amplitude notation' },
  { name: 'psi', label: 'ψ  Psi', latex: '\\psi', detail: 'State symbol' },
  { name: 'phi', label: 'φ  Phi', latex: '\\phi', detail: 'State symbol' },
  { name: 'theta', label: 'θ  Theta', latex: '\\theta', detail: 'Angle symbol' },
  { name: 'omega', label: 'ω  Omega', latex: '\\omega', detail: 'Root-of-unity symbol' },
  { name: 'pi', label: 'π  Pi', latex: '\\pi', detail: 'Pi' },
  { name: 'mapsto', label: '↦  State transformation', latex: '\\mapsto', detail: 'Maps to' },
  { name: 'dagger', label: '†  Adjoint', latex: '^{\\dagger}', detail: 'Conjugate transpose' },
  { name: 'forall', label: '∀  Universal quantifier', latex: '\\forall ${1:x} \\in ${2:S}, ${3:P(x)}', detail: 'Explicit quantified mathematical claim' },
  { name: 'le', label: '≤  At most', latex: '\\le', detail: 'Upper bound' },
  { name: 'ge', label: '≥  At least', latex: '\\ge', detail: 'Lower bound' },
  { name: 'braket', label: '⟨φ|ψ⟩  Inner product', latex: '\\braket{${1:\\phi}}{${2:\\psi}}', detail: 'Bra-ket inner product' },
  { name: 'ketbra', label: '|ψ⟩⟨φ|  Outer product', latex: '\\ketbra{${1:\\psi}}{${2:\\phi}}', detail: 'Rank-one operator or pure-state density matrix' },
  { name: 'norm', label: '‖A‖  Norm', latex: '\\norm{${1:A}}_{${2:2}}', detail: 'Norm with an explicit norm index' },
  { name: 'abs', label: '|a|  Absolute value', latex: '\\abs{${1:a}}', detail: 'Scalar magnitude or cardinality, resolved by future typing' },
  { name: 'Pr', label: 'Pr  Probability', latex: '\\Pr_{${1:x}\\sim ${2:D}}[${3:P(x)}]', detail: 'Probability with an explicit sampling distribution' },
  { name: 'conditional', label: 'Pr[A | B]  Conditional probability', latex: '\\Pr[${1:A}\\mid ${2:B}]', detail: 'Conditioning event remains an explicit mathematical claim' },
  { name: 'int', label: '∫  Integral', latex: '\\int_{${1:0}}^{${2:t}} ${3:H(s)}\\,\\mathrm{d}${4:s}', detail: 'Integral with bounds and a written differential' },
  { name: 'matrix', label: 'Matrix', latex: '\\begin{bmatrix} ${1:a} & ${2:b} \\\\ ${3:c} & ${4:d} \\end{bmatrix}', detail: 'A structural matrix with explicit rows and columns' },
  { name: 'cases', label: 'Piecewise definition', latex: '\\begin{cases} ${1:1} & ${2:x=0} \\\\ ${3:0} & \\text{otherwise} \\end{cases}', detail: 'A value and condition for each case' },
  { name: 'aligned', label: 'Aligned equations', latex: '\\begin{aligned} ${1:a} &= ${2:b} \\\\ ${3:c} &= ${4:d} \\end{aligned}', detail: 'Readable aligned mathematical statements' },
  { name: 'set', label: '{x | P(x)}  Set builder', latex: '\\set{${1:x}\\in ${2:S}}{${3:P(x)}}', detail: 'A set expression and its predicate' },
  { name: 'operatorname', label: 'Named mathematical operator', latex: '\\operatorname{${1:poly}}(${2:n})', detail: 'An extensible named operator; typing and definition are separate obligations' },
  { name: 'mathbb', label: 'ℂ  Blackboard type or set', latex: '\\mathbb{${1:C}}', detail: 'Number systems, spaces, and probability notation' },
  { name: 'mathcal', label: '𝒪  Calligraphic symbol', latex: '\\mathcal{${1:O}}(${2:n})', detail: 'Asymptotic or named mathematical notation' },
  { name: 'mathbf', label: 'Bold vector', latex: '\\mathbf{${1:x}}', detail: 'Vector and matrix symbols' },
  { name: 'hat', label: 'x̂  Hat accent', latex: '\\hat{${1:H}}', detail: 'Operators and Fourier-domain quantities' },
  { name: 'tilde', label: 'x̃  Tilde accent', latex: '\\widetilde{${1:O}}(${2:n})', detail: 'Approximations or soft asymptotic notation' },
  { name: 'pmod', label: '(mod N)  Congruence modulus', latex: '\\pmod{${1:N}}', detail: 'Attach a modulus to a congruence expression' },
  { name: 'floor', label: '⌊x⌋  Floor', latex: '\\lfloor ${1:x} \\rfloor', detail: 'Integral rounding down' },
  { name: 'ceil', label: '⌈x⌉  Ceiling', latex: '\\lceil ${1:x} \\rceil', detail: 'Integral rounding up' },
  { name: 'exists', label: '∃  Existential quantifier', latex: '\\exists ${1:x}\\in ${2:S}, ${3:P(x)}', detail: 'Explicit existence claim' },
];

// Keep the full symbol palette in sync with the parser without maintaining a second whitelist.
const namedNotations = new Set(notations.map(notation => notation.name));
for (const name of [...mathIdentifiers, ...Object.keys(mathBinaryCommands)]) {
  if (!namedNotations.has(name)) notations.push({ name, label: `\\${name}`, latex: `\\${name}`, detail: 'Supported mathematical symbol' });
}
for (const name of [...mathFunctions, ...mathStyles, ...mathAccents]) {
  if (notations.some(notation => notation.name === name)) continue;
  const argument = mathFunctions.has(name) ? '(${1:x})' : '{${1:x}}';
  notations.push({ name, label: `\\${name}`, latex: `\\${name}${argument}`, detail: 'Supported mathematical function or styled symbol' });
}

/** Track mathematical context without interpreting dollars in prose or comments. */
export function insideMath(prefix: string): boolean {
  let math = false;
  let quoted = false;
  let comment = false;
  for (let i = 0; i < prefix.length; i++) {
    const character = prefix[i];
    if (comment) {
      if (character === '\n') comment = false;
      continue;
    }
    // Consume escaped characters as pairs, including escaped quotes and dollars.
    if (character === '\\') { i++; continue; }
    if (quoted) {
      if (character === '"') quoted = false;
      continue;
    }
    if (!math && character === '/' && prefix[i + 1] === '/') {
      comment = true;
      i++;
    } else if (!math && character === '"') quoted = true;
    else if (character === '$') math = !math;
  }
  return math;
}
