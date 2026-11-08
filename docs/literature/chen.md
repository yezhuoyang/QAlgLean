# Chen's 2024 LWE claim: a source-specific syntax audit

The notebooks transcribe **the actual nine-stage construction** in Yilei Chen's *Quantum Algorithms for Lattice Problems*, rather than a generic Gaussian example. They contain a program, mathematical state assertions, a classical equation-collection wrapper, and a separate obligation for the disputed Step 9 transition. They are syntax coverage examples, not a working LWE solver or a formal refutation.

The [author's official update](https://www.chenyilei.net/outputs.html) and [ePrint record](https://eprint.iacr.org/2024/555) state that the April 18, 2024 Step 9 error invalidates the claimed polynomial-time LWE algorithm. Consequently, downstream success and polynomial-time claims in these notebooks are marked `claimUnderAudit`, and their proof blocks explicitly record the withdrawal. A syntax parser should accept a false assertion as an expression; rejecting its proof is a future kernel responsibility.

## Sources and version

- **Report inspected:** [public mirror of the author's full report](https://community.isc2.org/ijoyk78323/attachments/ijoyk78323/tech-talk/4394/1/2024-555.pdf), front page dated **April 10, 2024**. The accessible indexed full text was used to inspect Sections 3.2-3.5, including the equations before and after the disputed domain extension. The mirror still contains the original defense of that transition. It is not the corrected April 18 text.
- **Status checked separately:** the official ePrint record, revised April 19, and the author's page. These identify Section 3.5.9 as erroneous; the notebook does not represent the old mirror as the revised report.
- **Author's supplementary implementation:** [ComplexGaussian](https://github.com/wildstrawberry/ComplexGaussian), commit `d7f768aa9e22c25b24a1e860a554068343f5a4ea`, describes complex Gaussian plots and a two-dimensional demonstration. It is not a gate-level implementation of the full LWE algorithm and was not used as a substitute for the report.
- **Access date:** November 8, 2026. The direct ePrint PDF request returned HTTP 403. The mirror's indexed PDF text was readable, while a fresh file download returned HTML. Therefore there is **no verified PDF byte hash**. This limitation is recorded in the source metadata instead of hashing the HTML response as if it were the paper.

## Program and assertion map

[chen-nine-stages.qp](../../examples/literature/chen-nine-stages.qp) follows the source's order. Page numbers below are the report's printed page numbers in the April 10 mirror.

| Source | Program operation | Assertion or obligation |
| --- | --- | --- |
| Section 3.2, equation (12), p. 17 | LWE matrix and planted-secret inputs | The special lattice, short vector and relation to the original secret/error |
| Section 3.3, pp. 18-19 | Parameters and guessed norm | Conditions C.1-C.8 and the lattice gap, recorded as assumptions |
| Step 1, Section 3.5.1, equations (16)-(17), pp. 22-23 | Prepare lattice and complex Gaussian registers; add, measure the window, shift | The Gaussian-weighted lattice-line state, finite window and small-support re-encoding |
| Step 2, Section 3.5.2, equation (18), p. 24 | Vector Fourier transform over the large modulus | The relation between the first and second states |
| Step 3, Section 3.5.3, equations (19)-(21), pp. 24-25 | Prepare a second complex Gaussian; add and measure | The explicit complex coefficient, window width and conditional Gaussian multiplier |
| Step 4, Section 3.5.4, equation (24), pp. 25-26 | A second vector Fourier transform | The relation between the third and fourth states |
| Step 5, Section 3.5.5, equation (25), pp. 26-27 | Split quotient/remainder; measure only the remainder | The conditional amplitude evaluated at the measured low part |
| Step 6, Section 3.5.6, equations (26)-(30), pp. 27-28 | Fourier transform over the small modulus | The sixth state and its inherited parameter obligations |
| Step 7, Section 3.5.7, equations (31)-(35), pp. 28-31 | Shift, compute the rounded center, subtract and measure the residual | The source's purely imaginary Gaussian expression for the center register |
| Step 8, Section 3.5.8, Lemma 3.13, pp. 31-33 | Extend, divide, apply a quadratic phase, Fourier transform, copy and measure a residue, reverse | The extracted first-coordinate residue and claimed preservation of the seventh state |
| Step 9, Section 3.5.9, equations (36)-(38), pp. 33-37 | CRT split, parity measurement, diagonal-residue extraction, swaps, CRT join, shift, **disputed extension**, divide, phase, Fourier transform, measure | Both the state immediately before the disputed extension and the claimed correlated state after it; the alleged output equation |
| Section 3.4, equation (15) and following discussion, pp. 20-21 | Collect equations and apply Gaussian elimination | An explicit sample budget; the secret-recovery claim remains under audit |

The code uses the source's **negative-exponent Fourier convention**. `s` denotes a Gaussian width; bold `s` denotes the LWE secret. Registers are zero-indexed qubit arrays, while the paper's coordinate labels inside mathematics remain one-indexed. Source primes are written `\prime`; stars designate the paper's transformed CRT vectors. `Math` arguments are opaque mathematical data and do not provide an executable representation.

## The Step 9 boundary

[chen-step9-domain-extension.qp](../../examples/literature/chen-step9-domain-extension.qp) makes the disputed obligation visible without hiding it behind an assumed oracle postcondition. A first-coordinate extension acts locally:

$$
E_{Q,QK}|a\rangle|\chi\rangle
=\frac{1}{\sqrt K}\sum_{h=0}^{K-1}|a+hQ\rangle|\chi\rangle.
$$

The other registers retain their amplitudes and correlations under this local map. The notebook separately writes the correlated state claimed after the extension in Section 3.5.9. Equating these two expressions is an explicitly **disputed proof goal**. No theorem is imported to authorize the equality, and no automatic bug detection is claimed.

The isolated notebook chooses a finite representative set for the periodic index as an authoring convention. It does not prove that this choice and normalization faithfully instantiate every source expression. A formal counterexample still needs concrete admissible parameters, exact finite encodings and a proof that the resulting normalized states differ.

## Remaining implementation and proof obligations

The program expands the nine named stages into their stated operations, with external interfaces for lattice/complex-Gaussian preparation, modular vector arithmetic, Fourier transforms, rounding, CRT conversion, domain extension and phase application. It does not replace these source operations with unrelated toy circuits. It also does not implement their gate decompositions, padding, workspace cleanup or finite-precision error budgets.

The paper often writes unnormalized periodic sums over all integers. Those expressions can be authored and parsed, but they are not automatically finite Hilbert-space vectors. Representative sets, normalization, Gaussian truncation bounds, approximate equality, and the availability of reversible encodings remain explicit obligations. The selected norm guess, parameter constraints, sample-rank argument, classical recovery and runtime claims are not established. The full reductions to general lattice problems and every analytic intermediate formula in Sections 3.6-3.7 are outside this transcription.

This is a concrete frontend stress test: vector-valued moduli, nested sums, complex phases, tensor products, norms, inner products, CRT data, measurement-dependent local values, parametric loops, external calls with return values, and a false but syntactically valid mathematical claim all appear in one literature case.
