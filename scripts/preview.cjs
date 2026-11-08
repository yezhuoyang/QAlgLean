/* Serve the exact VS Code paper renderer locally for visual QA, without editor APIs. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('../dist/language/document');
const { renderDocument } = require('../dist/preview/render');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.QPARAM_PREVIEW_PORT || 4173);
http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url.pathname === '/') {
    const file = url.searchParams.get('example') === 'fourier' ? 'fourier.qp' : 'bell.qp';
    const source = fs.readFileSync(path.join(root, 'examples', file), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(renderDocument(parseDocument(source), {
      katexCssUri: '/media/katex/katex.min.css', styleUri: '/media/preview.css', scriptUri: '/media/preview.js',
      cspSource: "'self'", nonce: 'qparam-local-visual-preview', sourceName: file
    }));
  }
  const allowed = /^\/media\/[a-zA-Z0-9_./-]+$/.test(url.pathname) && !url.pathname.includes('..');
  const target = path.resolve(root, '.' + url.pathname);
  if (!allowed || !target.startsWith(path.join(root, 'media') + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  const types = { '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`QParam paper preview: http://127.0.0.1:${port}`));
