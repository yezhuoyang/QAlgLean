# QP 0.1: a mathematical authoring language

QP is the proposed research language; QParam Studio is this repository's first
VS Code authoring prototype. A `.qp` file is a structured research document with
quantum programs and mathematical specifications. Its paper preview renders the
same mathematical source that the parser reads. It does not run arbitrary TeX.

**This release checks syntax, not truth.** It has a mathematical syntax tree,
source diagnostics, and a finite program grammar. It has no quantum type checker,
program semantics checker, Hoare kernel, cost verifier, or working Lean bridge.
Parsed specifications, assumptions, and proof sketches are all unverified.
The syntax below is a versioned design proposal, not a completed formal system.

## A complete small document

```qp
qparam BellPair
title "Two qubits, one shared state"
description "A mathematical companion to a quantum program."

state bell := $\frac{1}{\sqrt{2}}(\ket{00} + \ket{11})$

algorithm bell(q : Qubit[2]) {
  H(q[0])
  CX(q[0], q[1])
}

spec bell {
  requires $\ket{\psi} = \ket{0} \otimes \ket{0}$
  ensures $\ket{\psi} = \frac{1}{\sqrt{2}}(\ket{00} + \ket{11})$
  costs $G = 2$
}

proof bell {
  goal $\braket{\psi}{\psi} = 1$
  admit "Prove the gate semantics and normalization."
}
```

`requires`, `ensures`, `costs`, and `probability` label mathematical obligations.
They are not executable assertions yet. In particular, `G = 2` is an authored
claim, not a resource estimate produced by an analyzer. The choice of state
binding, scope, and interpretation will be part of the future semantic design.

## Document grammar

One declaration or clause occupies one logical line. A logical line can span
physical lines inside `$…$`. A final semicolon is optional. A `//` comment extends
to the end of a physical line outside mathematics and strings. Names match
`[A-Za-z][A-Za-z0-9_]*`. Strings use JSON double-quote and escape rules.

```ebnf
document    = "qparam" name newline { declaration newline } ;
declaration = "title" string | "description" string
            | "parameter" name ":" scalar-type
            | "assume" name ":" math
            | "state" name ":=" math
            | algorithm | spec | proof ;
scalar-type = "Nat" | "Int" | "Real" | "Complex" ;
math        = "$" expression "$" ;
algorithm   = "algorithm" name "(" [arguments] ")" "{" newline
              { instruction newline } "}" ;
arguments   = argument { "," argument } ;
argument    = name ":" "Qubit" [ "[" (positive-integer | name) "]" ] ;
instruction = gate "(" operand { "," operand } ")"
            | "measure" operand "->" name
            | "repeat" name "in" bound ".." bound "{" newline
              { instruction newline } "}" ;
operand     = name [ "[" (natural | name) "]" ] ;
bound       = natural | name ;
spec        = "spec" name "{" newline { clause newline } "}" ;
clause      = ("requires" | "ensures" | "costs" | "probability") math ;
proof       = "proof" name "{" newline { proof-item newline } "}" ;
proof-item  = "goal" math | "admit" string | "by lean" string ;
```

The current parser uses the exact spacing shown in structural forms (for example,
`algorithm bell(q : Qubit[2]) {`). Indentation and leading/trailing spaces are free;
spaces inside mathematical expressions are ignored. There is exactly one header,
at most one title and description, and no duplicate declaration names within the
parameter/state/assumption namespace. Algorithm, spec, and proof names occupy
separate namespaces so that all three can describe `bell`.

The supported one-operand calls are `H`, `X`, `Y`, `Z`, `S`, `T`, and `reset`.
The two-operand calls are `CX`, `CZ`, and `SWAP`. Gate arity and operand syntax are
checked; register existence, bounds, disjointness, and type correctness are not.
Loop bounds are intended as half-open ranges: `repeat j in 0..n` denotes indices
`0` through `n-1`. This convention is a language-design intent; the prototype does
not execute or verify loops. Reusing an active loop index is rejected.

`by lean "Namespace.theorem"` is an unresolved external reference. It does not
launch Lean, import a theorem, or discharge an obligation. `admit` records an
explicit missing proof. Neither changes a document into a verified theorem.

## Mathematical source and syntax tree

Mathematics is a deliberately finite LaTeX-like fragment. The parser emits
structured nodes with UTF-16 source offsets. The renderer receives the same source,
but rendering success is not mathematical validity. Unsupported commands produce
diagnostics, even if a general-purpose TeX renderer could typeset them.

