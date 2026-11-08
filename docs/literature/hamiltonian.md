# Hamiltonian simulation and matrix transformation corpus

These six documents contain parametric programs and mathematical contracts. They
exercise authoring syntax; their assertions and costs are **not verified**.
Source versions are pinned below because theorem numbering changes between
preprints. Full text was inspected, rather than inferring implementations from
abstracts. Each specification is an authored transcription or stated derivation.

| Document | Concrete implementation | Explicit access model |
| --- | --- | --- |
| [Product formulas](../../examples/literature/hamiltonian-product-formulas.qp) | First-order and symmetric second-order steps, each repeated `r` times | Exact exponentials of two Hermitian terms |
| [Taylor LCU](../../examples/literature/lcu-taylor.qp) | Unary-order preparation, coefficient-register preparation, controlled term selection, unpreparation, two reflections, oblivious amplification, fresh segment ancillas | Coefficient-state preparation and indexed term-unitary selection |
| [Block product](../../examples/literature/lcu-block-product.qp) | Calls the right factor before the left factor using independent ancillas | Two given block encodings |
| [Block sum](../../examples/literature/lcu-block-sum.qp) | PREPARE–SELECT–unPREPARE | Exact positive coefficient preparation and coherent block selection |
| [Qubitization](../../examples/literature/qubitization-walk.qp) | Reflection gates, signal walk, repeated walk and basis changes | A Hermitian self-inverse signal oracle and its signal-state preparation |
| [QSVT](../../examples/literature/qsvt-phase-sequence.qp) | Zero-projector phase gadgets, odd/even alternating sequences, real-part interference | A square block encoding and supplied real phase values |

## Source locations and adaptations

**Product formulas.** Childs, Su, Tran, Wiebe and Zhu,
[arXiv:1912.08854v3](https://arxiv.org/pdf/1912.08854v3), §5.1,
Proposition 15, Eq. (145), and the two-term second-order bound in Eq. (150).
The `r`-step bounds are derived by unitary telescoping. The first-order program
applies `A` and then `B`, so its operator is `exp(-itB) exp(-itA)`. The symmetric
program uses `A/2`, `B`, `A/2`. Counts refer to term-exponential queries; no
claim is made about their synthesis into a fixed gate set.

**Taylor LCU.** Berry, Childs, Cleve, Kothari and Somma,
[arXiv:1412.4687v1](https://arxiv.org/pdf/1412.4687v1), Eqs. (3), (7)–(21),
and “Circuit constructions and gate counts,” pp. 3–4. The order register uses
the paper's unary encoding. Its conditional rotations are derived explicitly
from tail probabilities. Selection traverses slots backwards to preserve the
paper's operator product order. `Rz(2π)` retains the minus sign in
`A = -W R W† R W`. The outer loop discards and reinitializes ancillas. The
restriction `αt/r = ln(2)` is explicit: this file omits the paper's adjusted
last segment. Error is an asymptotic trace-norm obligation, without invented
numerical constants. The coefficient preparation remains an access primitive.

**Block arithmetic and QSVT.** Gilyén, Su, Low and Wiebe,
[arXiv:1806.01838v1](https://arxiv.org/pdf/1806.01838v1), Lemmas 52–53 for
addition and multiplication; Definition 7, Corollary 8 and Eq. (14) for the
reflection convention; Definition 15, Eq. (31), Theorem 17, Corollary 18 and
Lemma 19 for alternating phases. Addition specializes to exact positive
coefficients. Product errors retain the scale factors and distinct ancillas.
QSVT specializes to the same input/output zero-ancilla projector. Its scalar
response is defined by the phase sequence, not assumed to equal any requested
polynomial. Real-part interference explicitly uses two controlled sequences,
so its query count is twice that of a fused construction. Phase synthesis and
rectangular projectors are not implemented.

**Qubitization.** Low and Chuang,
[arXiv:1610.06546v3](https://arxiv.org/pdf/1610.06546v3), §4, Eq. (16) and
Lemma 8. The source's `S` can be the identity when the signal oracle is
self-inverse; the corresponding premises are stated. The orthogonal signal
basis uses the sign convention in Eq. (16), fixing both signs of the rotation.
Repeated walks give a Chebyshev block, a direct consequence of that rotation.
This is not the general construction of Lemma 10 or a complete optimal-time
Hamiltonian simulation compiler.

## Conventions that matter

- Program instructions execute from top to bottom. In matrix products the
  rightmost factor acts first. The indexed products here place increasing
  indices from left to right; backwards program indices preserve this order.
- `Rz(θ) = exp(-iθZ/2)`. The QSVT scratch flag starts in zero, is toggled exactly
  on the zero-ancilla subspace, receives `Rz(2θ)`, and is uncomputed. This gives
  `exp(iθ(2Π-I))` with the required sign and no discarded relative phase.
- `U`, `V`, `B`, `W` and state snapshots denote the mathematical objects named
  in the accompanying contracts. Linking them to circuit declarations and
  program points requires the future semantic elaborator.
- A query count includes an oracle inverse or a controlled invocation when the
  program calls one. These are access-model counts, not synthesized gate costs.
- Assumptions, invariant annotations and intermediate assertions are recorded
  syntax. The frontend currently neither establishes them nor executes a paper's
  algorithm on a simulator.
