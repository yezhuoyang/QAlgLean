import { MathNode, MathSyntaxError, parseMath } from './math';

export interface Diagnostic {
  message: string;
  /** Zero-based UTF-16 source coordinates, like VS Code. */
  line: number;
  column: number;
  length: number;
  severity: 'error' | 'warning';
}
export interface Item {
  kind: string;
  label: string;
  math?: string;
  text?: string;
  line: number;
  ast?: MathNode;
  /** Zero-based source column of the first mathematical character. */
  mathColumn?: number;
  mathLine?: number;
}
export interface Section {
  kind: 'parameter' | 'assumption' | 'state' | 'algorithm' | 'spec' | 'proof';
  name: string;
  line: number;
  endLine: number;
  source: string;
  items: Item[];
}
export interface QDocument {
  name: string;
  title: string;
  description: string;
  sections: Section[];
  diagnostics: Diagnostic[];
  parserVersion?: string;
}

interface Statement { text: string; offset: number; line: number; endLine: number }
const name = '[A-Za-z][A-Za-z0-9_]*';
const register = `${name}(?:\\[(?:[0-9]+|${name})\\])?`;
const gates: Record<string, number> = { H: 1, X: 1, Y: 1, Z: 1, S: 1, T: 1, CX: 2, CZ: 2, SWAP: 2, reset: 1 };

/**
 * Parse the QP 0.1 authoring fragment. This checks syntax only: successful parsing
 * establishes neither mathematical truth, program typing, nor a Hoare theorem.
 */
