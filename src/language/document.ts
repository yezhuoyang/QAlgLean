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
  kind: 'parameter' | 'assumption' | 'state' | 'oracle' | 'classical' | 'algorithm' | 'spec' | 'proof';
  name: string;
  line: number;
  endLine: number;
  source: string;
  items: Item[];
  circuit?: CircuitDeclaration;
}
export interface QDocument {
  name: string;
  title: string;
  description: string;
  sections: Section[];
  diagnostics: Diagnostic[];
  parserVersion?: string;
  program: { algorithms: CircuitDeclaration[]; oracles: CircuitDeclaration[]; classicals: CircuitDeclaration[] };
}

/** Structural circuit syntax. No constructor is a checked quantum operation. */
export type IndexExpression =
  | { kind: 'integer'; value: string }
  | { kind: 'variable'; name: string }
  | { kind: 'arithmetic'; operator: string; left: IndexExpression; right: IndexExpression };
export interface RegisterOperand { kind: 'register'; name: string; index?: IndexExpression; end?: IndexExpression }
export type CircuitArgument = RegisterOperand | { kind: 'index'; expression: IndexExpression }
  | { kind: 'math'; source: string; ast: MathNode };
export type CircuitValueType = 'Qubit' | 'Nat' | 'Int' | 'Real' | 'Complex' | 'Bool' | 'Bit' | 'Math';
export interface CircuitType { type: CircuitValueType; size?: IndexExpression }
export interface CircuitParameter extends CircuitType { name: string }
export interface MathematicalExpression { source: string; ast: MathNode }
export type ClassicalExpression = MathematicalExpression | { kind: 'classical-call'; name: string; arguments: CircuitArgument[] };
export type CircuitInstruction =
  | { kind: 'gate' | 'call'; name: string; arguments: CircuitArgument[]; modifiers: CircuitModifier[]; line: number }
  | { kind: 'repeat'; index: string; from: IndexExpression; to: IndexExpression; body: CircuitInstruction[]; line: number }
  | { kind: 'measure'; operand: RegisterOperand; result: string; line: number }
  | { kind: 'let' | 'var'; name: string; valueType: CircuitType; value: ClassicalExpression; line: number }
  | { kind: 'set'; name: string; value: ClassicalExpression; line: number }
  | { kind: 'if'; condition: MathematicalExpression; then: CircuitInstruction[]; otherwise: CircuitInstruction[]; line: number }
  | { kind: 'while'; condition: MathematicalExpression; body: CircuitInstruction[]; line: number }
  | { kind: 'assert' | 'invariant' | 'return'; expression: MathematicalExpression; line: number }
  | { kind: 'allocate'; name: string; valueType: CircuitType; line: number }
  | { kind: 'discard'; operand: RegisterOperand; line: number };
export type CircuitModifier = { kind: 'adjoint' } | { kind: 'controlled'; controls: RegisterOperand[] };
export interface CircuitDeclaration { name: string; parameters: CircuitParameter[]; body: CircuitInstruction[]; opaque: boolean; result?: CircuitType; line: number }

interface Statement { text: string; offset: number; line: number; endLine: number }
const name = '[A-Za-z][A-Za-z0-9_]*';
const gates: Record<string, number> = { H: 1, X: 1, Y: 1, Z: 1, S: 1, T: 1, CX: 2, CZ: 2, SWAP: 2, CCX: 3, reset: 1 };
const rotations = new Set(['Rx', 'Ry', 'Rz', 'Phase']);