| Construct | Source | AST meaning |
|---|---|---|
| State vector | `\ket{\psi}` | Ket with an expression argument |
| Dual vector | `\bra{\phi}` | Bra with an expression argument |
| Inner product | `\braket{\phi}{\psi}` | Two-argument inner-product node |
| Norm | `\norm{\ket{\psi}}` | Norm node |
| Tensor product | `\ket{0} \otimes \ket{1}` | Binary tensor node |
| Indexed tensor | `\bigotimes_{j=0}^{n-1}\ket{0}` | Aggregate with limits and body |
| Superposition | `\sum_{x=0}^{N-1}\alpha_x\ket{x}` | Sum with limits and body |
| Fraction | `\frac{1}{\sqrt{N}}` | Fraction containing a root |
| Complex phase | `\exp(2\pi ix/N)` | Function applied to an expression |
| Adjoint | `U^{\dagger}` | Superscript syntax; meaning awaits typing |
| Function call | `P(x)` | Application node |
| Quantifier | `\forall x \in S, P(x)` | Binder expression and body |
| Mapping | `x \mapsto \ket{x}` | Binary mapping node |

Plain mathematical letters are single-letter identifiers: `xy` is juxtaposition
of `x` and `y`, and `ixy` is `i` times `x` times `y`. Use styled notation for visual
labels, such as `\mathrm{cost}`; styling currently wraps an expression, not a
resolved multi-letter symbol. The document name `uniform` and the mathematical
letters in `$uniform$` are therefore not automatically linked. This is an explicit
limitation until name resolution and typing are designed. `\ket{00}` preserves
the literal token `00`; a future typing phase must distinguish basis bitstrings
from scalar numerals. Numeric tokens preserve their source spelling.

Parentheses and square brackets group expressions and allow comma-separated tuples.
Braces are reserved for mathematical command arguments and scripts. Standalone
`{a+b}c` is rejected because TeX hides those braces and would display `a+bc`;
write `(a+b)c` so that the visible formula preserves the grouping. An identifier or scripted identifier followed by
parentheses is function application; use `\cdot` when multiplication could be
ambiguous. Subscripts and superscripts accept one letter, one digit, a named symbol,
or a braced expression. Multi-character numeric scripts require braces: write
`x^{12}`, not `x^12`, because TeX scripts only the first character in the latter.
Repeated subscripts or superscripts are rejected.

Precedence, from tightest to loosest:

1. Subscripts and superscripts.
2. Function application and named mathematical functions.
3. Unary `+` and `-`.
4. Multiplication, division, and juxtaposition (left associative).
5. Tensor product.
6. Addition and subtraction.
7. Relations (`=`, `<`, `>`, `\le`, `\ge`, `\ne`, `\in`, `\subseteq`, `\approx`, `\equiv`, `:`).
8. Conjunction, disjunction, implication, and mappings/arrows.

Aggregates require an explicit lower limit or index set. Their body extends over
products and tensor products, stopping before an unbraced addition or relation.
Write `\sum_{x=0}^{N-1}(a_x + b_x)` for a compound summand. Quantifiers require a
comma separating binder and body. The AST records relation chains syntactically
as left-associated binaries; it does not give them a Boolean interpretation.

Supported named functions are `\sin`, `\cos`, `\tan`, `\exp`, `\log`, `\ln`,
`\min`, `\max`, `\Pr`, `\Tr`, and `\dim`. Other supported commands include Greek
letters, `\mathbb`, `\mathcal`, `\mathrm`, `\sum`, `\prod`, `\bigotimes`,
`\forall`, `\exists`, `\otimes`, `\cdot`, `\times`, `\mapsto`, `\to`, `\rightarrow`,
`\land`, `\lor`, `\wedge`, `\vee`, `\implies`, `\infty`, `\ell`, `\dagger`,
`\top`, `\bot`, `\emptyset`, `\cdots`, and `\ldots`. Relation aliases include
`\leq`, `\geq`, and `\neq`. `\left(...\right)` and `\left[...\right]` size visible
delimiters; their commands and delimiter shapes must match. Other sized delimiters
are outside this fragment. `\quad`, `\qquad`, and explicit spacing commands are cosmetic.

Unicode letters and `⊗ ∈ ≤ ≥ ≠ ≈ ↦ → ⇒ ∧ ∨ ∀ ∃ ∑ ∞ · −` are supported. TeX macro
definitions, `\input`, environments inside math, shell escape, embedded HTML, and
arbitrary commands are not. The prototype limits documents to 1,000,000 characters,
each expression to 32,768 characters, and group nesting to 128 levels.

## LaTeX exchange

The preview is live typesetting, not a bitmap and not a separate hand-maintained
formula. Edit the source and the paper view follows. The extension provides
LaTeX export and import of one explicitly delimited `qparam` environment from a
`.tex` document. See [the import example](../examples/paper-import.tex).

This is **not arbitrary-paper compilation**. Free prose and general LaTeX do not
uniquely specify programs or proof obligations. An explicit source block preserves
the document structure, while formulas use the supported mathematical fragment.
A future structured editor may render formulas directly at the caret and serialize
the same AST; this release uses a source editor beside a typeset paper preview.

## Next semantic decisions

Before claiming verification, we need a scoped, typed mathematical core; a precise
meaning for state and program variables; finite-dimensional quantum semantics;
checked Hoare rules; an assumption context; a certificate format; a Lean statement
translation; and proved connections for lowering and resource bounds. These are
research milestones. The current frontend makes the intended workflow concrete
without presenting them as completed work.