export function parseDocument(source: string): QDocument {
  const doc: QDocument = { name: 'Untitled', title: 'Untitled quantum document', description: '', sections: [], diagnostics: [], parserVersion: '0.1' };
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const position = (offset: number): { line: number; column: number } => {
    let low = 0, high = starts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (starts[mid] <= offset) low = mid; else high = mid - 1;
    }
    return { line: low, column: Math.max(0, offset - starts[low]) };
  };
  const error = (message: string, offset: number, length = 1): void => {
    doc.diagnostics.push({ message, ...position(offset), length: Math.max(1, length), severity: 'error' });
  };
  if (source.length > 1_000_000) {
    error('Document exceeds the 1,000,000-character prototype limit.', 0);
    return doc;
  }

  // Strip comments without changing offsets. Math may span physical lines.
  const statements: Statement[] = [];
  let pending = '', pendingOffset = 0, pendingLine = 0;
  let inMath = false;
  const lines = source.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line];
    let cleaned = '', inString = false, escaped = false;
    for (let col = 0; col < raw.length; col++) {
      const ch = raw[col];
      if (!inString && !inMath && ch === '/' && raw[col + 1] === '/') {
        cleaned += ' '.repeat(raw.length - col); break;
      }
      cleaned += ch;
      if (inString) {
        if (ch === '"' && !escaped) inString = false;
        escaped = ch === '\\' && !escaped;
      } else if (!inMath && ch === '"') { inString = true; escaped = false; }
      else if (ch === '$') inMath = !inMath;
    }
    if (!pending) { pendingOffset = starts[line]; pendingLine = line; }
    pending += cleaned;
    if (inMath && line < lines.length - 1) { pending += '\n'; continue; }
    const leading = pending.length - pending.trimStart().length;
    const text = pending.trim().replace(/;$/, '').trimEnd();
    if (text) statements.push({ text, offset: pendingOffset + leading, line: pendingLine, endLine: line });
    pending = '';
  }

  let header = false;
  let active: Section | undefined;
  let activeOffset = 0;
  const loops: string[] = [];
  const declarations = new Set<string>();
  const metadata = new Set<string>();
  const seenSections = new Set<string>();
  const finish = (section: Section, statement: Statement): void => {
    section.endLine = statement.endLine;
    section.source = source.slice(activeOffset, starts[statement.endLine] + lines[statement.endLine].length).trimEnd();
  };
  const addSection = (kind: Section['kind'], sectionName: string, statement: Statement, item?: Item): Section => {
    const key = `${kind}:${sectionName}`;
    if (seenSections.has(key)) error(`Duplicate ${kind} ${sectionName}.`, statement.offset, statement.text.length);
    seenSections.add(key);
    const section: Section = { kind, name: sectionName, line: statement.line, endLine: statement.endLine, source: statement.text, items: item ? [item] : [] };
    doc.sections.push(section);
    return section;
  };
  const mathItem = (kind: string, label: string, expression: string, statement: Statement, expressionOffset: number): Item => {
    const item: Item = { kind, label, line: statement.line };
    if (!expression.startsWith('$') || !expression.endsWith('$') || expression.length < 2 || expression.slice(1, -1).includes('$')) {
      error('Expected one mathematical expression delimited by $…$.', expressionOffset, Math.max(1, expression.length));
      item.text = expression;
      return item;
    }
    item.math = expression.slice(1, -1);
    const loc = position(expressionOffset + 1);
    item.mathLine = loc.line;
    item.mathColumn = loc.column;
    try { item.ast = parseMath(item.math); }
    catch (err) {
      if (err instanceof MathSyntaxError) error(err.message, expressionOffset + 1 + err.offset, err.length);
      else throw err;
    }
    return item;
  };
  const parseString = (text: string, statement: Statement): string | undefined => {
    try {
      const value: unknown = JSON.parse(text);
      if (typeof value === 'string') return value;
    } catch { /* Report an ordinary source diagnostic. */ }
    error('Expected a double-quoted string (JSON escapes are supported).', statement.offset, statement.text.length);
    return undefined;
  };

  for (const statement of statements) {
    const text = statement.text;
    if (active) {
      if (text === '}') {
        if (active.kind === 'algorithm' && loops.length) {
          loops.pop();
          active.items.push({ kind: 'loop-end', label: 'end', text, line: statement.line });
        } else { finish(active, statement); active = undefined; }
        continue;
      }
      if (active.kind === 'spec') {
        const clause = /^(requires|ensures|costs|probability)\s+([\s\S]+)$/.exec(text);
        if (!clause) error('Expected requires, ensures, costs, or probability followed by $…$.', statement.offset, text.length);
        else active.items.push(mathItem(clause[1], clause[1], clause[2], statement, statement.offset + text.indexOf(clause[2])));
      } else if (active.kind === 'proof') {
        const goal = /^goal\s+([\s\S]+)$/.exec(text);
        const reference = /^(admit|by lean)\s+([\s\S]+)$/.exec(text);
        if (goal) active.items.push(mathItem('goal', 'goal', goal[1], statement, statement.offset + text.indexOf(goal[1])));
        else if (reference) {
          const value = parseString(reference[2], statement);
          if (value !== undefined) active.items.push({ kind: reference[1] === 'admit' ? 'admit' : 'lean', label: reference[1] === 'admit' ? 'Assumption' : 'Lean reference', text: value, line: statement.line });
        } else error('Expected goal $…$, admit "reason", or by lean "Theorem.name". No proof is checked in this prototype.', statement.offset, text.length);
      } else {
        const repeat = new RegExp(`^repeat (${name}) in (0|[1-9][0-9]*|${name})\\.\\.(0|[1-9][0-9]*|${name}) \\{$`).exec(text);
        const operation = new RegExp(`^(${name})\\((.*)\\)$`).exec(text);
        const measurement = new RegExp(`^measure (${register}) -> (${name})$`).exec(text);
        if (repeat) {
          if (loops.includes(repeat[1])) error(`Loop index ${repeat[1]} is already active.`, statement.offset, text.length);
          loops.push(repeat[1]);
          active.items.push({ kind: 'loop', label: 'repeat', text, line: statement.line });
        } else if (measurement) active.items.push({ kind: 'operation', label: 'measure', text, line: statement.line });
        else if (operation && operation[1] in gates) {
          const operands = operation[2].split(',').map(value => value.trim());
          if (operands.length !== gates[operation[1]] || operands.some(value => !new RegExp(`^${register}$`).test(value))) {
            error(`${operation[1]} requires ${gates[operation[1]]} register operand(s), such as q[0].`, statement.offset, text.length);
          } else active.items.push({ kind: 'operation', label: operation[1], text, line: statement.line });
        } else error('Unsupported program statement. Use a supported gate call, measurement, or bounded repeat block.', statement.offset, text.length);
      }
      continue;
    }

    const documentHeader = new RegExp(`^qparam (${name})$`).exec(text);
    if (documentHeader) {
      if (header) error('A document has exactly one qparam header.', statement.offset, text.length);
      else { doc.name = documentHeader[1]; if (!metadata.has('title')) doc.title = doc.name; header = true; }
      continue;
    }
    if (!header) error('The first declaration must be qparam followed by a document name.', statement.offset, text.length);
    const meta = /^(title|description)\s+([\s\S]+)$/.exec(text);
    if (meta) {
      if (metadata.has(meta[1])) error(`Duplicate ${meta[1]}.`, statement.offset, text.length);
      metadata.add(meta[1]);
      const value = parseString(meta[2], statement);
      if (value !== undefined) {
        if (meta[1] === 'title') doc.title = value; else doc.description = value;
      }
      continue;
    }
    const parameter = new RegExp(`^parameter (${name}) : (Nat|Int|Real|Complex)$`).exec(text);
    if (parameter) {
      if (declarations.has(parameter[1])) error(`Duplicate declaration ${parameter[1]}.`, statement.offset, text.length);
      declarations.add(parameter[1]);
      addSection('parameter', parameter[1], statement, { kind: 'declaration', label: parameter[1], text: parameter[2], line: statement.line });
      continue;
    }
    const expression = new RegExp(`^(assume|state) (${name}) (:=|:) ([\\s\\S]+)$`).exec(text);
    if (expression) {
      const expected = expression[1] === 'state' ? ':=' : ':';
      if (expression[3] !== expected) error(`Use ${expected} for ${expression[1]} declarations.`, statement.offset, text.length);
      if (declarations.has(expression[2])) error(`Duplicate declaration ${expression[2]}.`, statement.offset, text.length);
      declarations.add(expression[2]);
      addSection(expression[1] === 'assume' ? 'assumption' : 'state', expression[2], statement,
        mathItem('expression', expression[2], expression[4], statement, statement.offset + text.indexOf(expression[4])));
      continue;
    }
    const algorithm = new RegExp(`^algorithm (${name})\\((.*)\\) \\{$`).exec(text);
    const otherBlock = new RegExp(`^(spec|proof) (${name}) \\{$`).exec(text);
    if (algorithm || otherBlock) {
      if (algorithm) {
        const argumentsText = algorithm[2];
        const parameters = argumentsText ? argumentsText.split(',').map(value => value.trim()) : [];
        const argumentNames = new Set<string>();
        for (const parameterText of parameters) {
          const match = new RegExp(`^(${name}) : Qubit(?:\\[(?:[1-9][0-9]*|${name})\\])?$`).exec(parameterText);
          if (!match) error('Algorithm arguments must be name : Qubit or name : Qubit[size].', statement.offset, text.length);
          else if (argumentNames.has(match[1])) error(`Duplicate algorithm argument ${match[1]}.`, statement.offset, text.length);
          else argumentNames.add(match[1]);
        }
        active = addSection('algorithm', algorithm[1], statement);
      } else active = addSection(otherBlock![1] as 'spec' | 'proof', otherBlock![2], statement);
      activeOffset = statement.offset;
      continue;
    }
    error(text === '}' ? 'Unexpected closing brace.' : 'Unrecognized declaration. See the QP language reference for the supported fragment.', statement.offset, text.length);
  }
  if (!header && statements.length === 0) error('Start with qparam followed by a document name.', 0);
  if (active) {
    active.endLine = lines.length - 1;
    active.source = source.slice(activeOffset);
    error(`Unclosed ${active.kind} ${active.name}${loops.length ? ' (including a repeat block)' : ''}; expected }.`, activeOffset);
  }
  // References are deliberately not resolved: this is an authoring parser, not a linker or verifier.
  return doc;
}