/** Nat arithmetic used by circuit dimensions, indices and half-open ranges. */
export function parseIndex(source: string): IndexExpression {
  const tokens = source.match(/[A-Za-z][A-Za-z0-9_]*|[0-9]+|[()+*\-/^]|\S/g) ?? [];
  let cursor = 0, depth = 0;
  const expression = (minimum: number): IndexExpression => {
    if (++depth > 64) throw new Error('Circuit arithmetic nesting exceeds 64 levels.');
    const token = tokens[cursor++];
    let left: IndexExpression;
    if (token === '(') {
      left = expression(0);
      if (tokens[cursor++] !== ')') throw new Error('Expected ) in circuit arithmetic.');
    } else if (/^[0-9]+$/.test(token ?? '')) left = { kind: 'integer', value: token };
    else if (new RegExp(`^${name}$`).test(token ?? '')) left = { kind: 'variable', name: token };
    else throw new Error('Expected a natural numeral, name, or parenthesized circuit expression.');
    const precedence: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 };
    while (Object.hasOwn(precedence, tokens[cursor]) && precedence[tokens[cursor]] >= minimum) {
      const operator = tokens[cursor++];
      const right = expression(precedence[operator] + (operator === '^' ? 0 : 1));
      left = { kind: 'arithmetic', operator, left, right };
    }
    depth--;
    return left;
  };
  const result = expression(0);
  if (cursor !== tokens.length) throw new Error(`Unexpected circuit arithmetic token ${tokens[cursor]}.`);
  return result;
}

function splitArguments(source: string): string[] {
  if (!source.trim()) return [];
  let math = false, depth = 0, start = 0;
  const result: string[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '$') math = !math;
    if (math) continue;
    if ('(['.includes(source[i])) depth++;
    if (')]'.includes(source[i])) depth--;
    if (source[i] === ',' && depth === 0) { result.push(source.slice(start, i).trim()); start = i + 1; }
  }
  result.push(source.slice(start).trim());
  return result;
}

function parseRegister(source: string): RegisterOperand {
  const match = new RegExp(`^(${name})(?:\\[([^\\]]+)\\])?$`).exec(source.trim());
  if (!match) throw new Error('Expected a register, element q[j], or half-open slice q[lo..hi].');
  if (!match[2]) return { kind: 'register', name: match[1] };
  const bounds = match[2].split('..');
  if (bounds.length > 2) throw new Error('A register slice has exactly two endpoints.');
  return { kind: 'register', name: match[1], index: parseIndex(bounds[0]), ...(bounds.length === 2 ? { end: parseIndex(bounds[1]) } : {}) };
}

/**
 * Parse the QP 0.3 authoring fragment. This checks syntax only: successful parsing
 * establishes neither mathematical truth, program typing, nor a Hoare theorem.
 */
