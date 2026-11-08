# QP 0.2: mathematical documents and parametric circuits

A `.qp` file combines a parametric circuit with paper-style mathematics. Its
mathematical regions use `$…$`; the VS Code mathematical editor renders those
regions in place and keeps program keywords visible. Source text remains the
saved representation. The [notation reference](math-support.md) specifies the
supported LaTeX fragment and syntax tree.

**This release parses syntax and circuit signatures. It does not verify claims.**
There is no quantum type checker, executable interpreter, Hoare kernel, resource
analyzer, or working Lean theorem bridge. Every specification below is an
authored obligation. The syntax is a versioned design proposal.

## A small document

```qp
qparam BellPair
title "A Bell pair"

state bell := $\frac{\ket{00}+\ket{11}}{\sqrt{2}}$

algorithm bell(q : Qubit[2]) {
  H(q[0])
  CX(q[0], q[1])
}

spec bell {
  requires $\ket{\psi}=\ket{0}\otimes\ket{0}$
  ensures $\ket{\psi}=\frac{\ket{00}+\ket{11}}{\sqrt{2}}$
  costs $G=2$
}

proof bell {
  goal $\braket{\psi}{\psi}=1$
  admit "Prove the gate semantics and normalization."
}
```

The mathematical name `\psi` is not yet linked to register `q`. Giving state
variables, binders, resource counters and theorem references precise scoped
meanings is part of the semantic design. Rendering a formula does not resolve
or prove it.

## Declarations and obligations

| Form | Purpose |
|---|---|
| `parameter n : Nat` | Document parameter; types are `Nat`, `Int`, `Real`, `Complex`, `Bool` |
| `assume positive : $n>0$` | Explicit mathematical premise |
| `state uniform := $...$` | Named mathematical expression, with no automatic state preparation |
| `oracle U(q : Qubit[n])` | Opaque external circuit with an explicit signature |
| `algorithm prepare(q : Qubit[n]) { ... }` | Structured parametric circuit body |
| `spec prepare { ... }` | Preconditions, postconditions, probability and cost obligations |
| `proof prepare { ... }` | Goals, missing proofs and unresolved external references |

Specification clauses are `requires`, `ensures`, `probability` and `costs`, each
followed by one mathematical region. Multiple clauses of a kind are permitted.
`costs $Q=k$` records a claim; it does not count operations.

Proof clauses are `goal $…$`, `admit "reason"` and
`by lean "Namespace.theorem"`. An `admit` remains an open proof obligation. A Lean
reference does not launch Lean, import a theorem or establish that its statement
matches the goal. Assumptions, admissions and eventual checked certificates need
distinct statuses in the future kernel.

## Parametric circuit core

The parser returns a structured circuit syntax tree: declarations, typed formal
parameters, gates, calls, control/adjoint modifiers, measurements, indexed loops,
mathematical angle arguments and arithmetic register selectors. These are data
structures for later elaboration and lowering, not executable semantics.

```qp
parameter n : Nat
oracle U(q : Qubit[n])

algorithm echo(control : Qubit, q : Qubit[n]) {
  controlled(control) call U(q)
  adjoint controlled(control) call U(q)
}
```

Primitive gates are `H`, `X`, `Y`, `Z`, `S`, `T`, `CX`, `CZ`, `SWAP`, `CCX` and
`reset`. `Rx`, `Ry`, `Rz` and `Phase` take a mathematical angle first:

```qp
Rz($\theta/2$, q[j])
controlled(q[k]) Phase($\pi/2^{k-j}$, q[j])
controlled(q[0..n-1]) Z(q[n-1])
adjoint controlled(control) call U(q)
```

Intended gate conventions are `Rz(θ) = exp(-iθZ/2)` (and analogously `Rx`, `Ry`)
and `Phase(θ) = diag(1, exp(iθ))`. A controlled register slice supplies all its
qubits as controls. Modifiers nest in source order; a future elaborator must
check unitary premises. Direct `reset` cannot be controlled or adjointed and is
rejected. Unitarity of a called algorithm or oracle is not established, including
one containing measurement.

Use `call name(...)` for reusable algorithms and opaque primitives. Forward
references are allowed. The parser checks that the name exists and the argument
count matches. Algorithms and oracles share a namespace; specifications and
proofs have separate namespaces. Built-in gates do not use `call`.

