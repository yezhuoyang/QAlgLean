const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEdit, changedSource, documentLimit } = require('../dist/editor/protocol');
const request = (changes, version = 7) => ({ type: 'edit', requestId: 1, version, changes });

test('versioned edits reject stale writes and malformed or overlapping ranges', () => {
  const text = 'qparam Demo\nstate psi := $α$\n';
  const good = request([{ from: text.indexOf('α'), to: text.indexOf('α') + 1, text: '\\psi' }]);
  assert.ok(validateEdit(text, 7, good));
  assert.ok(changedSource(text, good.changes).includes('$\\psi$'));
  assert.equal(validateEdit(text, 8, good), undefined, 'external edits cannot be overwritten');
  for (const changes of [
    [{ from: -1, to: 1, text: 'x' }],
    [{ from: 1, to: 0, text: 'x' }],
    [{ from: 0, to: text.length + 1, text: 'x' }],
    [{ from: 0, to: 4, text: 'x' }, { from: 3, to: 5, text: '' }],
    [{ from: 1, to: 1, text: 'x' }, { from: 1, to: 1, text: 'y' }],
    [{ from: 0, to: 0, text: 'x'.repeat(documentLimit) }],
    [{ from: 0, to: 0, text: null }],
  ]) assert.equal(validateEdit(text, 7, request(changes)), undefined);
});

test('UTF-16 ranges preserve supplementary mathematical characters', () => {
  const text = 'state psi := $𝜓$';
  const index = text.indexOf('𝜓');
  assert.equal(validateEdit(text, 7, request([{ from: index + 1, to: index + 2, text: 'x' }])), undefined);
  const edit = request([{ from: index, to: index + 2, text: '\\psi' }]);
  assert.ok(validateEdit(text, 7, edit));
  assert.equal(changedSource(text, edit.changes), 'state psi := $\\psi$');
});

test('the complete Gidney module can be edited within the bounded frontend limit', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../examples/formalrv/gidney2025.qp'), 'utf8');
  const edit = request([{ from: source.length, to: source.length, text: '\n' }]);
  assert.ok(validateEdit(source, 7, edit), 'the source-faithful module fits the editor, not only the batch parser');
  assert.equal(validateEdit('x'.repeat(documentLimit), 7, request([{ from: documentLimit, to: documentLimit, text: 'x' }])), undefined);
});
