# Regev's lattice-based factoring construction

[The program](../../examples/literature/regev-lattice-sampling.qp) follows
[Regev, arXiv:2308.06572v3](https://arxiv.org/pdf/2308.06572v3): §3,
Eqs. (2)–(6), specifies Gaussian preparation, clean modular-product evaluation,
Fourier sampling and the sampling distribution; §4, Corollary 4.5, supplies the
noisy-dual recovery lattice; §5, Claim 5.1 and Theorem 1.1, supply the short-vector
interface and factoring reduction. The full text was inspected.

The document implements the sampling orchestration and a bounded factoring
attempt with `d+4` independent samples. It includes a classical repeated-square
routine and an explicit truncated QFT circuit. Its QFT error bound follows by
summing omitted rotation angles. The source's per-sample asymptotic speedup
depends on a number-theoretic short-relation heuristic, recorded as an assumption.
It does not establish a practical advantage or a classical lower bound.

Gaussian-state synthesis, balanced subset multiplication, LLL/Gram–Schmidt
recovery and clean reversible compilation have explicit contracts. Squaring in
the classical routine is deliberately separate from the quantum oracle, which
preserves its input and XORs the result into an output register. All scratch
must be uncomputed by an eventual implementation.

The frontend parses and renders these programs and assertions. It does not
execute the routines, check the heuristic, prove the contracts, or verify the
resource bounds. The return value zero denotes an unsuccessful factoring
attempt; nonzero results are guarded by an explicit nontrivial-divisor check.
