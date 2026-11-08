const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fixture = require('./fixtures/formalrv/gidney.json');
const { generateFormalrvCorpus, validateFormalrvCorpus } = require('../dist/import/formalrv-corpus');
const { parseFormalRVSource } = require('../dist/import/formalrv-program');
const { parseProject } = require('../dist/language/project');

const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const corpus = generateFormalrvCorpus(fixture);
const repository = path.resolve(__dirname, '..');

test('the checked-in Gidney corpus is exactly reproducible from its pinned source closure', () => {
  assert.deepEqual([...generateFormalrvCorpus(fixture).files], [...corpus.files]);
  for (const [relativePath, source] of corpus.files) {
    assert.equal(fs.readFileSync(path.join(repository, relativePath), 'utf8'), source, `${relativePath} is stale`);
  }
  assert.equal(corpus.coverage.status, 'syntax-transcribed-not-verified');
  assert.equal(corpus.coverage.revision, fixture.revision);
  assert.equal(corpus.coverage.totals.modules, 8);
  assert.equal(corpus.coverage.totals.algorithms, 106);
  assert.equal(corpus.coverage.totals.specifications, 104);
  assert.equal(corpus.coverage.totals.definitionEquations, 284);
  assert.equal(corpus.coverage.totals.operations, 560);
  assert.equal(corpus.coverage.totals.conditionalPostconditions, 6);
});

test('every source declaration and member has traceable generated coverage', () => {
  for (const source of fixture.sources) {
    const entry = corpus.coverage.sources.find(candidate => candidate.path === source.path);
    assert.ok(entry);
    assert.equal(entry.sha256, digest(source.text));
    assert.equal(entry.outputSha256, digest(corpus.files.get(entry.output)));
    const blocks = parseFormalRVSource(source.text, source.path);
    assert.equal(entry.declarations.length, blocks.length);
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index], declaration = entry.declarations[index];
      assert.equal(declaration.kind, block.kind);
      assert.equal(declaration.sourceSha256, digest(block.source));
      assert.deepEqual(declaration.sourceLines, [block.line, block.endLine]);
      if (declaration.disposition === 'deduplicated-import') {
        assert.equal(block.kind, 'use');
        assert.equal(declaration.generatedLines, null);
      } else {
        const [start, end] = declaration.generatedLines;
        const generated = corpus.files.get(entry.output).split('\n').slice(start - 1, end).join('\n');
        assert.ok(generated.trim(), `${block.path}:${block.line}`);
        if (block.kind === 'spec') assert.match(generated, new RegExp(`^spec ${block.name} \\{`));
        if (block.program) assert.ok(generated.includes(`algorithm ${block.name}(`));
      }
    }
    for (const member of entry.sourceMembers) assert.equal(member.sha256, digest(source.text.slice(member.from, member.to)));
  }
});

test('all five variant roots and all shared modules resolve and parse without opaque replacements', () => {
  assert.doesNotThrow(() => validateFormalrvCorpus(corpus));
  assert.equal(corpus.coverage.roots.length, 5);
  for (const entry of corpus.coverage.roots) {
    const project = parseProject(entry.output, dependency => corpus.files.get(dependency));
    assert.deepEqual(project.document.diagnostics.filter(diagnostic => diagnostic.severity === 'error'), []);
    assert.deepEqual(new Set(project.documents.keys()), new Set(entry.modules));
  }
  for (const [filename, source] of corpus.files) {
    if (!filename.endsWith('.qp')) continue;
    assert.doesNotMatch(source, /^\s*(?:oracle|classical|admit)\b/m, filename);
    assert.doesNotMatch(source, /TODO|placeholder|pass\s*$/m, filename);
  }
});

