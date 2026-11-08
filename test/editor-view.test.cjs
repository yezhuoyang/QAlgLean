const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpans, difference, mergeUnrelated } = require('../dist/editor/spans');
const { renderEditor } = require('../dist/editor/view');
const { codeMirrorSnippet } = require('../dist/editor/snippets');
const { snippet, nextSnippetField } = require('@codemirror/autocomplete');
const { EditorState } = require('@codemirror/state');
const { notations } = require('../dist/editor/notation');

test('inline math scanner retains exact UTF-16 spans and ignores strings and comments', () => {
  const source = 'title "cost $10"\n// $not_math$\nstate ψ := $\\sum_{x=0}^{N-1}\n \\alpha_x \\ket{x}$\nstate phi := $\\phi$';
  const spans = mathSpans(source);
  assert.equal(spans.length, 2);
  for (const span of spans) assert.equal(source.slice(span.from, span.to), '$' + span.latex + '$');
  assert.match(spans[0].latex, /\n/);
  assert.equal(spans[1].latex, '\\phi');
  assert.equal(mathSpans('state x := $x').length, 0);
  assert.equal(mathSpans('title "a \\" $x$"').length, 0);
  assert.equal(mathSpans('state x := $\\text{cost \\$1}$').length, 1);
});

test('minimal edits preserve Unicode pairs and apply exactly to original documents', () => {
  const pairs = [['a𝜓b', 'a𝜙b'], ['abc', 'abZc'], ['abc', 'ac'], ['', '𝜓'], ['state $ψ$', 'state $φ$'], ['𝜓𝜙', '𝜓']];
  for (const [before, after] of pairs) {
    const edit = difference(before, after);
    assert.ok(edit);
    assert.equal(before.slice(0, edit.from) + edit.text + before.slice(edit.to), after);
    assert.ok(!/^[\uDC00-\uDFFF]/.test(edit.text));
    assert.ok(!/[\uD800-\uDBFF]$/.test(edit.text));
    assert.ok(!/^[\uDC00-\uDFFF]/.test(before.slice(edit.to)));
  }
  assert.equal(difference('same', 'same'), undefined);
});

test('concurrent edits merge only when separate; conflicting drafts remain recoverable', () => {
  assert.equal(mergeUnrelated('alpha beta', 'ALPHA beta', 'alpha BETA'), 'ALPHA BETA');
  assert.equal(mergeUnrelated('alpha beta', 'alpha BETA', 'ALPHA beta'), 'ALPHA BETA');
  assert.equal(mergeUnrelated('x y', 'x z', 'prefix x y'), 'prefix x z');
  assert.equal(mergeUnrelated('x y', 'prefix x y', 'x z'), 'prefix x z');
  assert.equal(mergeUnrelated('abc', 'aXbc', 'aYbc'), undefined);
  assert.equal(mergeUnrelated('abc', 'aXc', 'aYc'), undefined);
  assert.equal(mergeUnrelated('abc', 'aXc', 'aXc'), 'aXc');
  assert.equal(mergeUnrelated('abc', 'abc', 'XYZ'), 'XYZ');
});

test('custom editor boot data is inert and uses only local assets', () => {
  const source = 'qparam Safe\ntitle "</script><img src=x onerror=alert(1)>"';
  const html = renderEditor({ source, version: 3, nonce: 'nonce', cspSource: "'self'", katexCssUri: '/media/katex/katex.min.css', styleUri: '/media/editor.css', scriptUri: '/media/editor.js', sourceName: '<unsafe>.qp' });
  assert.ok(html.includes('&lt;unsafe&gt;.qp'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('default-src &#39;none&#39;'));
  assert.ok(html.includes('id="math-mode" aria-pressed="true"'));
  const boot = html.match(/id="qparam-document">([^]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(boot), { source, version: 3 });
  assert.ok(!html.includes('https://'));
  const recovered = { source: '</script>unsaved $\\psi$', base: 'qparam Safe' };
  const recoveryHtml = renderEditor({ source: 'qparam Safe', version: 4, recovered, nonce: 'nonce', cspSource: "'self'", katexCssUri: '/katex.css', styleUri: '/editor.css', scriptUri: '/editor.js', sourceName: 'safe.qp' });
  assert.deepEqual(JSON.parse(recoveryHtml.match(/id="qparam-document">([^]*?)<\/script>/)[1]).recovered, recovered);
  assert.ok(!recoveryHtml.includes('</script>unsaved'));
});

test('real CodeMirror snippet insertion preserves nested TeX braces and repeated fields', () => {
  const expand = template => {
    const editor = { state: EditorState.create({ doc: '' }), dispatch: transaction => { editor.state = transaction.state; } };
    snippet(codeMirrorSnippet(template))(editor, null, 0, 0);
    for (let fields = 0; fields < 20 && nextSnippetField(editor); fields++) {
      for (const selection of editor.state.selection.ranges) assert.ok(selection.to <= editor.state.doc.length);
    }
    return editor.state.doc.toString();
  };
  assert.equal(expand(notations.find(n => n.name === 'sum').latex), '\\sum_{x=0}^{N-1} \\alpha_x \\ket{x}');
  assert.equal(expand(notations.find(n => n.name === 'tensor').latex), '\\bigotimes_{j=0}^{n-1} \\ket{0}_j');
  assert.equal(expand(notations.find(n => n.name === 'braket').latex), '\\braket{\\phi}{\\psi}');
  assert.equal(expand('\\left\\{${1:x}\\right\\}'), '\\left\\{x\\right\\}');
  for (const notation of notations) assert.ok(!expand(notation.latex).includes('${'), notation.name);
});
