# QParam

**Quantum programs and specifications, written as mathematics.**

Open a `.qp` file in VS Code: sums, kets, tensor products, matrices, and assertions
are typeset **inside the editor**, alongside highlighted language keywords. Click a
formula to edit its LaTeX. Move the cursor away, or press Escape, to typeset it again.
No separate preview is required.

A parametric program and its specification can read like this:

$$
\begin{array}{ll}
\mathbf{algorithm} & \mathtt{uniform}(q : \mathrm{Qubit}[n]) \\[3pt]
 & \mathbf{repeat}\; j \in [0,n):\quad H(q_j) \\[9pt]
\mathbf{requires} & |\psi\rangle = \displaystyle\bigotimes_{j=0}^{n-1}|0\rangle \\[9pt]
\mathbf{ensures} & |\psi\rangle = \displaystyle\frac{1}{\sqrt{2^n}}\sum_{y=0}^{2^n-1}|y\rangle \\[9pt]
\mathbf{costs} & G=n
\end{array}
$$

This is a typeset presentation of [uniform preparation](examples/fourier.qp).
Its `.qp` source is ordinary text:

```qp
algorithm uniform(q : Qubit[n]) {
  repeat j in 0..n {
    H(q[j])
  }
}

spec uniform {
  requires $\ket{\psi} = \bigotimes_{j=0}^{n-1}\ket{0}$
  ensures $\ket{\psi} = \frac{1}{\sqrt{2^{n}}}\sum_{y=0}^{2^{n}-1}\ket{y}$
  costs $G=n$
}
```

## Mathematics in the file

![QParam mathematical editor with highlighted keywords and inline formulas](docs/images/math-editor.png)

The interface follows your VS Code theme: line numbers, a source editor, and
mathematics. **Math / Source** switches presentation without changing the file.
**Open Text Editor** returns to VS Code's ordinary text editor. Save, undo, redo,
and Git operate on the underlying `.qp` source.

