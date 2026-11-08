# Mathematical notation

QParam keeps editable mathematical source inside `$...$`. The VS Code mathematical editor renders these spans in place, while keywords remain highlighted. A source editor is also available. The same notation registry supplies the parser, completion palette, renderer, and LaTeX export.

The current frontend parses a structural syntax tree and displays it. It does **not** yet resolve mathematical types, bind variables hygienically, discharge assumptions, or verify a theorem. In particular, recognizing an integral, a probability, or an asymptotic expression does not prove a claim about it. This is the boundary where a future elaborator and the quantum kernel will connect.

## Write familiar mathematical source

```qp
state uniform := $\frac{1}{\sqrt{2^n}}\sum_{x=0}^{2^n-1}\ket{x}$

spec simulate {
  requires $H=H^{\dagger}$
  ensures $\norm{U-\exp(-iHt)}\le\epsilon$
  costs $Q\in\widetilde{\mathcal{O}}(\alpha t\log(1/\epsilon))$
}
```

Use `$` to open the notation palette, or `\` for completions within a mathematical span. Examples include `$sum`, `$ket`, `$matrix`, `$cases`, `$norm`, `$Pr`, `$int`, and `$operatorname`. Greek letters and supported relation symbols can also be typed directly in Unicode.

## Supported families

| Family | Source examples |
| --- | --- |
| Dirac notation | `\ket{\psi}`, `\bra{\phi}`, `\braket{\phi}{\psi}`, `\ketbra{\psi}{\phi}` |
| Raw Dirac delimiters | `\lvert\psi\rangle`, `\langle\phi\rvert`, `\langle\phi\mid\psi\rangle`, `\left|\psi\right\rangle`, `|ψ⟩⟨φ|` |
| Products and adjoints | `A\otimes B`, `\ket{0}^{\otimes n}`, `U^{\dagger}`, `A\oplus B`, `A\circ B` |
| Finite families | `\sum_{x\in S}\alpha_x\ket{x}`, `\prod_{j=0}^{n-1}U_j`, `\bigotimes_{j=0}^{n-1}\ket{0}_j`, `\bigcup_{j=0}^{n-1}S_j` |
| Norms and inner products | `\norm{A}_{2}`, `\abs{z}`, `\ip{\mathbf{x}}{\mathbf{y}}`, `\lVert A\rVert`, `\lvert z\rvert` |
| Scalars and functions | `\frac{a}{b}`, `\sqrt{x}`, `\sqrt[n]{x}`, `\exp(x)`, `\sin^{2}(x)`, `\arcsin(x)`, `\log_2(n)` |
| Spaces and vectors | `\mathbb{C}^{2^n}`, `\mathcal{H}`, `\mathbf{x}`, `\mathsf{T}`, `\mathfrak{g}`, `\boldsymbol{\psi}` |
| Accents | `\hat{H}`, `\widehat{f}`, `\bar{z}`, `\vec{x}`, `\dot{x}`, `\ddot{x}`, `\widetilde{\mathcal{O}}` |
| Probability and trace | `\Pr_{x\sim D}[P(x)\mid E]`, `\Tr(\rho)`, `\det(A)`, `\dim(V)` |
| Calculus | `\int_{0}^{t}H(s)\,\mathrm{d}s`, `\frac{\partial}{\partial t}`, `\nabla f`, `\lim_{n\to\infty}a_n` |
| Number theory | `a^r\equiv 1\pmod{N}`, `a\bmod N`, `\gcd(a,N)`, `\lfloor x\rfloor`, `\lceil x\rceil`, `\binom{n}{k}` |
| Sets and logic | `\{0,1\}^{n}`, `\set{x\in S}{P(x)}`, `A\cup B`, `A\cap B`, `A\setminus B`, `x\notin S`, `\forall x\in S,P(x)`, `\exists x,P(x)` |
| Relations | `\le`, `\ge`, `\ne`, `\approx`, `\equiv`, `\propto`, `\subseteq`, `\succeq`, `\implies`, `\iff`, `\mapsto` |
| Extensible names | `\operatorname{poly}(n)`, `\operatorname{LWE}_{n,q}(A,b)`, `\operatorname{dist}(x,\Lambda)` |

Named operators retain their names in the syntax tree. They are not automatically assigned a definition or an axiom. Mathematical fonts and accents also remain explicit nodes. `\text{...}` accepts short ASCII labels such as `\text{otherwise}`; mathematical expressions belong outside the label.

Use explicit `\ket`, `\bra`, `\braket`, and `\ketbra` when the intended Dirac constructor matters. Raw angle/bar combinations retain their delimiters and separators; they are not a substitute for typed elaboration. Similarly, `\mid` retains the written separator without deciding whether it denotes conditioning, divisibility, or a set predicate.

### Matrices, cases, and aligned statements

```latex
H = \frac{1}{\sqrt{2}}\begin{bmatrix}1 & 1 \\ 1 & -1\end{bmatrix}