test('member imports are explicitly projected and duplicate imports do not duplicate code', () => {
  const lanes = corpus.coverage.sources.find(source => source.path.endsWith('Gidney2025FixedLanes.prog'));
  assert.ok(lanes.imports.length > 20);
  assert.ok(lanes.imports.every(item => item.projected));
  assert.equal(new Set(lanes.imports.map(item => item.qpModule)).size, 1);
  const source = corpus.files.get(lanes.output);
  assert.equal((source.match(/^import /gm) || []).length, 1);
  assert.ok(corpus.coverage.importProjection.includes('additional declarations'));
  const entry = corpus.coverage.roots.find(root => root.source === lanes.path);
  assert.equal(entry.originalImportedAlgorithms, 56);
  assert.deepEqual(entry.additionalAvailableAlgorithms, ['gidney2025', 'gPrimes', 'gApproxModexp', 'gOnePrime']);
});

test('projecting member imports does not change original named call targets or mathematical definitions', () => {
  const stageSources = new Map(fixture.sources.map(source => [source.path, source]));
  const originalText = sourcePath => {
    if (stageSources.has(sourcePath)) return stageSources.get(sourcePath).text;
    for (const source of fixture.sources) {
      const member = source.members.find(member => `${source.path}/${member.name}` === sourcePath);
      if (member) return source.text.slice(member.from, member.to);
    }
    throw new Error(`Unpinned source member ${sourcePath}`);
  };
  const operations = body => body.flatMap(operation => [operation,
    ...operations(operation.body || []), ...operations(operation.otherwise || [])]);
  for (const entry of corpus.coverage.roots) {
    const originalNodes = new Map();
    const visit = sourcePath => {
      if (originalNodes.has(sourcePath)) return;
      const blocks = parseFormalRVSource(originalText(sourcePath), sourcePath);
      originalNodes.set(sourcePath, blocks);
      for (const block of blocks.filter(block => block.kind === 'use')) {
        const edge = fixture.imports.find(item => item.from === sourcePath && item.import === block.source.slice(3).trim());
        assert.ok(edge, `${sourcePath}: ${block.source}`);
        visit(edge.to);
      }
    };
    visit(entry.source);
    const original = [...originalNodes.values()].flat();
    const projected = entry.modules.flatMap(output => {
      const source = corpus.coverage.sources.find(source => source.output === output);
      return parseFormalRVSource(stageSources.get(source.path).text, source.path);
    });
    const originals = original.filter(block => block.program), projections = projected.filter(block => block.program);
    for (const block of originals) {
      for (const call of operations(block.program.body).filter(operation => operation.kind === 'call')) {
        const before = originals.filter(candidate => candidate.name === call.name);
        const after = projections.filter(candidate => candidate.name === call.name);
        assert.equal(before.length, 1, `${entry.source}: original ${call.name}`);
        assert.equal(after.length, 1, `${entry.source}: projected ${call.name}`);
        assert.equal(digest(before[0].source), digest(after[0].source), `${entry.source}: changed call target ${call.name}`);
      }
    }
    for (const kind of ['define', 'map']) {
      const hashes = blocks => blocks.filter(block => block.kind === kind).map(block => digest(block.source)).sort();
      assert.deepEqual(hashes(original), hashes(projected), `${entry.source}: changed ${kind} declarations`);
    }
  }
});

test('missing source contracts remain an explicit coverage gap', () => {
  const gidney = corpus.coverage.roots.find(root => root.source.endsWith('/Gidney2025.prog'));
  assert.ok(gidney.algorithmsWithoutSourceContract.length > 0);
  const lanes = corpus.coverage.sources.find(source => source.path.endsWith('Gidney2025FixedLanes.prog'));
  const rest = lanes.contractsMissingStateClauses.find(contract => contract.name === 'gRestLane');
  assert.deepEqual(rest.missing, ['assumes', 'ensures']);
});

test('source tampering cannot silently regenerate a different corpus', () => {
  const altered = structuredClone(fixture);
  altered.sources[0].text += '\n';
  assert.throws(() => generateFormalrvCorpus(altered), /Pinned source hash mismatch/);
});
