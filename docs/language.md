# QP 0.4: mathematical documents and parametric programs

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
| `parameter n : Nat` | Document parameter; types are `Nat`, `Int`, `Real`, `Complex`, `Bool`, `Bit`, `Math`; classical arrays use `Nat[]`, `Bit[n]`, etc. |
| `import "arithmetic.qp"` | Import actual QP declarations through a project reader |
| `define width(n : Math) := $n+1$` | Mathematical definition with an explicit argument signature |
| `map shift(b : Nat)(i : Nat) := $b+i$` | Parametric quantum-wire placement map |
| `configuration surface $d=31$` | Authored lowering configuration, without a checked machine interpretation |
| `assume positive : $n>0$` | Explicit mathematical premise |
| `state uniform := $...$` | Named mathematical expression, with no automatic state preparation |
| `oracle U(q : Qubit[n])` | Opaque external circuit with an explicit signature |
| `classical gcd(a : Nat, b : Nat) -> Nat` | Opaque classical subroutine with an explicit result type |
| `algorithm prepare(q : Qubit[n]) { ... }` | Structured parametric circuit body |
| `spec prepare { ... }` | Preconditions, postconditions, probability and cost obligations |
| `proof prepare { ... }` | Goals, missing proofs and unresolved external references |

Specification clauses include `requires`, `assumes`, `ensures`, `probability` and `costs`, each
followed by one mathematical region. Multiple clauses of a kind are permitted.
`costs $Q=k$` records a claim; it does not count operations.

Proof clauses are `goal $…$`, `admit "reason"` and
`by lean "Namespace.theorem"`. An `admit` remains an open proof obligation. A Lean
reference does not launch Lean, import a theorem or establish that its statement
matches the goal. Assumptions, admissions and eventual checked certificates need
distinct statuses in the future kernel.

## Parametric circuit core

The parser returns a structured program syntax tree: declarations, typed formal
parameters, gates, calls, control/adjoint modifiers, measurements, indexed loops,
local bindings, conditionals, while loops, allocation, mathematical assertions,
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
count matches. Algorithms, oracles and classical declarations share a namespace; specifications and
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
current signature or locally allocated registers; arithmetic names must be
declared scalar parameters, local bindings or active loop indices. These simple name checks catch typos. Call argument types, bounds,
disjointness and dimensions are not checked.

`q[j]` selects an element; `q[lo..hi]` selects a half-open slice. Loop ranges are
also half-open: `repeat j in 0..n` means `0` through `n-1`. Structural arithmetic
supports natural numerals, names, parentheses, function calls, table access, unary
minus and `+ - * / div % ^ >> <<`. Multiplication, division and remainder bind tighter
than addition/subtraction; shifts bind below addition; exponentiation is right
associative and binds tighter than unary minus. `div` and `/` denote floor division
in this structural arithmetic. Use `div` when translating a source language's `//`:
`//` starts a QP comment. Function names and arities are resolved against `define`
signatures, with built-in two-argument `min` and `max`. The parser neither
evaluates arithmetic nor proves validity of subtractions, bounds or dimensions.
Reusing an active local or loop index is rejected. A loop may lexically shadow a
document parameter; after the loop the document parameter is visible again.
Arithmetic nesting and program control nesting are limited to 64.

```qp
repeat j in 0..n {
  repeat k in j+1..n {
    controlled(q[k]) Phase($\pi/2^{k-j}$, q[j])
  }
}
measure q -> b
```

Measurement introduces an immutable local result name, without probability
semantics yet. The parser records this as `Bit`; register measurement width and
dependent result typing remain work for an elaborator. An opaque primitive is
a visible implementation boundary, never an automatically implemented algorithm.

## Measured arithmetic and source contracts

The Gidney corpus requires persistent classical records, wire placement, descending
loops and contracts for coherent superpositions. These are explicit syntax:

```qp
map shift(b : Nat)(i : Nat) := $b+i$
algorithm release(q : Qubit[], c : Bit[], n : Nat) {
  capacity q $n$
  capacity c $n$
  reverse repeat j in 0..n {
    H(q[j])
    measure q[j] -> c[j]
    when c[j] {
      Z(q[j])
    }
  }
}
```

Empty brackets in `Qubit[]` and `Bit[]` leave capacity unspecified. `capacity q
$...$` and `capacity c $...$` preserve source footprints as mathematical clauses
before all instructions. They do not allocate memory or establish bounds.
`reverse repeat j in lo..hi` visits the same half-open range in descending order,
from `hi-1` to `lo`. The direction is retained in the program tree.

`measure q[j] -> c[k]` writes an existing `Bit` array slot. This is distinct from
measurement into a fresh local result. Optional measurement bases are written
`measure X q[j] -> c[k]`, `measure Y ...`, or `measure Z ...`; the default is Z.
`when c[k] { ... }` preserves record-dependent control, while `when $...$ { ... }`
admits mathematical guards such as parity over many recorded bits. The parser
checks indexed record names and their declared `Bit` array shape. It does not
establish record initialization, quantum typing, or the guard's meaning.

