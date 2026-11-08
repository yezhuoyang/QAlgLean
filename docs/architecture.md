# Frontend and checking boundary

QParam Studio is the first authoring surface for the proposed QP language. The
repository name is QAlgLean. The extension identifier is
`yezhuoyang.qparam-studio`; the document language identifier is `qparam`.

## Current data flow

```text
.qp text
  → document grammar and mathematical parser
  → syntax tree with source positions and diagnostics
  → VS Code mathematical editor, language services, and paper renderer
```

The paper renderer and the parser receive the same mathematical source. A rendered
formula is not evidence that the parser accepts it: unsupported syntax still
produces a diagnostic. Neither parsing nor rendering establishes truth.

The default `.qp` view is a VS Code `CustomTextEditorProvider`. VS Code owns its
`TextDocument`, dirty state, saving, and undo history. A CodeMirror view presents
the source with inline KaTeX formula widgets. Selecting a formula exposes its
LaTeX; moving away typesets it again. Keywords remain highlighted in both the
mathematical editor and the ordinary text editor. Both views edit the same file.
The editor uses VS Code theme variables and bundled fonts.

The UI performs bounded, debounced parsing after edits. Source navigation uses
zero-based UTF-16 source positions. The webview protocol normalizes line endings
to LF; the host maps offsets back to line/column positions, preserving CRLF files.
Writes carry the current document version and bounded, nonoverlapping edits.
Stale writes are rejected. The client buffers typing while an edit is pending;
overlapping concurrent changes require explicit conflict resolution. Source text
is never replaced by rendered HTML.

For named files, local text awaiting acknowledgment also has a bounded recovery
draft in VS Code's workspace storage. A recovered draft is offered explicitly on
reopening; it never silently replaces a file changed elsewhere. Applied drafts
are removed. Documents beyond 1,000,000 characters use the ordinary text editor.
This release allows one mathematical editor per file; ordinary text views can
still share its document. This keeps draft recovery owned by a single editing view.

The extension never runs document code. A webview content-security policy blocks
external scripts and network connections. User text is escaped before HTML
insertion. KaTeX receives a fixed macro library with `trust: false`, expansion
limits, and size limits. The paper webview can reveal a source line or copy a
bounded string. The editing webview can edit only its attached document and request
save, undo, redo, preview, or the ordinary source view. It cannot open arbitrary
paths or execute arbitrary commands. Host messages are validated before edits.

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

The mathematical editor is a presentation of the same structured source, not a
second source format. Its rendering engine accepts a broader presentation language
than the formal parser: a typeset expression can still have a syntax diagnostic.
The language reference and coverage tests define accepted syntax. Arbitrary TeX
execution and unreviewed macro definitions do not enter the language.

The implementation follows VS Code's [custom text editor model](https://code.visualstudio.com/api/extension-guides/custom-editors)
and [webview theming and security guidance](https://code.visualstudio.com/api/extension-guides/webview).
