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
fs.mkdirSync(target, { recursive: true });
const katexRoot = path.dirname(require.resolve('katex/package.json'));
fs.copyFileSync(path.join(katexRoot, 'dist/katex.min.css'), path.join(target, 'katex.min.css'));
fs.copyFileSync(path.join(katexRoot, 'LICENSE'), path.join(target, 'LICENSE'));
fs.cpSync(path.join(katexRoot, 'dist/fonts'), path.join(target, 'fonts'), { recursive: true });
