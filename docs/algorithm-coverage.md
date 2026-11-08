# Algorithm and notation coverage

The gallery exercises one mathematical parser and one parametric circuit syntax
tree. **All formulas are unverified.** A parsed example is neither a running
quantum implementation nor a correctness/resource certificate.

| Example | Present circuit description | Mathematical coverage | Still required |
|---|---|---|---|
| [Bell](../examples/bell.qp) | H, CX | Kets, normalization, tensor product | Gate semantics and Hoare proof |
| [Fourier notebook](../examples/fourier.qp) | Uniform-state H layer | Indexed sums/tensors, complex phases | The Fourier expression is a separate definition, not this circuit's output |
| [Deutsch–Jozsa](../examples/deutsch-jozsa.qp) | H/X layers and one declared oracle call | Promise, bitstrings, parity interference, measurement probability | Oracle implementation/contract, bitstring interpretation and correctness proof |
| [Bernstein–Vazirani](../examples/bernstein-vazirani.qp) | H/X layers and one declared parity oracle call | Hidden string, modular inner product, character orthogonality | Instance-specific oracle implementation and exact-recovery proof |
| [Grover](../examples/grover.qp) | Parameterized loop and H/X/multi-controlled-Z diffuser; external marking oracle | Rotation angle, exact success probability, query count | Oracle, control decomposition, invariant and resource proofs |
| [QFT](../examples/qft.qp) | Nested H/controlled-Phase loops, bit reversal, adjoint call | Fourier phases, floor, logical gate counts | Register order/phase semantics, adjoint expansion, correctness and counts |
| [Shor order finding](../examples/shor-order-finding.qp) | Controlled power schedule with **external** modular arithmetic and inverse QFT | Coprimality, residues, powers, order prerequisite | Reversible arithmetic, QFT contract, success bound, continued fractions, repetitions, factoring reduction, resource proofs |
| [Hamiltonian/block encoding](../examples/hamiltonian-block-encoding.qp) | **External** simulation/encoding interfaces; a controlled U/U† echo | Operator norms, adjoints, projected blocks, time evolution | Actual encoding, phase synthesis, QSVT/qubitization implementation, approximation/resource proofs |
| [LWE obligations](../examples/lwe-obligations.qp) | **No algorithm** | Modular vector equation, complex Gaussian, infinite sum, normalization/success obligations | Faithful paper transcription, finite encoding/truncation and every transformation/proof |

Query circuits are separate from the cost of implementing their oracles.
`oracle U(...)` supplies no decomposition, contract proof or cost. The `costs`
clauses are authored statements, not calculated results. A query count cannot
be reported as an end-to-end runtime.

## Circuit conventions

The QFT uses `q[0]` as the most significant bit and
`Phase(θ) = diag(1, exp(iθ))`. Final swaps reverse wire order. Natural floor
division in `0..n/2` gives exactly `floor(n/2)` swaps. These are documented
conventions awaiting formal semantics, not facts established by the frontend.

The Grover diffuser is `H^n X^n C^(n-1)Z X^n H^n`, equal to the negative of
`2|u><u|-I`. The measurement probability is invariant under that global phase.
The loop count `k` is supplied, without a claim that arbitrary `k` gives high
success. The oracle and its implementation remain external. See
[Grover's original search paper](https://arxiv.org/abs/quant-ph/9605043).

The introductory Shor file is an order-finding skeleton. The new [factoring reduction](../examples/literature/shor-factoring.qp) adds bounded retries, continued-fraction candidates, order tests and gcd extraction with explicit classical interfaces. The work
register starts at `|1>` and control index `j` uses `a^(2^(m-1-j))`. Modular
multiplication requires a unitary extension beyond valid residues. See
[Shor's factoring and discrete-logarithm paper](https://arxiv.org/abs/quant-ph/9508027).

The Hamiltonian file records an approximate block-encoding inequality and desired
time-evolution contract; it does not implement an optimal simulation algorithm.
For the intended advanced family, see
[Gilyén, Su, Low and Wiebe on singular value transformation](https://arxiv.org/abs/1806.01838).

## The Chen LWE case

Yilei Chen's publication page records an April 18, 2024 update identifying a bug
in Step 9, Section 3.5.9, and retracting the claimed polynomial-time result for
the stated LWE regime. The page also identifies complex Gaussian amplitudes and
windowed QFT as ideas in that work. See
[the author's update](https://www.chenyilei.net/outputs.html) and
[the original report](https://eprint.iacr.org/2024/555).

The original LWE example remains a notation notebook. The new
[nine-stage transcription](../examples/literature/chen-nine-stages.qp) now records
the actual source operations and intermediate state assertions. A separate
[Step 9 notebook](../examples/literature/chen-step9-domain-extension.qp) isolates
the disputed local-extension/correlated-state equality. The parser accepts this
claim as syntax; it does not establish or refute it. The [Chen source notes](literature/chen.md)
identify the inspected April 10 mirror, later withdrawal, and finite-encoding gaps.

## Literature expansion

The [source-linked corpus](literature/README.md) adds semiclassical QFT, phase and
amplitude estimation, randomized search, Shor and Regev factoring reductions,
first/second-order product formulas, Taylor LCU, block-encoding arithmetic,
qubitization, QSVT and Chen's nine stages. Program bodies, access interfaces,
assertions, runtime claims and omissions are distinguished per paper. Existing
introductory notebooks remain small examples; they are not the limit of the new
corpus. Run `npm run check:literature` for reproducible syntax/render/export coverage.

## What complete mathematical support requires

No finite gallery establishes support for every algorithm or TeX macro. The
[notation reference](math-support.md) states the supported constructs. Named
operators allow domain vocabulary without pretending to know its meaning.

Verified coverage of a paper requires its exact input model, finite program,
definitions, assumptions, intermediate lemmas, error budget, oracle costs and
conclusion. Quantum advantage also needs a precise classical model and a checked
lower-bound argument or named hardness assumption. A proof establishes only what
its formal statement expresses; unproved or false assumptions remain visible
dependencies even after a sound kernel exists.
