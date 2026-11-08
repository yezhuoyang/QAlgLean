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
  { name: 'ge', label: '≥  At least', latex: '\\ge', detail: 'Lower bound' }
];

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
