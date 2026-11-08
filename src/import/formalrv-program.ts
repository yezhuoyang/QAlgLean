/** A strict, source-located reader for the authored FormalRV .prog dialect.
 * This imports syntax; it neither executes circuits nor validates their claims.
 */
export interface FormalRVLocation { path: string; line: number; endLine: number }
export interface FormalRVBlock extends FormalRVLocation {
  kind: 'use' | 'params' | 'arrays' | 'amps' | 'define' | 'map' | 'program' | 'gadget' | 'spec' | 'code';
  name?: string;
  source: string;
  program?: FormalRVProgram;
}
export interface FormalRVProgram {
  name: string;
  kind: 'program' | 'gadget';
  parameters: string[];
  capacity: { q: string; c?: string };
  body: FormalRVOperation[];
}
interface OperationLocation extends FormalRVLocation { source: string }
export type FormalRVOperation = OperationLocation & (
  | { kind: 'for'; index: string; from: string; to: string; reverse: boolean; body: FormalRVOperation[] }
  | { kind: 'if' | 'when'; condition: string; body: FormalRVOperation[]; otherwise: FormalRVOperation[] }
  | { kind: 'controlled'; control: string; body: FormalRVOperation[] }
  | { kind: 'measure'; operand: string; record: string }
  | { kind: 'gate'; name: string; arguments: string[] }
  | { kind: 'call'; name: string; arguments: string[]; placement: { name: string; arguments: string[] } }
);

const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
const gateArity: Record<string, number> = { H: 1, X: 1, Y: 1, Z: 1, S: 1, T: 1, CX: 2, CZ: 2, CCX: 3, SWAP: 2, Rz: 2 };
const MAX_SOURCE = 4 * 1024 * 1024;
const MAX_DEPTH = 64;

export class FormalRVSyntaxError extends Error {
  constructor(message: string, public readonly location: FormalRVLocation) {
    super(`${location.path}:${location.line}: ${message}`);
    this.name = 'FormalRVSyntaxError';
  }
}

function fail(message: string, location: FormalRVLocation): never { throw new FormalRVSyntaxError(message, location); }

/** Split only at top-level separators; malformed delimiters are never discarded. */
export function splitFormalRVArguments(source: string): string[] {
  if (!source.trim()) return [];
  const stack: string[] = [], result: string[] = [];
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c)) {
      if (stack.pop() !== ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[c]) throw new Error('Mismatched delimiters.');
    } else if (c === ',' && stack.length === 0) { result.push(source.slice(start, i).trim()); start = i + 1; }
  }
  if (stack.length) throw new Error('Unclosed delimiter.');
  result.push(source.slice(start).trim());
  if (result.some(part => !part)) throw new Error('Empty argument.');
  return result;
}

function closing(source: string, start: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  for (let i = start; i < source.length; i++) {
    if (pairs[source[i]]) stack.push(pairs[source[i]]);
    else if (')]}'.includes(source[i])) {
      if (stack.pop() !== source[i]) throw new Error('Mismatched delimiters.');
      if (!stack.length) return i;
    }
    if (stack.length > MAX_DEPTH) throw new Error(`Delimiter nesting exceeds ${MAX_DEPTH}.`);
  }
  throw new Error('Unclosed delimiter.');
}

interface LogicalLine extends FormalRVLocation { indent: number; text: string }
function logicalLines(lines: string[], path: string, firstLine: number): LogicalLine[] {
  const result: LogicalLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const begin = i, indent = lines[i].length - lines[i].trimStart().length;
    const stack: string[] = [];
    let text = '';
    do {
      const raw = lines[i];
      if (raw.includes('\t')) fail('Tabs are not allowed in source indentation.', { path, line: firstLine + i, endLine: firstLine + i });
      for (const c of raw) {
        if ('([{'.includes(c)) stack.push(c);
        else if (')]}'.includes(c) && stack.pop() !== ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[c]) {
          fail('Mismatched delimiters.', { path, line: firstLine + i, endLine: firstLine + i });
        }
        if (stack.length > MAX_DEPTH) fail(`Delimiter nesting exceeds ${MAX_DEPTH}.`, { path, line: firstLine + i, endLine: firstLine + i });
      }
      text += (text ? ' ' : '') + raw.trim();
      if (text.length > 262144) fail('Source operation exceeds 262144 characters.', { path, line: firstLine + begin, endLine: firstLine + i });
      if (!stack.length) break;
      i++;
      if (i >= lines.length) fail('Unclosed delimiter.', { path, line: firstLine + begin, endLine: firstLine + i - 1 });
    } while (true);
    result.push({ path, line: firstLine + begin, endLine: firstLine + i, indent, text });
  }
  return result;
}

