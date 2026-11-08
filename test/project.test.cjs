const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProject, normalizeProjectPath } = require('../dist/language/project');

const circuit = name => `algorithm ${name}(q : Qubit) {\n  H(q)\n}`;
const source = (name, imports = [], body = circuit(name)) => `qparam ${name}\n${imports.map(path => `import ${JSON.stringify(path)}`).join('\n')}\n${body}\n`;
const errors = document => document.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
const reader = files => path => { if (!Object.hasOwn(files, path)) throw new Error('not found'); return files[path]; };

test('project imports resolve forward declarations and transitive dependencies', () => {
  const files = {
    'main.qp': source('main', ['lib/middle.qp'], 'algorithm main(q : Qubit) {\n  call leaf(q)\n  call middle(q)\n}'),
    'lib/middle.qp': source('middle', ['../shared/leaf.qp']),
    'shared/leaf.qp': source('leaf')
  };
  const project = parseProject('main.qp', reader(files));
  assert.deepEqual(errors(project.document), []);
  assert.equal(project.documents.size, 3);
  assert.equal(project.document.importedDocuments[0], project.documents.get('lib/middle.qp'));
  assert.equal(project.documents.get('lib/middle.qp').importedDocuments[0], project.documents.get('shared/leaf.qp'));
});

test('diamond imports read and retain a dependency once, avoiding duplicate declarations', () => {
  const files = {
    'main.qp': source('main', ['a.qp', 'b.qp']),
    'a.qp': source('a', ['./shared.qp']),
    'b.qp': source('b', ['dir/../shared.qp']),
    'shared.qp': source('shared')
  };
  const reads = [];
  const project = parseProject('./main.qp', path => { reads.push(path); return reader(files)(path); });
  assert.deepEqual(errors(project.document), []);
  assert.equal(reads.filter(path => path === 'shared.qp').length, 1);
  assert.equal(project.documents.get('a.qp').importedDocuments[0], project.documents.get('b.qp').importedDocuments[0]);
});

test('missing imports preserve source order and do not authorize unknown calls', () => {
  const files = {
    'main.qp': source('main', ['missing.qp', 'good.qp'], 'algorithm main(q : Qubit) {\n  call good(q)\n  call invented(q)\n}'),
    'good.qp': source('good')
  };
  const project = parseProject('main.qp', reader(files));
  assert.ok(errors(project.document).some(error => /Cannot read QP module missing.qp/.test(error.message) && error.line === 1));
  assert.ok(errors(project.document).some(error => /Unknown circuit invented/.test(error.message)));
  assert.ok(!errors(project.document).some(error => /Unknown circuit good/.test(error.message)));
  assert.equal(project.document.importedDocuments[1], project.documents.get('good.qp'));
});

test('cyclic imports become actionable diagnostics rather than recursive objects or stack overflow', () => {
  const files = { 'a.qp': source('a', ['b.qp']), 'b.qp': source('b', ['a.qp']) };
  const project = parseProject('a.qp', reader(files));
  assert.ok(errors(project.document).some(error => /Cyclic QP import: a.qp -> b.qp -> a.qp/.test(error.message)));
  assert.doesNotThrow(() => JSON.stringify(project.document));
  assert.equal(project.documents.size, 2);
});

test('unsafe imports and entry paths are rejected before the source callback', () => {
  const paths = ['/outside.qp', '../outside.qp', 'C:/outside.qp', 'https://example.org/module.qp', '..\\outside.qp', 'a.qp?query', 'a.qp#fragment', 'bad\u0000.qp'];
  for (const unsafe of paths) {
    const reads = [];
    const project = parseProject('main.qp', path => { reads.push(path); return source('main', [unsafe]); });
    assert.deepEqual(reads, ['main.qp'], unsafe);
    assert.ok(errors(project.document).length, unsafe);
    const invalidEntry = parseProject(unsafe, () => { throw new Error('must not read'); });
    assert.equal(invalidEntry.documents.size, 0, unsafe);
    assert.ok(errors(invalidEntry.document).length, unsafe);
  }
  assert.equal(normalizeProjectPath('../shared/./x.qp', 'lib/main.qp'), 'shared/x.qp');
  assert.equal(normalizeProjectPath('folder with spaces/file.qp'), 'folder with spaces/file.qp');
});

test('project limits bound module loads, source bytes and recursive depth', () => {
  const files = { 'a.qp': source('a', ['b.qp']), 'b.qp': source('b', ['c.qp']), 'c.qp': source('c') };
  const byModules = parseProject('a.qp', reader(files), { maxModules: 2 });
  assert.equal(byModules.documents.size, 2);
  assert.ok(errors(byModules.document).some(error => /2-module limit/.test(error.message)));
  const byDepth = parseProject('a.qp', reader(files), { maxDepth: 1 });
  assert.ok(errors(byDepth.document).some(error => /depth exceeds 1/.test(error.message)));
  const reads = [];
  const byBytes = parseProject('a.qp', path => { reads.push(path); return files[path]; }, { maxBytes: 5 });
  assert.deepEqual(reads, ['a.qp']);
  assert.ok(errors(byBytes.document).some(error => /5-byte source limit/.test(error.message)));
});

test('imports are discovered by the language lexer, not comments or quoted descriptions', () => {
  const text = 'qparam main\n// import "ignored.qp"\ndescription "import \\\"also ignored.qp\\\""\n' + circuit('main');
  const reads = [];
  const project = parseProject('main.qp', path => { reads.push(path); return text; });
  assert.deepEqual(reads, ['main.qp']);
  assert.deepEqual(errors(project.document), []);
});

test('dependency syntax errors identify their importing line', () => {
  const project = parseProject('main.qp', reader({ 'main.qp': source('main', ['bad.qp']), 'bad.qp': 'qparam bad\nunknown syntax\n' }));
  const error = errors(project.document).find(error => error.line === 1);
  assert.match(error.message, /Import "bad.qp": Unrecognized declaration/);
  assert.match(errors(project.documents.get('bad.qp'))[0].message, /Unrecognized declaration/);
});
