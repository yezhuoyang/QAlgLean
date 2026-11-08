const fs = require('node:fs');
const path = require('node:path');
const { generateFormalrvCorpus, validateFormalrvCorpus } = require('../dist/import/formalrv-corpus');

const repository = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: node scripts/import-formalrv.cjs [--check]');
const fixture = JSON.parse(fs.readFileSync(path.join(repository, 'test/fixtures/formalrv/gidney.json'), 'utf8'));
const corpus = generateFormalrvCorpus(fixture);
validateFormalrvCorpus(corpus);
const differences = [];
for (const [relativePath, source] of corpus.files) {
  const destination = path.join(repository, relativePath);
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== source) differences.push(relativePath);
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source, 'utf8');
  }
}
if (differences.length) throw new Error(`FormalRV generated corpus is stale: ${differences.join(', ')}. Run node scripts/import-formalrv.cjs.`);
console.log(`${check ? 'Checked' : 'Generated'} ${corpus.coverage.totals.modules} FormalRV modules: ${corpus.coverage.totals.algorithms} algorithms, ${corpus.coverage.totals.specifications} contracts, ${corpus.coverage.totals.definitionEquations} equations. Syntax only; claims are not verified.`);