- Type **`$sum`**, **`$ket`**, **`$tensor`**, or **`$matrix`** and accept a completion.
- Inside mathematics, type **`\`** for the notation palette, including Greek letters,
  operators, Dirac notation, matrices, integrals, and asymptotic bounds.
- Click a formula or move the cursor into it to edit. Tab moves between snippet fields.
- Syntax issues appear in the editor and VS Code's Problems panel.
- Use **QParam: Open Paper Preview** for a compact reading view, or export to LaTeX.

## From Fourier transforms to operator contracts

The [QFT example](examples/qft.qp) contains indexed controlled-phase gates, final
bit reversal, an adjoint call, and the intended Fourier-state specification:

$$
\begin{aligned}
\mathbf{requires}\quad &|\psi\rangle=|x\rangle,\qquad 0\le x<2^n,\\[4pt]
\mathbf{ensures}\quad &|\psi\rangle=\frac{1}{\sqrt{2^n}}
\sum_{y=0}^{2^n-1}e^{2\pi ixy/2^n}|y\rangle,\\[4pt]
\mathbf{costs}\quad &G_H=n,\qquad G_{\mathrm{CP}}=\frac{n(n-1)}{2}.
\end{aligned}
$$

Assertions can also express an approximate block encoding and Hamiltonian evolution:

$$
\left\|A-\alpha(\langle0|^{\otimes a}\otimes I)U
(|0\rangle^{\otimes a}\otimes I)\right\|\le\varepsilon,
\qquad
\left\|V-e^{-itH}\right\|\le\delta.
$$

The core circuit syntax records parametric register sizes, arithmetic loop bounds,
register slices, gates with mathematical angles, reusable calls, controlled and
adjoint operations, measurement, and explicitly declared external oracles. See the
[language reference](docs/language.md) and [mathematical syntax reference](docs/math-support.md).

| Example | Included today |
|---|---|
| [Bell pair](examples/bell.qp), [uniform superposition](examples/fourier.qp) | Concrete gate circuits, state formulas and specifications |
| [Deutsch–Jozsa](examples/deutsch-jozsa.qp), [Bernstein–Vazirani](examples/bernstein-vazirani.qp) | Query circuits with explicit oracle contracts |
| [Grover](examples/grover.qp) | Parametric iterations, a gate-level diffuser, and a success-probability claim |
| [QFT](examples/qft.qp) | Controlled phases, bit reversal, inverse via an adjoint call |
| [Semiclassical QFT](examples/literature/semiclassical-qft.qp), [phase estimation](examples/literature/quantum-phase-estimation.qp) | Measurement feedback, controlled powers, intermediate states and output distributions |
| [QSearch](examples/literature/amplitude-search.qp), [amplitude estimation](examples/literature/amplitude-estimation.qp) | Randomized retries, controlled Grover iterate, probability and expected-query assertions |
| [Shor factoring](examples/literature/shor-factoring.qp), [Regev factoring](examples/literature/regev-lattice-sampling.qp) | Quantum sampling and classical reductions, with explicit arithmetic/lattice interfaces |
| [Gidney–Ekerå 2021](examples/formalrv/ge2021.qp), [Gidney 2025](examples/formalrv/gidney2025.qp), [fixed lanes](examples/formalrv/gidney2025-fixed-lanes.qp) | FormalRV circuit bodies and assertions: windowed arithmetic, measured uncomputation, phase gradients, residues and lane orchestration |
| [Product formulas](examples/literature/hamiltonian-product-formulas.qp), [Taylor LCU](examples/literature/lcu-taylor.qp) | Simulation schedules, unary preparation, controlled selection and oblivious amplification |
| [Block product](examples/literature/lcu-block-product.qp), [block sum](examples/literature/lcu-block-sum.qp) | Composition programs and projected-operator error assertions |
| [Qubitization](examples/literature/qubitization-walk.qp), [QSVT](examples/literature/qsvt-phase-sequence.qp) | Walk reflections, Chebyshev transforms, odd/even phase sequences and real-part wrapper |
| [Chen's nine stages](examples/literature/chen-nine-stages.qp), [disputed Step 9](examples/literature/chen-step9-domain-extension.qp) | Source operations, complex Gaussian states, CRT processing and the disputed correlated-state claim |

These examples exercise a defined, extensible mathematical grammar. They are **not
complete implementations or verifications of every algorithm family**. The
[coverage guide](docs/algorithm-coverage.md) identifies the implementation and proof
gaps. The [literature guide](docs/literature/README.md) maps programs to paper versions,
equations, access models and omissions. **31 documents, 151 algorithm bodies, and
2,959 mathematical spans** currently pass the syntax/render/export corpus check.

For example, [amplitude estimation](examples/literature/amplitude-estimation.qp)
exposes the controlled iterate and its error claim:

$$
\begin{aligned}
\mathbf{let}\quad &Q=-AS_0A^\dagger S_\chi,\qquad M=2^m,\\[4pt]
\mathbf{assert}\quad &|\Psi\rangle=\frac{1}{\sqrt M}
  \sum_{x=0}^{M-1}|x\rangle\otimes Q^xA|0^n\rangle,\\[4pt]
\mathbf{return}\quad &\widetilde a=\sin^2(\pi y/M),\\[4pt]
\mathbf{probability}\quad &\Pr\!\left[
 |\widetilde a-a|\le\frac{2\pi\sqrt{a(1-a)}}{M}+\frac{\pi^2}{M^2}
 \right]\ge\frac8{\pi^2}.
\end{aligned}
$$

These are authored obligations, including the probability bound from
[BHMT, Theorem 12](https://arxiv.org/pdf/quant-ph/0005055v1). The program contains
the controlled operations and their essential phase sign. Classical variables,
conditionals, loops, allocation and inline assertions are part of the language:

```qp
let r : Nat := $D_j$
let u : Nat := call powmod(a, r, N)
if $u=1\land r\bmod 2=0$ {
  let x : Nat := call powmod(a, r/2, N)
  let d : Nat := call gcd($x-1$, N)
  if $1<d<N$ {
    assert $d\mid N$
    return $d$
  }
}
```

This fragment comes from the bounded Shor reduction. `powmod` and `gcd` have
explicit classical interfaces; their implementations and the assertions are
not checked by this frontend. The Chen program likewise records the withdrawn
paper's disputed Step 9 as an open obligation, not a detected or repaired proof.

## Gidney programs and coherent assertions

The [Gidney corpus](docs/literature/gidney.md) includes **all five selected FormalRV
entry points**, including the [GE2021Fixed](examples/formalrv/ge2021-fixed.qp) and
[Gidney2025Fixed](examples/formalrv/gidney2025-fixed.qp) configurations. Its eight
shared modules contain **106 program/gadget bodies, 560 operations, 104 source
contracts, and 284 definition equations**. Imports reuse the arithmetic libraries.
The [coverage manifest](examples/formalrv/coverage.json) records the source revision,
hashes, locations and missing contracts; the generated files are ordinary editable QP.

Even a small carry gadget has a coherent specification. For example,
[`gidneyFirst`](examples/formalrv/measured-adder.qp) is presented as:

$$
\begin{array}{ll}
\mathbf{algorithm}&\mathtt{gidneyFirst}(q,c)\\[3pt]
 &\mathrm{CCX}(q_0,q_1,q_2);\quad\mathrm{CX}(q_2,q_3);\quad\mathrm{CX}(q_2,q_4)\\[8pt]
\mathbf{bind}&b<d,\quad\alpha\\[3pt]
\mathbf{requires}&b+5\le d\\[5pt]
\mathbf{assumes}&\displaystyle\sum_{z<2^d}\alpha(z)|z\rangle_{q[0,d)}\\[8pt]
\mathbf{ensures}&\displaystyle\sum_{z<2^d}\alpha(z)
\left|z\bmod 2^b+2^b\operatorname{vFirst}\!\left(\left\lfloor z/2^b\right\rfloor\right)\right\rangle_{q[0,d)}
\end{array}
$$

Here `b` and `d` abbreviate the source's `base` and `dim`; `vFirst` is defined in
the same module. Larger contracts preserve strided register bands, arbitrary
amplitudes, measurement-conditioned postconditions, recovery probabilities, and
separate resource counters. **These are transcribed claims, not checked proofs.**
Generated fault-tolerant schedules and machine-point estimates are outside this
source-syntax corpus.

## Try it in VS Code

You need Node.js 22 or newer and desktop VS Code 1.95 or newer.

```sh
git clone https://github.com/yezhuoyang/QAlgLean.git
cd QAlgLean
npm ci
npm run package
code --install-extension artifacts/qparam-studio-0.4.0.vsix
code examples/qft.qp
```

Run **QParam: Open an Example** for the gallery. Single-file examples open as
unsaved copies; examples with imports open their source file with its libraries.
If an existing tab still uses the ordinary source editor, select **QParam: Open
Mathematical Editor**, or **Reopen Editor With → QParam Mathematical Editor**.

For extension development, open the repository in VS Code and press **F5** with
**Explore QParam** selected. No custom color theme or network service is needed.

## LaTeX and the checking boundary

**QParam: Export Paper to LaTeX** exports a syntactically valid document for XeLaTeX
or LuaLaTeX. **QParam: Import QParam Block from LaTeX** extracts one explicit
`qparam` environment, as in [paper-import.tex](examples/paper-import.tex).
Assertions use a parsed subset of mathematical LaTeX with a shared fixed macro
library. Importing arbitrary papers, executing TeX, and arbitrary macro definitions
are outside this frontend's scope.

QP is intended to have an independent quantum proof kernel and an explicit Lean
interface. **This release is an authoring frontend:** it parses mathematical and
circuit syntax, but does not yet type-check or execute circuits, verify proofs,
compute resource estimates, or invoke Lean. Specifications and `costs` are authored
claims; `assume` is a premise, `admit` an open obligation, and `by lean` an unresolved
reference. See [architecture and trust boundary](docs/architecture.md).

## Development

```sh
npm test                # Parser, mathematical coverage, rendering, editing protocol
npm run check:literature # All examples, source manifest, mathematical export
npm run import:formalrv  # Regenerate Gidney modules from the pinned source snapshot
npm run test:extension  # Real VS Code: opening .qp, saving, undo/redo, source view
npm run package         # Installable VSIX with bundled math fonts and editor
npm run preview         # /editor?example=qft for editor QA; / for reading view
```

| Path | Purpose |
|---|---|
| `src/language/` | Document/circuit AST, mathematical AST, shared notation registry |
| `src/editor/` | Mathematical editor, versioned text edits, completions, LaTeX exchange |
| `src/preview/`, `media/` | Reading view, editor styles, bundled browser assets |
| `src/extension.ts` | VS Code registration, diagnostics, gallery, commands |
| `src/import/` | Strict FormalRV source transcription and coverage generation |
| `syntaxes/`, `snippets/` | Ordinary text editor highlighting and snippets |
| `examples/`, `test/` | Algorithm documents and regression coverage |

The repository is QAlgLean; the extension is QParam Studio (`yezhuoyang.qparam-studio`).
Rendering uses local KaTeX and CodeMirror assets. QAlgLean is licensed under
[Apache-2.0](LICENSE); bundled dependency licenses are included in the extension.
