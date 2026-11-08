# Frontend and checking boundary

QParam Studio is the first authoring surface for the proposed QP language. The
repository name is QAlgLean. The extension identifier is
`yezhuoyang.qparam-studio`; the document language identifier is `qparam`.

## Current data flow

```text
.qp text
  → document grammar and mathematical parser
  → syntax tree with source positions and diagnostics
  → VS Code services and paper renderer
```

The paper renderer and the parser receive the same mathematical source. A rendered
formula is not evidence that the parser accepts it: unsupported syntax still
produces a diagnostic. Neither parsing nor rendering establishes truth.

The UI performs bounded, debounced parsing after edits. Source navigation uses
zero-based UTF-16 source positions. Formula copying copies the original LaTeX.
The webview retains theme and scroll state and includes all its fonts locally.

The extension never runs document code. A webview content-security policy blocks
external scripts and network connections. User text is escaped before HTML
insertion. KaTeX receives a fixed macro library with `trust: false`, expansion
limits, and size limits. The webview can ask the extension only to reveal a source
line or copy a bounded string. It cannot open arbitrary paths or execute commands.

## Intended independent QP kernel

The future kernel checks explicit certificates over a typed program and assertion
language. Parsing, UI rendering, proof search, and compiler optimization belong
outside that checking boundary. A successful judgment must retain its assumptions:

```text
QP checks a derivation under Γ
  ⇒ the specified program claim follows if Γ is valid
```

This requires a precise quantum/classical state model, sound inference rules,
termination and approximation conventions, and a connection between source and
checked objects. None of those correctness claims is implemented by the current
syntax parser. A proof of the abstract calculus will also need a connection to the
actual deployed checker implementation.

## Lean boundary

The proposed interface exports a typed QP mathematical obligation with a defined
Lean interpretation. Lean checks a proof of that interpretation; the bridge binds
the exact statement, definitions, parameters, hypotheses, dependencies, and
versions. An imported theorem keeps its external-checker provenance.

An unchecked statement is a premise, not a proved fact. `by lean` in this release
records author intent only. There is no subprocess, theorem importer, or success
badge behind it. An implementation must distinguish a checked QP derivation, a
mathematical premise discharged by Lean, and an intentionally unresolved premise.

## Lowering and resources

The frontend's `costs` and `probability` clauses state obligations. They neither
compute costs nor certify success probabilities. Later lowering stages must connect
program semantics, approximation errors, and the particular cost model. Oracle
queries, logical gate counts, and physical runtime must remain distinct quantities.

## Presentation versus semantics

The mathematical parser deliberately defines a bounded initial grammar. It records
syntax, not resolved variable types or physical state validity. For example,
scripts currently record notation; a type system must later distinguish a basis
index, an operator power, and an adjoint. This avoids silently treating attractive
notation as an already-verified interpretation.

Plain-text authoring and a rendered paper pane are the first interface. Future
editing directly in typeset mathematics should serialize the same structured
language, with source-preserving transformations and undo support.
