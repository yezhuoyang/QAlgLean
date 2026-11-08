# Search and factoring transcriptions

## Amplitude methods

[Brassard, Høyer, Mosca and Tapp, quant-ph/0005055v1](https://arxiv.org/pdf/quant-ph/0005055v1)
is the inspected source. `amplitude-search.qp` follows Algorithm QSearch in §2:
it includes the preliminary direct trial, the random-length amplification trial,
and retries. Its expected-query statement is Theorem 3 with a fixed growth
constant. Randomness, state preparation, and predicate reflections are external.
The nonzero-amplitude premise matters for termination.

`amplitude-estimation.qp` uses the amplitude-estimation algorithm and Theorem 12
with k=1. The file specializes M to a power of two and expands the controlled
powers into loops. Its iterate is Q = −A S₀ A† Sχ: the final Z on the control
preserves the minus sign under control. The M−1 iterate-call count follows the
written loops; it is not the paper's accounting of all predicate evaluations or
a physical gate estimate. The inverse-QFT interface refers to the coherent
implementation in `examples/qft.qp`; module linking is still pending.

## Shor

[Shor, quant-ph/9508027v2](https://arxiv.org/pdf/quant-ph/9508027v2), §5 and
equations (5.1)–(5.5), supplies the order-sampling and factor-reduction structure.
`shor-factoring.qp` uses the source's positive Fourier-transform convention.
Modular multiplication, gcd, modular exponentiation, sampling and continued
fractions have explicit interfaces. Continued-fraction denominators are treated
as a deterministically ordered finite sequence, indexed from zero.

The program specializes to odd numbers that are not prime powers. It bounds
retries by T and returns zero on failure; the source's even/perfect-power
preprocessing is omitted. Candidate orders are tested before factor extraction.
The specification promises a factor or zero, with no finite-T success bound.
Reversible arithmetic synthesis and its costs remain open. This extends the
introductory order-finding interface without claiming a complete gate-level
factoring implementation.

## Earlier gallery files

DJ and BV follow the one-query network in
[Cleve, Ekert, Macchiavello and Mosca](https://arxiv.org/pdf/quant-ph/9708016v1),
§3, Fig. 4 and equations (3.3)–(3.9). Grover follows the search iteration in
[Grover's original paper](https://arxiv.org/pdf/quant-ph/9605043), with its success
formula expressed in the amplitude-amplification notation above. QFT follows
Shor §4. These existing programs are indexed rather than duplicated.