Formal parameters can be quantum registers or scalars:

```qp
oracle modular_power(j : Nat, work : Qubit[n])
oracle evolve(t : Real, q : Qubit[n])
```

Actual arguments can be registers, elements, slices, arithmetic expressions or
`$…$` mathematical expressions. A bare name is syntactically a register/name
reference; whether it denotes a scalar or quantum value needs type resolution.
Gate, measurement and control operands must name quantum parameters in the
current signature; arithmetic names must be declared scalar parameters or active
loop indices. These simple name checks catch typos. Call argument types, bounds,
disjointness and dimensions are not checked.

`q[j]` selects an element; `q[lo..hi]` selects a half-open slice. Loop ranges are
also half-open: `repeat j in 0..n` means `0` through `n-1`. Structural arithmetic
supports natural numerals, names, parentheses and `+ - * / ^`. Multiplication and
division bind tighter than addition/subtraction; exponentiation is right
associative. Division is intended as natural floor division. The parser neither
evaluates arithmetic nor proves validity of subtractions, bounds or dimensions.
Reusing an active loop index is rejected. Arithmetic nesting is limited to 64.

```qp
repeat j in 0..n {
  repeat k in j+1..n {
    controlled(q[k]) Phase($\pi/2^{k-j}$, q[j])
  }
}
measure q -> b
```

Measurement introduces an authored result name, without probability semantics
yet. Classical conditionals, recursion, allocation, return values, dependent
typing and general classical algorithms remain future extensions. An opaque
primitive is the visible implementation boundary today.

## Grammar

Each declaration or instruction occupies one logical line. A logical line can
span physical lines inside `$…$`. A final semicolon is optional. `//` starts a
comment outside mathematics and strings. Names match `[A-Za-z][A-Za-z0-9_]*`;
strings use JSON quotation and escapes. Indentation is free; follow example
spacing in document and specification forms.

```ebnf
document    = "qparam" name newline { declaration newline } ;
declaration = "title" string | "description" string
            | "parameter" name ":" scalar-type
            | "assume" name ":" math | "state" name ":=" math
            | "oracle" signature | algorithm | spec | proof ;
signature   = name "(" [formal { "," formal }] ")" ;
formal      = name ":" (scalar-type | "Qubit" [ "[" index "]" ]) ;
scalar-type = "Nat" | "Int" | "Real" | "Complex" | "Bool" ;
algorithm   = "algorithm" signature "{" newline { instruction newline } "}" ;
instruction = { modifier } (gate | "call" name) "(" [actuals] ")"
            | "measure" register "->" name
            | "repeat" name "in" index ".." index "{" newline
              { instruction newline } "}" ;
modifier    = "adjoint" | "controlled" "(" register { "," register } ")" ;
actuals     = actual { "," actual } ;
actual      = register | index | math ;
register    = name [ "[" index [ ".." index ] "]" ] ;
index       = natural | name | "(" index ")" | index ("+"|"-"|"*"|"/"|"^") index ;
math        = "$" expression "$" ;
spec        = "spec" name "{" newline { clause newline } "}" ;
clause      = ("requires" | "ensures" | "costs" | "probability") math ;
proof       = "proof" name "{" newline { proof-item newline } "}" ;
proof-item  = "goal" math | "admit" string | "by lean" string ;
```

The precedence rules above disambiguate `index`. There is exactly one initial
header and at most one title and description. Parameter, assumption and state
names cannot duplicate one another. Documents are limited to 1,000,000
characters; the editor has a smaller interactive limit. Mathematical limits are
specified in the [notation reference](math-support.md).

## LaTeX exchange and coverage

Export preserves mathematical source and labels proof status. Import reads one
explicit `qparam` environment from a `.tex` file; see
[the import example](../examples/paper-import.tex). Neither direction executes
arbitrary TeX or infers a program from prose.

The [algorithm coverage table](algorithm-coverage.md) distinguishes concrete
circuits, external interfaces and obligation-only notebooks. Before any
verification claim, we need mathematical name resolution, types, register
ownership, quantum semantics, Hoare rules, assumption dependencies, certificates,
a Lean statement bridge and proved resource-lowering rules. Parsing success
establishes none of these.
