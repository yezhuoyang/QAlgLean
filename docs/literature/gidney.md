# Gidney variants from FormalRV

This corpus transcribes the authored `.prog` sources in FormalRV, including their
imported arithmetic modules. It preserves circuit bodies and source contracts;
it does not substitute a single modular-exponentiation oracle for the detailed
arithmetic. The pinned input is recorded in
[`test/fixtures/formalrv/gidney.json`](../../test/fixtures/formalrv/gidney.json).
The [coverage manifest](../../examples/formalrv/coverage.json) records source and
member hashes, generated line ranges, import projections and missing contracts.
SHA-256 identifies the pinned UTF-8 joined source bytes, including their captured
line endings. The Git revision identifies the source content ancestry; checkout
line endings can differ from the corresponding Git blobs.

The scope consists of five entry points:

| Entry point | Program and assertion features |
|---|---|
| [GE2021](../../examples/formalrv/ge2021.qp) | Coset preparation, carry runways, windowed multiplication, coherent QROM, measurement-based unlookup, Fourier readout, Ekerå–Håstad recovery events |
| [Gidney2025](../../examples/formalrv/gidney2025.qp) | Residue arithmetic, masked approximate modular exponentiation, measured adders, phase correction, reusable phase-gradient states and measurement records |
| [GE2021Fixed](../../examples/formalrv/ge2021-fixed.qp) | The source wrapper's imported GE2021 implementation and surface-code declaration |
| [Gidney2025Fixed](../../examples/formalrv/gidney2025-fixed.qp) | The source wrapper's imported Gidney2025 implementation and surface-code declaration |
| [Gidney2025FixedLanes](../../examples/formalrv/gidney2025-fixed-lanes.qp) | Parallel prime lanes, lane-dependent wire placements, shared accumulator, disjoint workspace requirements and composed resource contracts |

The two short `Fixed` wrappers do not contain separate bodies or extra
postconditions: their imported implementations are included once. These are
FormalRV construction configurations, rather than extra published Gidney papers.
The lane variant contributes additional bodies and contracts.

The import closure contains **106 algorithm bodies, 104 specifications, 284
definition equations and 398 resource-counter expressions**.
It includes the shared measured-adder and phase-gradient modules. Every source
specification is transcribed; missing clauses stay missing. In particular, some
lane helper contracts specify requirements and resources without a quantum
postcondition. That absence is not replaced with an invented correctness claim.
The source bodies `gidneyAddMeasured` and `addConstMeasured` have no matching
source specification; that gap is also recorded explicitly.

## Mathematical assertions

Contracts retain their original structure:

| FormalRV source | QP surface | Meaning retained at the syntax level |
|---|---|---|
| `∀α .` and bounded universal prefixes | `bind $\alpha$`, `bind $i<W$` | Variables universally scoped over the contract |
| `requires P` | `requires $P$` | Arithmetic, layout, table consistency and other premises |
| `assumes {{ ψ }}` | `assumes $\psi$` | Quantum input-state assertion |
| `ensures {{ φ }}` | `ensures $\phi$` | Quantum output-state assertion |
| `ensures {{ φ }} given E` | `ensures $\phi$ given $E$` | Output-state assertion conditioned on a particular measurement record |
| `outcomes Pr[E] ≥ p` | `outcomes $\Pr[E]\ge p$` | Classical measurement-event claim |
| `outcomes none` | `outcomes none` | No outcome claim supplied, rather than a claim of zero measurements |
| `resource { toffoli: t, meas: m }` | Separate `resource toffoli := $t$` and `resource meas := $m$` | Named resource expressions, including dependencies on table contents |

The expressions include nested finite sums, products and quantifiers; modular
arithmetic; floor division; shifts and XOR; piecewise definitions; and arbitrary
coherent amplitude functions. Recursive definition equations retain their base
and successor patterns. A mathematical `define` signature and its `equation`
clauses describe syntax without assuming termination or a proven type.

For example, the coset-preparation contract keeps the coherent amplitude
function instead of specializing the input to a single basis state:

$$
\sum_{z<2^{\mathrm{dim}}}\alpha(z)
  \lvert\operatorname{prepZeroWord}(b,r,a,h,z)\rangle_{q[0,\mathrm{dim})}
\quad\longmapsto\quad
\sum_{z<2^{\mathrm{dim}}}\sum_{j<2^c}
  \frac{\alpha(z)}{\sqrt{2^c}}
  \lvert\operatorname{setReg}(\operatorname{prepZeroWord}(b,r,a,h,z),r,b,k+jN)\rangle_{q[0,\mathrm{dim})}.
$$

Here `b`, `c`, `r`, `a`, `h` abbreviate the source parameters `bits`, `cm`,
`regBase`, `accBase`, `addBase` for readability. The generated QP files retain
the original names and all the source's separate arithmetic and layout premises.

Register selectors remain explicit, including strided bands such as
$\lvert s\rangle_{q[a+1,a+3m+1:3)}$. Classical record slices remain classical; a
probability event involving $c[b,b+n)$ is not turned into a quantum-state
expression. Tensor products preserve the exact listed bands, including omitted
measurement-record bands. These partial assertions are not silently converted
to equalities about an entire state vector.

Noncontiguous record layouts also preserve their index binders, such as
`c[map t < count . l3RecPos(t, ...)-top]`. Six source contracts have a `given`
condition. That condition stays attached to its output state; it is not promoted
to an unconditional guarantee or an input assumption.

## What the syntax check establishes

The importer parses every operation, definition and specification in the pinned
closure, rejects unsupported forms, and emits ordinary QP syntax. Regression
tests parse and typeset the mathematical expressions and check that source
structure survives the import. The original sources remain available beside
the provenance data for comparison.

The generated files use eight shared modules. FormalRV imports of individual
stage members are projected to the owning QP module and deduplicated. This makes
that module's other declarations available without automatically invoking any
algorithm. Every original member import and this projection are recorded in the
coverage manifest.
For `Gidney2025FixedLanes`, the original member closure contains 56 bodies; the
shared-module projection also exposes `gidney2025`, `gPrimes`, `gApproxModexp` and
`gOnePrime`. Regression checks confirm that the original calls still resolve to
the same source bodies and that no mathematical definition or map changes.

To regenerate and check the corpus from the pinned fixture:

```sh
npm run compile
node scripts/import-formalrv.cjs
node scripts/import-formalrv.cjs --check
```

Generation first validates all module imports and QP syntax. `--check` compares
the checked-in files byte for byte without rewriting them. Updating the pinned
FormalRV source is an explicit change to the fixture, rather than a network fetch
during tests.

This is a frontend coverage result. It does not transfer FormalRV proofs to QP,
verify resource expressions, prove circuit equivalence, or supply absent source
contracts. Source-level surface-code declarations are retained as configuration
metadata; generated `.qppm`, `.qec` and `.sysprog` schedules and machine verdicts
are separate layers, outside this authored-program transcription.

The source research behind the principal variants is
[Gidney–Ekerå, *How to factor 2048 bit RSA integers in 8 hours using 20 million noisy qubits*](https://quantum-journal.org/papers/q-2021-04-15-433/)
and [Gidney, *How to factor 2048 bit RSA integers with less than a million noisy qubits*](https://arxiv.org/abs/2505.15917).
The precise transcribed artifact is FormalRV's pinned implementation, including
its own interfaces and construction choices; it is not a claim that every line
appears verbatim in either paper.