\delta_{x,y}=\begin{cases}
  1 & x=y \\
  0 & \text{otherwise}
\end{cases}

\begin{aligned}
  U^{\dagger}U &= I \\
  \norm{U\ket{\psi}} &= \norm{\ket{\psi}}
\end{aligned}
```

Supported environments are `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `cases`, and `aligned`. Matrix rows must have the same number of columns. Every `cases` row requires one value and one condition. The parser retains rows and cells, including leading relations in aligned cells; an aligned display is not itself a checked derivation.

## Algorithm coverage and its limits

The regression suite parses and renders formulas for the following subjects, and the example gallery uses this same vocabulary:

| Subject | What the frontend can represent | Example |
| --- | --- | --- |
| Deutsch–Jozsa / Bernstein–Vazirani | Boolean phases, superpositions, tensor preparation, inner products, Kronecker symbols | [Deutsch–Jozsa](../examples/deutsch-jozsa.qp), [BV](../examples/bernstein-vazirani.qp) |
| Grover / amplitude amplification | Rotation angles, trigonometric success probabilities, rounded iteration counts | [Grover](../examples/grover.qp) |
| Fourier transforms / Shor | Indexed phases, controlled rotations, modular orders, rational approximation and coprimality | [QFT](../examples/qft.qp), [order finding](../examples/shor-order-finding.qp) |
| Hamiltonian simulation / block encodings | Hermitian operators, evolution, time integrals, tensor ancillas, operator-norm errors, asymptotic claims | [Hamiltonian and block encoding](../examples/hamiltonian-block-encoding.qp) |
| Lattice algorithms / LWE | Gaussian weights, lattice cosets, modular vectors, conditional probabilities, explicit assumptions | [LWE obligations](../examples/lwe-obligations.qp) |

The Shor, Hamiltonian, and LWE documents clearly identify abstract components or open obligations. In particular, the LWE document is a place to state and audit obligations. It is **not** an implementation or verification of Yilei Chen's algorithm, and the editor does not yet reproduce or detect its reported flaw.

There is no claim that a finite frontend supports every notation used in every quantum paper. New domain names can use `\operatorname{...}` today. A genuinely new syntax constructor should be added to the shared registry, structural parser, renderer/export contract, and regression fixtures together. Arbitrary TeX macros are deliberately not treated as formal syntax.

## Parsing rules that preserve the displayed mathematics

- Plain adjacent letters denote juxtaposition: `xy` is a product. Use `\operatorname{poly}(n)` for a named operator.
- Use visible parentheses for mathematical grouping. Bare `{a+b}c` is rejected because TeX hides the braces; it would display as `a+bc` while suggesting a different syntax tree.
- TeX scripts apply to one token. Write `x^{12}`, not `x^12`; QParam rejects the latter to prevent a display/tree disagreement.
- A sum, product, or indexed tensor requires an explicit lower limit or index set. Its body includes products and tensors; put compound sums in visible parentheses.
- Quantifiers use an explicit comma: `\forall x\in S, P(x)`. Several binders can be written as nested quantifiers.
- `\left` and `\right` must match. Incomplete expressions remain editable and produce diagnostics.
- ASCII `<=`, `>=`, `!=`, `->`, and `=>` are converted to their TeX relation forms for display and export. The original editable source and source positions are preserved.

The parser limits each expression to 32,768 UTF-16 code units, nesting to 128 delimiters, and tables to 128 rows by 64 columns. Unknown commands, unbalanced groups, invalid environments, and user macro definitions are rejected. These are frontend resource limits, not mathematical restrictions of a future kernel.

## LaTeX interoperability

The renderer uses local KaTeX and a fixed macro table. Export includes the corresponding macro definitions and targets XeLaTeX or LuaLaTeX. The mathematical body can therefore be reused in a paper with that preamble. The import command currently extracts one explicit `\begin{qparam}...\end{qparam}` block; it does not translate an arbitrary research paper into a proof or circuit.

The presentation layer follows KaTeX's [supported notation](https://katex.org/docs/supported.html) and [safe rendering options](https://katex.org/docs/options). QParam's accepted subset is defined by [the shared registry](../src/language/math-syntax.ts) and [structural parser](../src/language/math.ts), with executable coverage in [the notation tests](../test/math-coverage.test.cjs). A successful render is never used as evidence of mathematical truth.