export function parseDocument(source: string): QDocument {
  const doc: QDocument = { name: 'Untitled', title: 'Untitled quantum document', description: '', sections: [], diagnostics: [], parserVersion: '0.3', program: { algorithms: [], oracles: [], classicals: [] } };
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
  interface LocalBinding extends CircuitType { mutable: boolean }
  type BlockInstruction = Extract<CircuitInstruction, { kind: 'repeat' | 'while' | 'if' }>;
  const blocks: { instruction: BlockInstruction; body: CircuitInstruction[]; locals: Map<string, LocalBinding>; inElse?: boolean }[] = [];
  const locals = new Map<string, LocalBinding>();
  const pendingCalls: { instruction: Extract<CircuitInstruction, { kind: 'gate' | 'call' }>; statement: Statement }[] = [];
  const pendingClassicalCalls: { expression: Extract<ClassicalExpression, { kind: 'classical-call' }>; statement: Statement }[] = [];
  const declarations = new Set<string>();
  const scalarParameters = new Set<string>();
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
  const parseType = (text: string): CircuitType => {
    const match = /^(Qubit|Nat|Int|Real|Complex|Bool|Bit|Math)(?:\[([^\]]+)\])?$/.exec(text.trim());
    if (!match || (match[2] !== undefined && match[1] !== 'Qubit' && match[1] !== 'Bit')) {
      throw new Error('Expected Qubit, Qubit[size], Bit, Bit[size], Nat, Int, Real, Complex, Bool, or Math.');
    }
    return { type: match[1] as CircuitValueType, ...(match[2] ? { size: parseIndex(match[2]) } : {}) };
  };
  const signature = (text: string, statement: Statement): CircuitParameter[] => {
    const names = new Set<string>();
    const parameters: CircuitParameter[] = [];
    for (const argument of splitArguments(text)) {
      const match = new RegExp(`^(${name})\\s*:\\s*(.+)$`).exec(argument);
      if (!match) {
        error('Algorithm arguments must be name : Type.', statement.offset, statement.text.length);
        continue;
      }
      if (names.has(match[1])) error(`Duplicate algorithm argument ${match[1]}.`, statement.offset, statement.text.length);
      names.add(match[1]);
      try {
        parameters.push({ name: match[1], ...parseType(match[2]) });
      } catch (err) { error((err as Error).message, statement.offset, statement.text.length); }
    }
    return parameters;
  };
  const binding = (identifier: string): LocalBinding | CircuitParameter | undefined => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const local = blocks[i].locals.get(identifier);
      if (local) return local;
    }
    return locals.get(identifier) ?? active!.circuit!.parameters.find(parameter => parameter.name === identifier);
  };
  const declareLocal = (identifier: string, value: LocalBinding): void => {
    if (binding(identifier) || scalarParameters.has(identifier)) throw new Error(`Local name ${identifier} is already active; shadowing is not supported.`);
    (blocks.at(-1)?.locals ?? locals).set(identifier, value);
  };
  const appendInstruction = (instruction: CircuitInstruction): void => {
    (blocks.at(-1)?.body ?? active!.circuit!.body).push(instruction);
  };
  const checkIndexNames = (expression: IndexExpression): void => {
    if (expression.kind === 'arithmetic') { checkIndexNames(expression.left); checkIndexNames(expression.right); }
    else if (expression.kind === 'variable' && !scalarParameters.has(expression.name)
      && !(binding(expression.name) && binding(expression.name)!.type !== 'Qubit')) throw new Error(`Unknown circuit index ${expression.name}.`);
  };
  const checkedRegister = (text: string, quantum = true): RegisterOperand => {
    const operand = parseRegister(text);
    const parameter = binding(operand.name);
    if (quantum && parameter?.type !== 'Qubit') throw new Error(`Unknown quantum register ${operand.name}; declare it in the circuit signature or allocate it.`);
    if (!quantum && !parameter && !scalarParameters.has(operand.name)) throw new Error(`Unknown circuit argument ${operand.name}.`);
    if (operand.index) checkIndexNames(operand.index);
    if (operand.end) checkIndexNames(operand.end);
    return operand;
  };
  const circuitArgument = (value: string, statement: Statement): CircuitArgument => {
    if (value.startsWith('$')) {
      const item = mathItem('angle', 'parameter', value, statement, statement.offset + statement.text.indexOf(value));
      active!.items.push(item);
      if (!item.ast) throw new Error('A circuit mathematical argument must have valid $…$ syntax.');
      return { kind: 'math', source: item.math!, ast: item.ast };
    }
    if (new RegExp(`^${name}(?:\\[.*\\])?$`).test(value)) return checkedRegister(value, false);
    const expression = parseIndex(value); checkIndexNames(expression);
    return { kind: 'index', expression };
  };
  const mathematical = (kind: string, expression: string, statement: Statement): MathematicalExpression => {
    const item = mathItem(kind, kind, expression, statement, statement.offset + statement.text.indexOf(expression));
    active!.items.push(item);
    if (!item.ast) throw new Error(`${kind} requires valid mathematical syntax delimited by $…$.`);
    return { source: item.math!, ast: item.ast };
  };
  const classicalExpression = (expression: string, statement: Statement): ClassicalExpression => {
    const call = new RegExp(`^call\\s+(${name})\\s*\\(([\\s\\S]*)\\)$`).exec(expression);
    if (!call) return mathematical('value', expression, statement);
    const result: Extract<ClassicalExpression, { kind: 'classical-call' }> = {
      kind: 'classical-call', name: call[1], arguments: splitArguments(call[2]).map(value => circuitArgument(value, statement))
    };
    pendingClassicalCalls.push({ expression: result, statement });
    return result;
  };

  for (const statement of statements) {
    const text = statement.text;
    if (active) {
      if (/^}\s*else\s*{$/.test(text)) {
        const block = blocks.at(-1);
        if (active.kind !== 'algorithm' || block?.instruction.kind !== 'if' || block.inElse) {
          error('else must immediately continue an open if block, once.', statement.offset, text.length);
        } else {
          block.body = block.instruction.otherwise;
          block.locals = new Map();
          block.inElse = true;
          active.items.push({ kind: 'branch', label: 'else', text, line: statement.line });
        }
        continue;
      }
      if (text === '}') {
        if (active.kind === 'algorithm' && blocks.length) {
          const block = blocks.pop()!;
          active.items.push({ kind: block.instruction.kind === 'repeat' ? 'loop-end' : 'block-end', label: 'end', text, line: statement.line });
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
        const repeat = new RegExp(`^repeat\\s+(${name})\\s+in\\s+(.+?)\\.\\.(.+?)\\s*\\{$`).exec(text);
        const measurement = new RegExp(`^measure\\s+(.+?)\\s*->\\s*(${name})$`).exec(text);
        const local = new RegExp(`^(let|var)\\s+(${name})\\s*:\\s*(.+?)\\s*:=\\s*([\\s\\S]+)$`).exec(text);
        const assignment = new RegExp(`^set\\s+(${name})\\s*:=\\s*([\\s\\S]+)$`).exec(text);
        const control = /^(if|while)\s+([\s\S]+)\s*\{$/.exec(text);
        const assertion = /^(assert|invariant|return)\s+([\s\S]+)$/.exec(text);
        const allocation = new RegExp(`^allocate\\s+(${name})\\s*:\\s*(.+)$`).exec(text);
        const discard = /^discard\s+(.+)$/.exec(text);
        try {
          if (repeat) {
            if (binding(repeat[1]) || scalarParameters.has(repeat[1])) throw new Error(`Loop index ${repeat[1]} is already active.`);
            const loop: Extract<CircuitInstruction, { kind: 'repeat' }> = { kind: 'repeat', index: repeat[1], from: parseIndex(repeat[2]), to: parseIndex(repeat[3]), body: [], line: statement.line };
            checkIndexNames(loop.from); checkIndexNames(loop.to);
            appendInstruction(loop);
            blocks.push({ instruction: loop, body: loop.body, locals: new Map([[loop.index, { type: 'Nat', mutable: false }]]) });
            active.items.push({ kind: 'loop', label: 'repeat', text, line: statement.line });
          } else if (control) {
            const condition = mathematical(control[1], control[2].trim(), statement);
            const instruction: BlockInstruction = control[1] === 'if'
              ? { kind: 'if', condition, then: [], otherwise: [], line: statement.line }
              : { kind: 'while', condition, body: [], line: statement.line };
            appendInstruction(instruction);
            blocks.push({ instruction, body: instruction.kind === 'if' ? instruction.then : instruction.body, locals: new Map() });
          } else if (local) {
            const valueType = parseType(local[3]);
            if (valueType.type === 'Qubit') throw new Error('Use allocate for quantum registers, not a classical local binding.');
            if (valueType.size) checkIndexNames(valueType.size);
            const value = classicalExpression(local[4], statement);
            declareLocal(local[2], { ...valueType, mutable: local[1] === 'var' });
            appendInstruction({ kind: local[1] as 'let' | 'var', name: local[2], valueType, value, line: statement.line });
            active.items.push({ kind: 'operation', label: local[1], text, line: statement.line });
          } else if (assignment) {
            const target = binding(assignment[1]);
            if (!target) throw new Error(`Unknown mutable local ${assignment[1]}.`);
            if (!('mutable' in target) || !target.mutable) throw new Error(`Cannot assign to ${assignment[1]}; declare a mutable local with var.`);
            appendInstruction({ kind: 'set', name: assignment[1], value: classicalExpression(assignment[2], statement), line: statement.line });
            active.items.push({ kind: 'operation', label: 'set', text, line: statement.line });
          } else if (assertion) {
            const kind = assertion[1] as 'assert' | 'invariant' | 'return';
            if (kind === 'invariant' && !blocks.some(block => block.instruction.kind === 'repeat' || block.instruction.kind === 'while')) throw new Error('An invariant must occur inside a repeat or while block.');
            if (kind === 'return' && !active.circuit!.result) throw new Error('A return expression requires an algorithm result type: algorithm name(...) -> Type {.');
            appendInstruction({ kind, expression: mathematical(kind, assertion[2], statement), line: statement.line });
          } else if (allocation) {
            const valueType = parseType(allocation[2]);
            if (valueType.type !== 'Qubit') throw new Error('allocate requires Qubit or Qubit[size].');
            if (valueType.size) checkIndexNames(valueType.size);
            declareLocal(allocation[1], { ...valueType, mutable: false });
            appendInstruction({ kind: 'allocate', name: allocation[1], valueType, line: statement.line });
            active.items.push({ kind: 'operation', label: 'allocate', text, line: statement.line });
          } else if (discard) {
            appendInstruction({ kind: 'discard', operand: checkedRegister(discard[1]), line: statement.line });
            active.items.push({ kind: 'operation', label: 'discard', text, line: statement.line });
          } else if (measurement) {
            const operand = checkedRegister(measurement[1]);
            declareLocal(measurement[2], { type: 'Bit', mutable: false });
            appendInstruction({ kind: 'measure', operand, result: measurement[2], line: statement.line });
            active.items.push({ kind: 'operation', label: 'measure', text, line: statement.line });
          } else {
            let remaining = text;
            const modifiers: CircuitModifier[] = [];
            while (/^(adjoint\s|controlled\s*\()/.test(remaining)) {
              if (remaining.startsWith('adjoint ')) { modifiers.push({ kind: 'adjoint' }); remaining = remaining.slice(8).trimStart(); }
              else {
                // Index arithmetic can contain parentheses, so scan the control list.
                const start = remaining.indexOf('(');
                let end = start + 1, depth = 1;
                for (; end < remaining.length && depth; end++) {
                  if (remaining[end] === '(') depth++;
                  if (remaining[end] === ')') depth--;
                }
                if (depth) throw new Error('Unclosed controlled(...) modifier.');
                const controls = splitArguments(remaining.slice(start + 1, end - 1));
                if (!controls.length) throw new Error('A controlled operation requires at least one control.');
                modifiers.push({ kind: 'controlled', controls: controls.map(control => checkedRegister(control)) });
                remaining = remaining.slice(end).trimStart();
              }
            }
            const operation = new RegExp(`^(call\\s+)?(${name})\\s*\\(([\\s\\S]*)\\)$`).exec(remaining);
            if (!operation) throw new Error('Unsupported program statement. Use a gate, call, local binding, allocation, control block, assertion, return, or measurement.');
            const isCall = !!operation[1], gate = operation[2];
            if (!isCall && !Object.hasOwn(gates, gate) && !rotations.has(gate)) throw new Error(`Unsupported program statement ${gate}; declared circuits use call ${gate}(...).`);
            const operands = splitArguments(operation[3]);
            const args = operands.map(value => circuitArgument(value, statement));
            if (!isCall) {
              const arity = rotations.has(gate) ? 2 : gates[gate];
              if (args.length !== arity) throw new Error(`${gate} requires ${arity} operand(s)${rotations.has(gate) ? ': a $…$ angle and a register' : ', such as q[0]'}.`);
              if (rotations.has(gate) && (args[0].kind !== 'math' || args[1].kind !== 'register')) throw new Error(`${gate} requires a $…$ angle followed by a register.`);
              if (!rotations.has(gate) && args.some(argument => argument.kind !== 'register')) throw new Error(`${gate} requires register operands.`);
              operands.slice(rotations.has(gate) ? 1 : 0).forEach(operand => checkedRegister(operand));
              if (gate === 'reset' && modifiers.length) throw new Error('reset is not unitary and cannot be controlled or adjointed.');
            }
            const instruction: Extract<CircuitInstruction, { kind: 'gate' | 'call' }> = { kind: isCall ? 'call' : 'gate', name: gate, arguments: args, modifiers, line: statement.line };
            appendInstruction(instruction);
            if (isCall) pendingCalls.push({ instruction, statement });
            active.items.push({ kind: 'operation', label: gate, text, line: statement.line });
          }
        } catch (err) { error((err as Error).message, statement.offset, text.length); }
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
    const parameter = new RegExp(`^parameter (${name}) : (Nat|Int|Real|Complex|Bool|Bit|Math)(\\[[^\\]]+\\])?$`).exec(text);
    if (parameter) {
      if (declarations.has(parameter[1])) error(`Duplicate declaration ${parameter[1]}.`, statement.offset, text.length);
      declarations.add(parameter[1]);
      scalarParameters.add(parameter[1]);
      try { parseType(parameter[2] + (parameter[3] ?? '')); }
      catch (err) { error((err as Error).message, statement.offset, text.length); }
      addSection('parameter', parameter[1], statement, { kind: 'declaration', label: parameter[1], text: parameter[2] + (parameter[3] ?? ''), line: statement.line });
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
    const oracle = new RegExp(`^oracle\\s+(${name})\\s*\\((.*)\\)$`).exec(text);
    if (oracle) {
      const circuit: CircuitDeclaration = { name: oracle[1], parameters: signature(oracle[2], statement), body: [], opaque: true, line: statement.line };
      const section = addSection('oracle', oracle[1], statement, { kind: 'declaration', label: oracle[1], text, line: statement.line });
      section.circuit = circuit; doc.program.oracles.push(circuit);
      continue;
    }
    const classical = new RegExp(`^classical\\s+(${name})\\s*\\((.*)\\)\\s*->\\s*(.+)$`).exec(text);
    if (classical) {
      const parameters = signature(classical[2], statement);
      try {
        const result = parseType(classical[3]);
        if (result.type === 'Qubit' || parameters.some(parameter => parameter.type === 'Qubit')) throw new Error('A classical external signature uses classical values; use oracle for quantum registers.');
        const circuit: CircuitDeclaration = { name: classical[1], parameters, result, body: [], opaque: true, line: statement.line };
        const section = addSection('classical', classical[1], statement, { kind: 'declaration', label: classical[1], text, line: statement.line });
        section.circuit = circuit; doc.program.classicals.push(circuit);
      } catch (err) { error((err as Error).message, statement.offset, text.length); }
      continue;
    }
    const algorithm = new RegExp(`^algorithm\\s+(${name})\\s*\\((.*)\\)\\s*(?:->\\s*(.+?)\\s*)?\\{$`).exec(text);
    const otherBlock = new RegExp(`^(spec|proof) (${name}) \\{$`).exec(text);
    if (algorithm || otherBlock) {
      if (algorithm) {
        active = addSection('algorithm', algorithm[1], statement);
        const circuit: CircuitDeclaration = { name: algorithm[1], parameters: signature(algorithm[2], statement), body: [], opaque: false, line: statement.line };
        if (algorithm[3]) {
          try { circuit.result = parseType(algorithm[3]); }
          catch (err) { error((err as Error).message, statement.offset, text.length); }
        }
        active.circuit = circuit; doc.program.algorithms.push(circuit);
        locals.clear(); blocks.length = 0;
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
    error(`Unclosed ${active.kind} ${active.name}${blocks.length ? ' (including a nested control block)' : ''}; expected }.`, activeOffset);
  }
  // Resolve only circuit names and argument counts. This is not quantum typing.
  const circuits = new Map<string, CircuitDeclaration>();
  for (const circuit of [...doc.program.algorithms, ...doc.program.oracles, ...doc.program.classicals]) {
    if (circuits.has(circuit.name)) error(`Duplicate circuit ${circuit.name}; algorithm, oracle, and classical names share a namespace.`, starts[circuit.line]);
    circuits.set(circuit.name, circuit);
  }
  for (const { instruction, statement } of pendingCalls) {
    const target = circuits.get(instruction.name);
    if (!target) error(`Unknown circuit ${instruction.name}; declare an algorithm or an explicit oracle signature.`, statement.offset, statement.text.length);
    else if (doc.program.classicals.includes(target)) error(`Classical external ${instruction.name} returns a value; bind its result with let or var.`, statement.offset, statement.text.length);
    else if (target.parameters.length !== instruction.arguments.length) error(`Circuit ${instruction.name} requires ${target.parameters.length} argument(s), received ${instruction.arguments.length}.`, statement.offset, statement.text.length);
  }
  for (const { expression, statement } of pendingClassicalCalls) {
    const target = circuits.get(expression.name);
    if (!target || (!target.result && !doc.program.classicals.includes(target))) error(`Unknown value-returning subroutine ${expression.name}; declare a classical signature or an algorithm with -> Type.`, statement.offset, statement.text.length);
    else if (target.parameters.length !== expression.arguments.length) error(`Classical call ${expression.name} requires ${target.parameters.length} argument(s), received ${expression.arguments.length}.`, statement.offset, statement.text.length);
  }
  return doc;
}
