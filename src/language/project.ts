import { Diagnostic, QDocument, parseDocument } from './document';

export interface ProjectOptions {
  /** Maximum distinct modules read, including the entry point. Default 128. */
  maxModules?: number;
  /** Maximum total UTF-8 source bytes read. Default 8 MiB. */
  maxBytes?: number;
  /** Maximum import depth. Default 64. */
  maxDepth?: number;
}
export interface QProject {
  document: QDocument;
  /** Normalized project-relative POSIX paths. A diamond dependency has one shared document object. */
  documents: Map<string, QDocument>;
}

/** Resolve a project-relative path, never a URL or an operating-system absolute path.
 * `relativeTo` is the importing file's path, not its containing directory.
 * Reading the resulting path remains the host's responsibility: hosts must also
 * enforce their workspace boundary against filesystem symlinks.
 */
export function normalizeProjectPath(path: string, relativeTo?: string): string {
  if (!path || path.startsWith('/') || /[\\:\u0000-\u001f\u007f?#]/.test(path)) {
    throw new Error('QP imports require a relative POSIX path without a URL, drive, backslash, query, or fragment.');
  }
  const base = relativeTo === undefined ? [] : normalizeProjectPath(relativeTo).split('/').slice(0, -1);
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!base.length) throw new Error('QP import escapes the project root.');
      base.pop();
    } else base.push(part);
  }
  if (!base.length || path.endsWith('/')) throw new Error('QP imports must name a source file.');
  return base.join('/');
}

function problemDocument(path: string, message: string): QDocument {
  return {
    name: path, title: path, description: '', sections: [],
    diagnostics: [{ message, line: 0, column: 0, length: 1, severity: 'error' }],
    program: { algorithms: [], oracles: [], classicals: [] }
  };
}

/** Resolve and check a QP module graph without executing or fetching anything.
 * The callback is deliberately synchronous and supplied by the host, so this
 * same reader works with editor buffers, a virtual filesystem, or local files.
 * Import errors become diagnostics; they never turn unknown calls into oracles.
 */
export function parseProject(entryPath: string, readSource: (path: string) => string, options: ProjectOptions = {}): QProject {
  const bounded = (value: number | undefined, fallback: number, ceiling: number): number =>
    value === undefined ? fallback : Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), ceiling) : fallback;
  const maxModules = bounded(options.maxModules, 128, 1024);
  const maxBytes = bounded(options.maxBytes, 8 * 1024 * 1024, 64 * 1024 * 1024);
  const maxDepth = bounded(options.maxDepth, 64, 128);
  const documents = new Map<string, QDocument>();
  const visiting = new Set<string>(), attempted = new Set<string>();
  let bytes = 0;
  const encoder = new TextEncoder();

  const read = (path: string, chain: string[]): QDocument => {
    const cached = documents.get(path);
    if (cached) return cached;
    if (visiting.has(path)) return problemDocument(path, `Cyclic QP import: ${[...chain, path].join(' -> ')}.`);
    if (chain.length > maxDepth) return problemDocument(path, `QP import depth exceeds ${maxDepth} at ${path}.`);
    if (attempted.size >= maxModules) return problemDocument(path, `QP project exceeds the ${maxModules}-module limit at ${path}.`);
    if (bytes >= maxBytes) return problemDocument(path, `QP project exceeds the ${maxBytes}-byte source limit at ${path}.`);
    attempted.add(path);
    let source: string;
    try {
      source = readSource(path);
      if (typeof source !== 'string') throw new Error('The source reader did not return text.');
    } catch (error) {
      const failed = problemDocument(path, `Cannot read QP module ${path}: ${error instanceof Error ? error.message : 'source unavailable'}.`);
      documents.set(path, failed);
      return failed;
    }
    bytes += encoder.encode(source).length;
    if (bytes > maxBytes) {
      const failed = problemDocument(path, `QP project exceeds the ${maxBytes}-byte source limit at ${path}.`);
      documents.set(path, failed);
      return failed;
    }
    visiting.add(path);
    try {
      // This first parse extracts imports using the real lexer, including its
      // handling of comments and multiline mathematical expressions. Its
      // unresolved-import diagnostics are replaced by the resolved second pass.
      const first = parseDocument(source);
      const dependencies = (first.imports ?? []).map(reference => {
        try { return read(normalizeProjectPath(reference, path), [...chain, path]); }
        catch (error) { return problemDocument(reference, (error as Error).message); }
      });
      const document = dependencies.length ? parseDocument(source, { imports: dependencies }) : first;
      const importSections = document.sections.filter(section => section.kind === 'import');
      // Keep diagnostics at the importing line while retaining the actionable
      // cause (missing file, malformed dependency, cycle, or project limit).
      dependencies.forEach((dependency, index) => {
        const cause = dependency.diagnostics.find(diagnostic => diagnostic.severity === 'error');
        const section = importSections[index];
        if (!cause || !section) return;
        const diagnostic = document.diagnostics.find(item => item.line === section.line && item.message.startsWith('Imported document '));
        const message = `Import ${JSON.stringify(section.importPath)}: ${cause.message}`;
        if (diagnostic) diagnostic.message = message;
        else document.diagnostics.push({ message, line: section.line, column: 0, length: section.source.length, severity: 'error' } satisfies Diagnostic);
      });
      documents.set(path, document);
      return document;
    } catch (error) {
      const failed = problemDocument(path, `Cannot parse QP module ${path}: ${error instanceof Error ? error.message : 'invalid source'}.`);
      documents.set(path, failed);
      return failed;
    } finally { visiting.delete(path); }
  };

  try { return { document: read(normalizeProjectPath(entryPath), []), documents }; }
  catch (error) { return { document: problemDocument(entryPath, (error as Error).message), documents }; }
}