function parseOperations(lines: LogicalLine[]): FormalRVOperation[] {
  let cursor = 0, count = 0;
  const sequence = (indent: number, depth: number): FormalRVOperation[] => {
    if (depth > MAX_DEPTH) fail(`Program nesting exceeds ${MAX_DEPTH}.`, lines[cursor]);
    const result: FormalRVOperation[] = [];
    while (cursor < lines.length && lines[cursor].indent >= indent) {
      const current = lines[cursor];
      if (current.indent !== indent) fail('Unexpected indentation.', current);
      if (current.text === 'else:') break;
      if (++count > 50000) fail('Program exceeds 50000 operations.', current);
      cursor++;
      const loc: OperationLocation = { path: current.path, line: current.line, endLine: current.endLine, source: current.text };
      const child = (): FormalRVOperation[] => {
        if (cursor >= lines.length || lines[cursor].indent <= indent) fail('Expected a nonempty indented body.', current);
        return sequence(lines[cursor].indent, depth + 1);
      };
      let match: RegExpExecArray | null;
      if ((match = /^for\s+(.+?)\s*≤\s*([A-Za-z][A-Za-z0-9_]*)\s*<\s*(.+):$/.exec(current.text))) {
        result.push({ ...loc, kind: 'for', from: match[1].trim(), index: match[2], to: match[3].trim(), reverse: false, body: child() });
      } else if ((match = /^for\s+(.+?)\s*>\s*([A-Za-z][A-Za-z0-9_]*)\s*≥\s*(.+):$/.exec(current.text))) {
        result.push({ ...loc, kind: 'for', from: match[3].trim(), index: match[2], to: match[1].trim(), reverse: true, body: child() });
      } else if ((match = /^(if|when)\s+(.+):$/.exec(current.text))) {
        const body = child();
        let otherwise: FormalRVOperation[] = [];
        if (cursor < lines.length && lines[cursor].indent === indent && lines[cursor].text === 'else:') { cursor++; otherwise = child(); }
        result.push({ ...loc, kind: match[1] as 'if' | 'when', condition: match[2].trim(), body, otherwise });
      } else if ((match = /^ctrl\s+(.+):$/.exec(current.text))) {
        result.push({ ...loc, kind: 'controlled', control: match[1].trim(), body: child() });
      } else if ((match = /^measure\s+(.+?)\s*↦\s*c\[(.+)\]$/.exec(current.text))) {
        result.push({ ...loc, kind: 'measure', operand: match[1].trim(), record: match[2].trim() });
      } else {
        match = /^([A-Za-z][A-Za-z0-9_]*)\s*\(/.exec(current.text);
        if (!match) fail(`Unsupported program operation: ${current.text}`, current);
        const first = current.text.indexOf('('), last = closing(current.text, first);
        const args = splitFormalRVArguments(current.text.slice(first + 1, last));
        const rest = current.text.slice(last + 1).trim();
        if (Object.hasOwn(gateArity, match[1])) {
          if (rest || args.length !== gateArity[match[1]]) fail(`Malformed ${match[1]} gate.`, current);
          result.push({ ...loc, kind: 'gate', name: match[1], arguments: args });
        } else {
          const placement = /^@\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/.exec(rest);
          if (!placement) fail('A gadget invocation requires an explicit @ map(...).', current);
          const pstart = rest.indexOf('('), pend = closing(rest, pstart);
          if (rest.slice(pend + 1).trim()) fail('Unexpected text after placement.', current);
          result.push({ ...loc, kind: 'call', name: match[1], arguments: args,
            placement: { name: placement[1], arguments: splitFormalRVArguments(rest.slice(pstart + 1, pend)) } });
        }
      }
    }
    return result;
  };
  if (!lines.length) return [];
  const result = sequence(lines[0].indent, 0);
  if (cursor !== lines.length) fail('Unmatched else or indentation.', lines[cursor]);
  return result;
}

function parseProgram(block: FormalRVBlock): FormalRVProgram {
  const lines = block.source.split('\n');
  let header = '', headerEnd = 0;
  for (; headerEnd < lines.length; headerEnd++) {
    header += (header ? ' ' : '') + lines[headerEnd].trim();
    // The header's final colon follows the footprint and optional scalar parameters.
    if (header.endsWith(':')) break;
  }
  const head = /^(program|gadget)\s+([A-Za-z][A-Za-z0-9_]*)\s*\[/.exec(header);
  if (!head) fail('Malformed program or gadget declaration.', block);
  const start = header.indexOf('['), end = closing(header, start);
  const footprint = splitFormalRVArguments(header.slice(start + 1, end));
  const capacity: { q: string; c?: string } = { q: '' };
  for (const item of footprint) {
    const field = /^(q|c)\s*:\s*(.+)$/.exec(item);
    if (!field) fail(`Unsupported footprint field: ${item}`, block);
    const key = field[1] as 'q' | 'c';
    if (capacity[key]) fail(`Duplicate ${key} footprint.`, block);
    capacity[key] = field[2];
  }
  if (!capacity.q) fail('Missing quantum footprint.', block);
  const suffix = header.slice(end + 1).trim();
  let parameters: string[] = [];
  if (head[1] === 'program') {
    if (suffix !== ':') fail('Unexpected text after program footprint.', block);
  } else {
    if (!suffix.startsWith('(')) fail('Missing gadget parameter list.', block);
    const close = closing(suffix, 0);
    if (suffix.slice(close + 1).trim() !== ':') fail('Unexpected text after gadget parameters.', block);
    parameters = splitFormalRVArguments(suffix.slice(1, close));
    if (parameters.some(parameter => !identifier.test(parameter)) || new Set(parameters).size !== parameters.length) fail('Malformed or duplicate gadget parameter.', block);
    if (parameters.some(parameter => parameter === 'q' || parameter === 'c')) fail('Scalar parameter collides with memory register.', block);
  }
  const body = parseOperations(logicalLines(lines.slice(headerEnd + 1), block.path, block.line + headerEnd + 1));
  if (!body.length) fail('Empty program body.', block);
  return { kind: head[1] as 'program' | 'gadget', name: head[2], parameters, capacity, body };
}

/** The caller reads stage folders through FormalRV's shared reader before calling this function. */
export function parseFormalRVSource(source: string, path = '<FormalRV source>'): FormalRVBlock[] {
  if (source.length > MAX_SOURCE) fail(`Source exceeds ${MAX_SOURCE} characters.`, { path, line: 1, endLine: 1 });
  const lines = source.replace(/\r/g, '').split('\n');
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (/^\S/.test(lines[i])) starts.push(i);
    else if (!starts.length) fail('Indented text before first declaration.', { path, line: i + 1, endLine: i + 1 });
  }
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const text = lines.slice(start, end).join('\n').trimEnd();
    const head = /^(use|params|arrays|amps|define|map|program|gadget|spec|code)\s+(.+)/.exec(text);
    const location = { path, line: start + 1, endLine: end };
    if (!head) fail(`Unsupported top-level declaration: ${lines[start]}`, location);
    const kind = head[1] as FormalRVBlock['kind'];
    const block: FormalRVBlock = { ...location, kind, source: text };
    if (['define', 'map', 'program', 'gadget', 'spec'].includes(kind)) block.name = /^([^\s([:]+)/.exec(head[2])?.[1];
    try { if (kind === 'program' || kind === 'gadget') block.program = parseProgram(block); }
    catch (error) { if (error instanceof FormalRVSyntaxError) throw error; fail((error as Error).message, block); }
    return block;
  });
}

/** Structural arithmetic retains its discrete operators; // cannot be used in QP because it starts a comment. */
export function formalRVIndex(source: string): string { return source.replace(/\/\//g, ' div ').replace(/\s+/g, ' ').trim(); }

export interface RenderedFormalRVProgram { text: string; operations: FormalRVOperation[] }
export function renderFormalRVProgram(block: FormalRVBlock, mathToLatex: (source: string) => string): RenderedFormalRVProgram {
  const program = block.program;
  if (!program) fail('Expected a parsed program or gadget.', block);
  const all: FormalRVOperation[] = [];
  const emit = (operations: FormalRVOperation[], depth: number): string[] => {
    const pad = '  '.repeat(depth), result: string[] = [];
    for (const operation of operations) {
      all.push(operation);
      const index = formalRVIndex;
      const q = (value: string) => `q[${index(value)}]`;
      const blockBody = (opening: string, body: FormalRVOperation[], otherwise?: FormalRVOperation[]) => {
        result.push(pad + opening + ' {', ...emit(body, depth + 1));
        if (otherwise?.length) result.push(pad + '} else {', ...emit(otherwise, depth + 1));
        result.push(pad + '}');
      };
      switch (operation.kind) {
        case 'for': blockBody(`${operation.reverse ? 'reverse ' : ''}repeat ${operation.index} in ${index(operation.from)}..${index(operation.to)}`, operation.body); break;
        case 'if': case 'when': blockBody(`${operation.kind} $${mathToLatex(operation.condition)}$`, operation.body, operation.otherwise); break;
        case 'controlled': blockBody(`controlled(${q(operation.control)})`, operation.body); break;
        case 'measure': result.push(`${pad}measure ${q(operation.operand)} -> c[${index(operation.record)}]`); break;
        case 'gate':
          result.push(operation.name === 'Rz'
            ? `${pad}RzDyadic(${q(operation.arguments[0])}, ${index(operation.arguments[1])})`
            : `${pad}${operation.name}(${operation.arguments.map(q).join(', ')})`);
          break;
        case 'call': result.push(`${pad}call ${operation.name}(q, c${operation.arguments.length ? ', ' : ''}${operation.arguments.map(index).join(', ')}) @ ${operation.placement.name}(${operation.placement.arguments.map(index).join(', ')})`); break;
      }
    }
    return result;
  };
  const lines = [`// FormalRV ${block.kind}: ${block.path}:${block.line}`,
    `algorithm ${program.name}(q : Qubit[], c : Bit[]${program.parameters.map(parameter => `, ${parameter} : Nat`).join('')}) {`,
    `  capacity q $${mathToLatex(program.capacity.q)}$`,
    `  capacity c $${mathToLatex(program.capacity.c ?? '0')}$`,
    ...emit(program.body, 1), '}'];
  return { text: lines.join('\n'), operations: all };
}
