/* Bundle the extension and copy local math fonts; the preview never needs a CDN. */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src/extension.ts')],
  outfile: path.join(root, 'dist/extension.js'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  external: ['vscode'], sourcemap: true, logLevel: 'info'
});
const target = path.join(root, 'media/katex');
const editorBundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/editor/client.ts')],
  outfile: path.join(root, 'media/editor.js'),
  bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
  minify: true, metafile: true, logLevel: 'info'
});
fs.mkdirSync(target, { recursive: true });
const katexRoot = path.dirname(require.resolve('katex/package.json'));
fs.copyFileSync(path.join(katexRoot, 'dist/katex.min.css'), path.join(target, 'katex.min.css'));
fs.copyFileSync(path.join(katexRoot, 'LICENSE'), path.join(target, 'LICENSE'));
fs.cpSync(path.join(katexRoot, 'dist/fonts'), path.join(target, 'fonts'), { recursive: true });
// Include licenses for every package actually incorporated in the browser bundle.
const packages = new Set();
for (const input of Object.keys(editorBundle.metafile.inputs)) {
  if (!input.replaceAll('\\', '/').includes('node_modules/')) continue;
  let directory = path.dirname(path.resolve(root, input));
  while (directory !== root && !fs.existsSync(path.join(directory, 'package.json'))) directory = path.dirname(directory);
  if (directory !== root) packages.add(directory);
}
const licenseDirectory = path.join(root, 'media/licenses');
fs.mkdirSync(licenseDirectory, { recursive: true });
for (const directory of packages) {
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const license = fs.readdirSync(directory).find(name => /^licen[sc]e(?:\.|$)/i.test(name));
  if (!license) throw new Error(`Bundled dependency has no license file: ${metadata.name}`);
  fs.copyFileSync(path.join(directory, license), path.join(licenseDirectory, metadata.name.replace(/[@/]/g, '_') + '.txt'));
}
