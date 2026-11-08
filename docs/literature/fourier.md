# Fourier measurements and phase estimation

These two programs exercise classical feedback, measured values, mutable
mathematical locals, nested parametric powers, and probability assertions.

[`semiclassical-qft.qp`](../../examples/literature/semiclassical-qft.qp)
transcribes the positive-transform measurement procedure in
[Griffiths and Niu, Eqs. (10)–(11), Fig. 2](https://arxiv.org/pdf/quant-ph/9511007).
The input is ordered most significant bit first. The first measured output is
the least significant bit. A phase shift precedes each Hadamard; the feedback
update is `p := p/2 + b/4`. The contract concerns the output distribution for
arbitrary normalized input. It does not claim a coherent output state. The
first phase call is the identity and is included in the authored gate count.

[`quantum-phase-estimation.qp`](../../examples/literature/quantum-phase-estimation.qp)
uses the phase-kickback construction in
[Cleve, Ekert, Macchiavello and Mosca, Section 5](https://arxiv.org/pdf/quant-ph/9708016).
The source writes powers as nested repeated controlled applications, exposing
`2^m-1` queries to `U`. It states the full finite-sum measurement distribution
and deterministic recovery for exactly representable dyadic phases. The inverse
Fourier transform is an external interface to
[`examples/qft.qp`](../../examples/qft.qp); there is no module-import mechanism
yet. Eigenstate preparation and implementation of `U` remain explicit premises.

The parser checks syntax and call signatures. State/register correspondence,
Born probabilities, classical coercions, and every claimed equality remain
proof obligations. In particular, a measured register's eventual dependent
bitstring type is not inferred by this frontend.