`controlled(q[k]) { ... }` records a common quantum control for a block.
`call release(q,c,n) @ shift(base)` preserves a placement-map application on the
quantum wires. Classical record indices remain as authored; quantum placement
does not also shift the record array. `RzDyadic(q[j], k)` retains FormalRV's
dyadic-depth rotation primitive without silently replacing it with an arbitrary
angle convention. Its semantics must be supplied by the future source bridge.

`atomic { ... }`, `parallel { ... }` and `parallel repeat j in lo..hi { ... }`
also have distinct syntax-tree nodes. They express scheduling intent; parsing
does not prove disjointness, construct a schedule, or establish a depth bound.
The current Gidney source bodies are translated without introducing these forms
where the source has only sequential loops.

```qp
spec release {
  bind $(\alpha,r)$
  requires $n>0$
  assumes $\sum_{z=0}^{2^{n}-1}\alpha(z)\ket{z}$
  ensures $\ket{0}$ given $c_{0}=r$
  outcomes $\Pr(c_{0}=r)=\abs{\alpha(r)}^{2}$
  resource meas := $n$
  resource toffoli := $0$
}
```

This illustrates the contract syntax, not a theorem about `release`. `bind`
records contract binders (`forall` is an alias); multiple names are grouped as
`$(\alpha,r)$`. `requires` records a mathematical premise; `assumes` can record
the input coherent state separately. An `ensures ... given ...` condition is
attached to that postcondition in the tree and must not become an unconditional
claim. `outcomes none` explicitly records no measurement outcomes. A named
`resource counter := $expression$` preserves each authored counter independently;
it is not a measured operation count or a verified resource bound.

## Mathematical definitions and modules

Definitions have an explicit signature, even when supplied as recursive equations:

```qp
define bit(x : Math, k : Math) := $\lfloor x/2^{k}\rfloor\bmod 2$
define popCount(n : Math, x : Math)
equation popCount(0, x) := $0$
equation popCount(n+1, x) := $\operatorname{popCount}(n,x)+\operatorname{bit}(x,n)$
```

Equation patterns have structural arithmetic trees. Definition and equation
arities are checked; mathematical argument types, recursive termination,
exhaustiveness, and correspondence between the signature and formula are not.
Source-translated mathematical functions use `Math` until that bridge is defined.
Document parameters may use Unicode names, including `parameter α : Math`.

`import "module.qp"` imports actual declarations, parameters, mathematical
definitions and maps. Missing files, cycles, unsafe paths and invalid imported
documents produce diagnostics. Imports are relative to their importing file and
remain inside the project root; there is no network import or arbitrary code
execution. The project reader bounds the dependency graph. The low-level
`parseDocument` API requires resolved imported documents in declaration order;
an import statement never makes unknown calls valid. Mathematical names inside
`$...$` still have no general scope or type resolution.

## Classical control and mathematical assertions

Literature algorithms often interleave a circuit with sampling, arithmetic,
postselection, and classical reconstruction. The program core records that
control structure explicitly:

```qp
classical sample(N : Nat) -> Nat
classical gcd(a : Nat, b : Nat) -> Nat

algorithm try_factor(N : Nat) -> Nat {
  var k : Nat := $0$
  while $k < N$ {
    invariant $0 \le k \le N$
    let a : Nat := call sample(N)
    let d : Nat := call gcd(a, N)
    if $1 < d < N$ {
      assert $d \mid N$
      return $d$
    } else {
      set k := $k + 1$
    }
  }
  return $1$
}
```

This is a control-flow example, not a factoring algorithm or a checked contract
for `sample` or `gcd`. A `classical` declaration supplies no implementation.
Named mathematical operators, for example `\operatorname{gcd}(a,N)` in a
formula, also have no evaluator. Explicit external calls make that boundary
visible in the program tree. A value-producing call can target a `classical`
declaration or an `algorithm` with an explicit result type. Name and argument
count are checked, while input and result type agreement are not yet checked.

`let` introduces an immutable local; `var` introduces a mutable local; `set`
updates only a mutable local. Right-hand sides are a single `$…$` expression
or `call name(...)`. Locals and measured results are scoped to their enclosing
block. An active name cannot be shadowed. The two branches of an `if` have
separate scopes; write the branch separator as `} else {` on one logical line.

`assert $…$` and `invariant $…$` record mathematical obligations, not successful
checks. An invariant must be inside a `repeat` or `while` block. `return $…$`
requires an explicit algorithm result type; path coverage, termination, and
agreement with that type are not checked. The parser does not resolve free
names inside mathematics, so scope checks on circuit operands should not be
mistaken for general mathematical name checking.

