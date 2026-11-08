# Literature corpus

These are editable QP programs **and assertions**, transcribed at the abstraction
levels indicated below. Open any `.qp` directly in VS Code, or use **QParam: Open
an Example**. Every formula is parsed and typeset by the same frontend. Parsing
does not establish a specification, a runtime bound, or the truth of an assumption.

| Family | Program | What is programmed | Source and boundaries |
|---|---|---|---|
| Deutsch–Jozsa / Bernstein–Vazirani | [DJ](../../examples/deutsch-jozsa.qp), [BV](../../examples/bernstein-vazirani.qp) | Hadamard layers, phase kickback, oracle call and measurement | CEMM §3, Fig. 4, in [source index](../../examples/literature/index.json); oracle access model |
| Grover | [Search](../../examples/grover.qp) | Iteration schedule and gate-level diffuser | Grover 1996 and BHMT; marking oracle remains external |
| Fourier transforms | [Coherent QFT](../../examples/qft.qp), [semiclassical QFT](../../examples/literature/semiclassical-qft.qp), [phase estimation](../../examples/literature/quantum-phase-estimation.qp) | Controlled phases, reversal, measurement feedback, repeated controlled powers | [Fourier source notes](fourier.md) |
| Amplitude methods | [QSearch](../../examples/literature/amplitude-search.qp), [amplitude estimation](../../examples/literature/amplitude-estimation.qp) | Randomized retries, two trial branches, controlled Grover iterate and estimation | [Search source notes](search-and-factoring.md) |
| Shor | [Factoring reduction](../../examples/literature/shor-factoring.qp) | Quantum sample, continued-fraction candidates, order test, gcd extraction, bounded retries | [Factoring source notes](search-and-factoring.md); arithmetic interfaces explicit |
| Gidney variants in FormalRV | [GE2021](../../examples/formalrv/ge2021.qp), [Gidney2025](../../examples/formalrv/gidney2025.qp), [fixed lanes](../../examples/formalrv/gidney2025-fixed-lanes.qp) | Full authored program and gadget bodies, imported arithmetic, original contracts and definition equations | [Exact scope and syntax](gidney.md); [source coverage](../../examples/formalrv/coverage.json) |
| Regev factoring | [Dual-lattice sampler and reduction](../../examples/literature/regev-lattice-sampling.qp) | Gaussian registers, modular product, approximate QFT, samples, lattice recovery and gcd extraction | [Regev source notes](regev.md); heuristic and synthesis boundaries explicit |
| Product formulas | [First/second order](../../examples/literature/hamiltonian-product-formulas.qp) | Two-term schedules and commutator error assertions | [Hamiltonian source notes](hamiltonian.md) |
| LCU | [Taylor simulation](../../examples/literature/lcu-taylor.qp), [block product](../../examples/literature/lcu-block-product.qp), [block sum](../../examples/literature/lcu-block-sum.qp) | Preparation, selection, uncomputation, oblivious amplification, composition | [Hamiltonian source notes](hamiltonian.md) |
| Qubitization / QSVT | [Walk](../../examples/literature/qubitization-walk.qp), [phase sequences](../../examples/literature/qsvt-phase-sequence.qp) | Signal reflection, Chebyshev walk, odd/even alternating sequences, real-part wrapper | [Hamiltonian source notes](hamiltonian.md); supplied phases and signal operators |
| Chen LWE | [Nine stages](../../examples/literature/chen-nine-stages.qp), [Step 9 obligation](../../examples/literature/chen-step9-domain-extension.qp) | Actual source operations, intermediate states, equation collection, disputed extension | [Chen source notes](chen.md); withdrawn claim, not a verified solver |

The machine-readable [source index](../../examples/literature/index.json) records
paper versions, equation/section locations, access models and omissions. It is the
paper source manifest. The separate [FormalRV coverage manifest](../../examples/formalrv/coverage.json)
records the pinned program sources and their transcription. The Chen entry distinguishes the inspected April 10 mirror
from the author's later withdrawal notice; no unobserved PDF hash is asserted.

## Read a program at the right level

`oracle` declares an external quantum operation. `classical` declares an external
classical routine. Neither supplies an implementation. Algorithm bodies expose
the orchestration between these interfaces. Regev's irreversible classical
squaring is separate from the clean quantum product interface. Controlled
amplitude estimation retains a minus sign that uncontrolled search can ignore.
Semiclassical QFT produces measurement results, not a reusable coherent state.

Each `requires`, `ensures`, `assert`, `invariant`, `probability`, and `costs` clause
is authored mathematics. An inline assertion is an obligation at that point in the
program; it is not a state simulator or a proof result. The Chen notebook purposely
retains a disputed equality as an open goal. It tests that QP can express the claim,
not that this release can detect its mathematical error.

Current gaps include mathematical name binding, dependent types, finite encoding,
unitary/ownership checks, proof certificates, runtime evaluation, semantic module linking
and verified lowering. Named operators provide syntax for paper vocabulary, not
automatic definitions. Plain adjacent letters are products; program names with
several letters need an explicit mathematical naming convention when elaboration
is added. In the source notes, aliases such as returned values and register states
are stated explicitly. See the [language reference](../language.md).

## Reproduce the syntax check

```sh
npm ci
npm run check:literature
```

The regression suite checks every gallery `.qp`, including programs in this
subdirectory, for diagnostics, mathematical ASTs, typesetting errors, export, and
source provenance. Additional checks retain important circuit structures and reject
malformed control flow. The output reports syntax coverage only. This finite corpus
is a starting coverage set, not a claim to support every quantum paper or arbitrary
LaTeX macro.