Use single-letter mathematical locals in this release when their occurrences
must be unambiguous: plain `xy` is a product, not a two-letter variable. Styled
labels and explicit named operators retain their syntax, but mapping them to
program bindings still requires the future mathematical name resolver.

`Math` denotes an opaque mathematical object at this syntax stage. Use it for
lattices, matrices, sets, distributions, and tuples whose dependent types have
not been elaborated. `Bit[n]` describes a classical bit register. This preserves
paper-level statements without pretending that arbitrary objects are qubits.

```qp
algorithm prepare_and_measure(n : Nat) -> Math {
  allocate q : Qubit[n]
  repeat j in 0..n {
    H(q[j])
  }
  measure q -> y
  discard q
  return $y$
}
```

`allocate` is intended to introduce fresh zero-initialized quantum storage;
`reset(q)` resets retained storage; `discard q` releases/traces out storage.
They are distinct syntax nodes. Allocation, ownership, initialization, linear
usage after discard, and the physical costs of reset and discard are not yet
given checked semantics. A compiler must establish those rules before execution
or resource claims. These operations cannot carry gate modifiers syntactically.

## Grammar

Each declaration or instruction occupies one logical line. A logical line can
span physical lines inside `$…$`. A final semicolon is optional. `//` starts a
comment outside mathematics and strings. Program names match `[A-Za-z][A-Za-z0-9_]*`;
document parameter names also accept Unicode letters and digits.
strings use JSON quotation and escapes. Indentation is free; follow example
spacing in document and specification forms.

```ebnf
document    = "qparam" name newline { declaration newline } ;
declaration = "title" string | "description" string
            | "parameter" name ":" classical-type
            | "assume" name ":" math | "state" name ":=" math
            | "oracle" signature | "classical" signature "->" classical-type
            | "import" string | definition | equation | map
            | "configuration" name math | algorithm | spec | proof ;
signature   = name "(" [formal { "," formal }] ")" ;
formal      = name ":" value-type ;
scalar-type = "Nat" | "Int" | "Real" | "Complex" | "Bool" | "Math" ;
classical-type = (scalar-type | "Bit") [ "[" [index] "]" ] ;
value-type  = classical-type | "Qubit" [ "[" [index] "]" ] ;
definition  = "define" signature [ ":=" math ] ;
equation    = "equation" name "(" [index { "," index }] ")" ":=" math ;
map         = "map" signature "(" name ":" "Nat" ")" ":=" math ;
algorithm   = "algorithm" signature [ "->" value-type ] "{" newline
              { "capacity" name math newline } { instruction newline } "}" ;
instruction = { modifier } (gate | "call" name) "(" [actuals] ")" [ "@" name "(" [index { "," index }] ")" ]
            | "measure" ["X"|"Y"|"Z"] register "->" (name | record)
            | ("let" | "var") name ":" classical-type ":=" value
            | "set" name ":=" value
            | ("assert" | "invariant" | "return") math
            | "allocate" name ":" "Qubit" [ "[" index "]" ]
            | "discard" register
            | "if" math "{" newline { instruction newline } "}"
              [ "else" "{" newline { instruction newline } "}" ]
            | "while" math "{" newline { instruction newline } "}"
            | "when" (math | record) "{" newline { instruction newline } "}"
            | "controlled" "(" register { "," register } ")" "{" newline { instruction newline } "}"
            | ("atomic" | "parallel") "{" newline { instruction newline } "}"
            | ["reverse" | "parallel"] "repeat" name "in" index ".." index "{" newline
              { instruction newline } "}" ;
value       = math | "call" name "(" [actuals] ")" ;
modifier    = "adjoint" | "controlled" "(" register { "," register } ")" ;
actuals     = actual { "," actual } ;
actual      = register | index | math ;
register    = name [ "[" index [ ".." index ] "]" ] ;
record      = name "[" index "]" ;
index       = natural | name | "(" index ")" | "-" index
            | name "(" [index { "," index }] ")" | name "[" index "]"
            | index ("+"|"-"|"*"|"/"|"div"|"%"|"^"|">>"|"<<") index ;
math        = "$" expression "$" ;
spec        = "spec" name "{" newline { clause newline } "}" ;
clause      = ("bind"|"forall"|"requires"|"assumes"|"costs"|"probability") math
            | "ensures" math [ "given" math ] | "outcomes" ("none" | math)
            | "resource" name ":=" math ;
proof       = "proof" name "{" newline { proof-item newline } "}" ;
proof-item  = "goal" math | "admit" string | "by lean" string ;
```

The precedence rules above disambiguate `index`. There is exactly one initial
header and at most one title and description. Parameter, assumption and state
names cannot duplicate one another. Documents are limited to 1,000,000
characters; the mathematical editor uses the same source limit. Mathematical limits are
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
