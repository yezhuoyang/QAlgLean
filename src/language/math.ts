import {
  mathIdentifiers as identifiers, mathFunctions as functions, mathBinaryCommands as binaryCommands,
  mathSpecialCommands as specialCommands, mathStyles, mathAccents, mathAggregates,
  mathEnvironments, mathDelimiters,
} from './math-syntax';

/** A structural mathematical syntax. Parsing does not type-check or prove a claim. */
export type MathNode =
  | { kind: 'number' | 'identifier' | 'operator' | 'text'; value: string; start: number; end: number }
  | { kind: 'unary'; operator: string; operand: MathNode; start: number; end: number }
  | { kind: 'postfix'; operator: 'factorial' | 'double-factorial' | 'prime'; operand: MathNode; start: number; end: number }
  | { kind: 'binary'; operator: string; left: MathNode; right: MathNode; start: number; end: number }
  | { kind: 'script'; base: MathNode; subscript?: MathNode; superscript?: MathNode; start: number; end: number }
  | { kind: 'group'; delimiter: string; elements: MathNode[]; start: number; end: number }
  | { kind: 'fraction'; numerator: MathNode; denominator: MathNode; start: number; end: number }
  | { kind: 'root' | 'ket' | 'bra' | 'norm' | 'absolute' | 'style' | 'accent'; argument: MathNode; style?: string; degree?: MathNode; start: number; end: number }
  | { kind: 'inner-product' | 'outer-product' | 'set-builder' | 'binomial'; left: MathNode; right: MathNode; start: number; end: number }
  | { kind: 'application'; function: MathNode; argument: MathNode; start: number; end: number }
  | { kind: 'aggregate'; operator: string; lower?: MathNode; upper?: MathNode; body: MathNode; start: number; end: number }
  | { kind: 'quantifier'; operator: string; binder: MathNode; body: MathNode; start: number; end: number }
  | { kind: 'function'; name: string; argument: MathNode; subscript?: MathNode; superscript?: MathNode; start: number; end: number }
  | { kind: 'modulus'; expression: MathNode; modulus: MathNode; start: number; end: number }
  | { kind: 'table'; environment: string; rows: MathNode[][]; start: number; end: number }
  | { kind: 'relation-fragment'; operator: string; right: MathNode; start: number; end: number };

export class MathSyntaxError extends Error {
  constructor(message: string, public readonly offset: number, public readonly length = 1) {
    super(message);
    this.name = 'MathSyntaxError';
  }
}

interface Token { value: string; start: number; end: number; kind: 'name' | 'number' | 'symbol' | 'command' | 'operator' | 'text' | 'eof'; sized?: 'left' | 'right' }
const closingDelimiters: Record<string, string[]> = {
  '{': ['}'], '(': [')'], '[': [']'], 'set-open': ['set-close'],
  'angle-open': ['angle-close', 'abs-close'], 'abs-open': ['abs-close', 'angle-close'],
  'norm-open': ['norm-close'], 'floor-open': ['floor-close'], 'ceil-open': ['ceil-close'],
};
const allClosings = new Set(Object.values(closingDelimiters).flat());

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const start = i;
    if (source[i] === '\\') {
      i++;
      if (',;! '.includes(source[i] ?? '\0')) { i++; continue; }
      if (source[i] === '\\') { tokens.push({ kind: 'symbol', value: 'row-end', start, end: ++i }); continue; }
      if (source[i] === '{' || source[i] === '}') {
        tokens.push({ kind: 'symbol', value: source[i++] === '{' ? 'set-open' : 'set-close', start, end: i }); continue;
      }
      if (source[i] === '|') { tokens.push({ kind: 'symbol', value: 'norm-bar', start, end: ++i }); continue; }
      const match = /^[A-Za-z]+/.exec(source.slice(i));
      if (!match) throw new MathSyntaxError('Expected a supported mathematical command after \\.', start);
      i += match[0].length;
      const name = match[0];
      if (name === 'left' || name === 'right') {
        while (i < source.length && /\s/.test(source[i])) i++;
        let delimiter = source[i];
        if (delimiter === '\\') {
          const escaped = /^(?:\\([A-Za-z]+)|\\([{}|]))/.exec(source.slice(i));
          if (!escaped) throw new MathSyntaxError('Expected a supported mathematical delimiter.', i);
          i += escaped[0].length;
          delimiter = escaped[1] ? mathDelimiters[escaped[1]] : escaped[2] === '{' ? 'set-open' : escaped[2] === '}' ? 'set-close' : name === 'left' ? 'norm-open' : 'norm-close';
        } else {
          i++;
          if (delimiter === '|') delimiter = name === 'left' ? 'abs-open' : 'abs-close';
        }
        if (delimiter === 'bar') delimiter = name === 'left' ? 'abs-open' : 'abs-close';
        if (delimiter === 'norm-bar') delimiter = name === 'left' ? 'norm-open' : 'norm-close';
        if (!(name === 'left' ? Object.hasOwn(closingDelimiters, delimiter) && delimiter !== '{' : allClosings.has(delimiter) && delimiter !== '}')) {
          throw new MathSyntaxError(`\\${name} must be followed by a supported visible ${name === 'left' ? 'opening' : 'closing'} delimiter.`, start, i - start);
        }
        tokens.push({ kind: 'symbol', value: delimiter, start, end: i, sized: name });
        continue;
      }
      if (['quad', 'qquad'].includes(name)) continue;
      if (name === 'begin' || name === 'end' || name === 'operatorname' || name === 'text') {
        const argument = /^\s*\{([^{}\\]*)\}/.exec(source.slice(i));
        if (!argument) throw new MathSyntaxError(`\\${name} requires a plain braced argument without nested TeX commands.`, start, i - start);
        i += argument[0].length;
        const value = argument[1];
        if (name === 'begin' || name === 'end') {
          if (!mathEnvironments.has(value)) throw new MathSyntaxError(`Unsupported mathematical environment ${value}.`, start, i - start);
          tokens.push({ kind: 'symbol', value: `${name}:${value}`, start, end: i });
        } else {
          if (!(name === 'operatorname' ? /^[A-Za-z][A-Za-z0-9 ]*$/ : /^[A-Za-z0-9 .,:;!?=+()\/-]*$/).test(value)) {
            throw new MathSyntaxError(`\\${name} accepts plain ${name === 'operatorname' ? 'operator names' : 'ASCII labels'} only. Keep mathematical notation outside this label.`, start, i - start);
          }
          tokens.push({ kind: name === 'operatorname' ? 'operator' : 'text', value, start, end: i });
        }
        continue;
      }
      if (Object.hasOwn(mathDelimiters, name)) {
        tokens.push({ kind: 'symbol', value: mathDelimiters[name], start, end: i }); continue;
      }
      if (!identifiers.has(name) && !functions.has(name) && !Object.hasOwn(binaryCommands, name) && !specialCommands.has(name)) {
        throw new MathSyntaxError(`Unsupported mathematical command \\${name}. See the QP language reference.`, start, i - start);
      }
      tokens.push({ kind: 'command', value: name, start, end: i });
      continue;
    }
    const number = /^(?:[0-9]+(?:\.[0-9]+)?)/.exec(source.slice(i));
    if (number) {
      i += number[0].length;
      tokens.push({ kind: 'number', value: number[0], start, end: i });
      continue;
    }
    // Plain names are single letters, matching conventional mathematical juxtaposition.
    // Greek letters and other Unicode letters are equally valid single-letter names.
    const letter = /^\p{L}/u.exec(source.slice(i));
    if (letter) {
      i += letter[0].length;
      tokens.push({ kind: 'name', value: letter[0], start, end: i });
      continue;
    }
    const pair = source.slice(i, i + 2);
    if (['<=', '>=', '!=', '->', '=>'].includes(pair)) {
      i += 2; tokens.push({ kind: 'symbol', value: pair, start, end: i }); continue;
    }
    if ("{}()[]_^+-*/=<>:,&!'".includes(source[i])) {
      tokens.push({ kind: 'symbol', value: source[i++], start, end: i }); continue;
    }
    const visibleDelimiters: Record<string, string> = { '|': 'bar', '‖': 'norm-bar', '⟨': 'angle-open', '⟩': 'angle-close', '⌊': 'floor-open', '⌋': 'floor-close', '⌈': 'ceil-open', '⌉': 'ceil-close' };
    if (Object.hasOwn(visibleDelimiters, source[i])) {
      tokens.push({ kind: 'symbol', value: visibleDelimiters[source[i++]], start, end: i }); continue;
    }
    const unicode: Record<string, string> = { '⊗': 'otimes', '⊕': 'oplus', '∈': 'in', '∉': 'notin', '≤': 'le', '≥': 'ge', '≠': 'ne', '≈': 'approx', '≡': 'equiv', '↦': 'mapsto', '→': 'to', '⇒': 'implies', '∧': 'land', '∨': 'lor', '¬': 'neg', '∀': 'forall', '∃': 'exists', '∑': 'sum', '∏': 'prod', '∫': 'int', '∞': 'infty', '·': 'cdot', '−': '-', '∪': 'cup', '∩': 'cap', '⊆': 'subseteq', '⊂': 'subset', '∅': 'emptyset', '∂': 'partial', '∇': 'nabla' };
    if (source[i] in unicode) {
      const value = unicode[source[i++]];
      tokens.push({ kind: value === '-' ? 'symbol' : 'command', value, start, end: i }); continue;
    }
    throw new MathSyntaxError(`Unexpected mathematical character ${JSON.stringify(source[i])}.`, i);
  }
  // Unsized vertical bars are contextual delimiters. In an angle pair, a bar is
  // an inner separator; without a following angle close it terminates a bra.
  // Explicit \ket/\bra/\braket macros remain the unambiguous authoring form.
  const stack: string[] = [];
  let remainingAngleClosings = tokens.filter(token => token.value === 'angle-close').length;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.value === 'angle-close') remainingAngleClosings--;
    if (token.kind === 'symbol' && token.value === 'bar') {
      if (stack.at(-1) === 'angle-open' && remainingAngleClosings > 0) {
        token.kind = 'command'; token.value = 'mid';
      } else token.value = ['abs-open', 'angle-open'].includes(stack.at(-1) ?? '') ? 'abs-close' : 'abs-open';
    } else if (token.kind === 'symbol' && token.value === 'norm-bar') token.value = stack.at(-1) === 'norm-open' ? 'norm-close' : 'norm-open';
    if (Object.hasOwn(closingDelimiters, token.value)) stack.push(token.value);
    else if (allClosings.has(token.value)) stack.pop();
  }
  tokens.push({ kind: 'eof', value: '', start: source.length, end: source.length });
  return tokens;
}

const precedence: Record<string, number> = {
  'maps-to': 5, arrow: 5, 'left-arrow': 5, iff: 6, implies: 6, or: 8, and: 9, 'such-that': 7,
  '=': 10, '<': 10, '>': 10, '<=': 10, '>=': 10, '!=': 10, approximately: 10, equivalent: 10, in: 10, subset: 10, ':': 10,
  'not-in': 10, contains: 10, 'proper-subset': 10, 'proper-superset': 10, superset: 10,
  'asymptotic-equivalent': 10, similar: 10, congruent: 10, proportional: 10, parallel: 10,
  perpendicular: 10, 'much-less': 10, 'much-greater': 10, precedes: 10, 'precedes-or-equal': 10,
  succeeds: 10, 'succeeds-or-equal': 10,
  '+': 20, '-': 20, 'direct-sum': 20, union: 20, difference: 20, intersection: 25,
  tensor: 30, 'hadamard-product': 30, multiply: 35, '*': 35, '/': 35, modulo: 35, compose: 35, convolution: 35,
};

class Parser {
  private cursor = 0;
  private scriptDepth = 0;
  constructor(private readonly tokens: Token[]) {}
  private peek(): Token { return this.tokens[this.cursor]; }
  private take(): Token { return this.tokens[this.cursor++]; }
  private expect(value: string): Token {
    const token = this.peek();
    if (token.value !== value) throw new MathSyntaxError(`Expected ${JSON.stringify(value)}.`, token.start, Math.max(1, token.end - token.start));
    return this.take();
  }
  parse(): MathNode {
    const result = this.expression(0);
    if (this.peek().kind !== 'eof') throw new MathSyntaxError(`Unexpected ${JSON.stringify(this.peek().value)} after expression.`, this.peek().start);
    return result;
  }
  private startsAtom(token: Token): boolean {
    return ['name', 'number', 'operator', 'text'].includes(token.kind) || Object.hasOwn(closingDelimiters, token.value) || token.value.startsWith('begin:') ||
      (token.kind === 'command' && token.value !== 'pmod' && !Object.hasOwn(binaryCommands, token.value));
  }
  private expression(min: number): MathNode {
    let left = this.atom();
    while (true) {
      const token = this.peek();
      if ((token.value === '!' || token.value === "'") && min <= 75) {
        if (token.value === "'" && left.kind === 'script' && left.superscript) {
          throw new MathSyntaxError("A prime after an existing superscript needs parentheses, as in (x^2)', or belongs inside the exponent, as in x^{2\\prime}.", token.start);
        }
        this.take();
        let operator: 'factorial' | 'double-factorial' | 'prime' = token.value === '!' ? 'factorial' : 'prime';
        let end = token.end;
        if (token.value === '!' && this.peek().value === '!') {
          operator = 'double-factorial'; end = this.take().end;
          if (this.peek().value === '!') throw new MathSyntaxError('Use parentheses to distinguish iterated factorials; only ! and !! are supported.', this.peek().start);
        }
        left = { kind: 'postfix', operator, operand: left, start: left.start, end };
        continue;
      }
      if (token.value === '(' && (['identifier', 'operator', 'style', 'accent', 'script', 'application'].includes(left.kind) || (left.kind === 'postfix' && left.operator === 'prime')) && min <= 65) {
        const argument = this.group();
        left = { kind: 'application', function: left, argument, start: left.start, end: argument.end };
        continue;
      }
      if (token.value === '_' || token.value === '^') {
        if (70 < min) break;
        this.take();
        const argument = this.scriptArgument();
        const field = token.value === '_' ? 'subscript' : 'superscript';
        if (left.kind === 'script') {
          if (left[field]) throw new MathSyntaxError(`Duplicate ${field}.`, token.start);
          left = { ...left, [field]: argument, end: argument.end };
        } else left = { kind: 'script', base: left, [field]: argument, start: left.start, end: argument.end };
        continue;
      }
      if (token.kind === 'command' && token.value === 'pmod' && min <= 70) {
        this.take();
        const modulus = this.requiredGroup();
        left = { kind: 'modulus', expression: left, modulus, start: left.start, end: modulus.end };
        continue;
      }
      const explicit = token.kind === 'command' ? binaryCommands[token.value] : ({ '->': 'arrow', '=>': 'implies' } as Record<string, string>)[token.value] ?? token.value;
      const implicit = precedence[explicit] === undefined && this.startsAtom(token);
      const op = implicit ? 'multiply' : explicit;
      const rank = precedence[op];
      if (rank === undefined || rank < min) break;
      if (!implicit) this.take();
      const right = this.expression(rank + 1);
      left = { kind: 'binary', operator: op, left, right, start: left.start, end: right.end };
    }
    return left;
  }
  private scriptArgument(): MathNode {
    const token = this.peek();
    if (token.value === '{') {
      this.scriptDepth++;
      try { return this.group(); } finally { this.scriptDepth--; }
    }
    if (token.kind === 'number' && token.value.length > 1) {
      throw new MathSyntaxError(`Use braces around a multi-character script: {${token.value}}. TeX otherwise applies the script to only its first character.`, token.start, token.end - token.start);
    }
    if (token.kind === 'name' || token.kind === 'number' || (token.kind === 'command' && (identifiers.has(token.value) || token.value === 'perp'))) {
      this.take();
      return { kind: token.kind === 'number' ? 'number' : 'identifier', value: token.kind === 'command' ? `\\${token.value}` : token.value, start: token.start, end: token.end };
    }
    if (token.value === '*') {
      this.take();
      return { kind: 'identifier', value: '*', start: token.start, end: token.end };
    }
    throw new MathSyntaxError('Expected a script value; use braces for a compound subscript or exponent.', token.start);
  }
  private group(): MathNode {
    const opening = this.take();
    const closings = closingDelimiters[opening.value];
    const elements: MathNode[] = [];
    if (closings.includes(this.peek().value)) {
      if (opening.value !== 'set-open') throw new MathSyntaxError('Empty mathematical groups are not supported.', this.peek().start);
      return { kind: 'group', delimiter: 'set', elements, start: opening.start, end: this.take().end };
    }
    elements.push(this.expression(0));
    while (this.peek().value === ',') { this.take(); elements.push(this.expression(0)); }
    const closing = this.peek();
    if (!closings.includes(closing.value)) throw new MathSyntaxError('Expected a matching mathematical delimiter.', closing.start);
    this.take();
    const argument: MathNode = { kind: 'group', delimiter: opening.value + ':' + closing.value, elements, start: opening.start, end: closing.end };
    if (opening.value === 'abs-open' && closing.value === 'angle-close') return { kind: 'ket', argument, start: opening.start, end: closing.end };
    if (opening.value === 'angle-open' && closing.value === 'abs-close') return { kind: 'bra', argument, start: opening.start, end: closing.end };
    if (opening.value === 'abs-open') return { kind: 'absolute', argument, start: opening.start, end: closing.end };
    if (opening.value === 'norm-open') return { kind: 'norm', argument, start: opening.start, end: closing.end };
    return { ...argument, delimiter: ['{', '(', '['].includes(opening.value) ? opening.value + closing.value : opening.value.replace('-open', '') };
  }
  private requiredGroup(): MathNode {
    if (this.peek().value !== '{') throw new MathSyntaxError('Expected a braced argument {…}.', this.peek().start);
    return this.group();
  }
  private scripts(): { subscript?: MathNode; superscript?: MathNode } {
    const result: { subscript?: MathNode; superscript?: MathNode } = {};
    while (['_', '^'].includes(this.peek().value)) {
      const token = this.take();
      const field = token.value === '_' ? 'subscript' : 'superscript';
      if (result[field]) throw new MathSyntaxError(`Duplicate ${field}.`, token.start);
      result[field] = this.scriptArgument();
    }
    return result;
  }
  private table(): MathNode {
    const opening = this.take();
    const environment = opening.value.slice('begin:'.length);
    const rows: MathNode[][] = [];
    let row: MathNode[] = [];
    let needsCell = false;
    while (this.peek().value !== `end:${environment}`) {
      const token = this.peek();
      if (token.kind === 'eof' || token.value.startsWith('end:')) throw new MathSyntaxError(`Expected \\end{${environment}}.`, token.start);
      const operator = token.kind === 'command' ? binaryCommands[token.value] : token.value;
      if (environment === 'aligned' && precedence[operator] === 10) {
        this.take();
        const right = this.expression(0);
        row.push({ kind: 'relation-fragment', operator, right, start: token.start, end: right.end });
      } else row.push(this.expression(0));
      needsCell = false;
      if (row.length > 64 || rows.length >= 128) throw new MathSyntaxError('A mathematical table is limited to 128 rows and 64 columns.', token.start);
      if (this.peek().value === '&') { this.take(); needsCell = true; continue; }
      if (this.peek().value === 'row-end') { this.take(); rows.push(row); row = []; continue; }
      if (this.peek().value !== `end:${environment}`) throw new MathSyntaxError('Expected &, a row separator \\\\, or the end of the mathematical environment.', this.peek().start);
    }
    if (needsCell) throw new MathSyntaxError('Expected a mathematical expression after &.', this.peek().start);
    if (row.length) rows.push(row);
    if (!rows.length) throw new MathSyntaxError('A mathematical environment must contain at least one row.', opening.start);
    if (environment === 'cases' && rows.some(cells => cells.length !== 2)) throw new MathSyntaxError('Each cases row requires a value and condition separated by &.', opening.start);
    if (environment !== 'aligned' && rows.some(cells => cells.length !== rows[0].length)) throw new MathSyntaxError('Matrix rows must have equal numbers of columns.', opening.start);
    return { kind: 'table', environment, rows, start: opening.start, end: this.take().end };
  }
  private atom(): MathNode {
    const token = this.peek();
    if (token.value === '{') throw new MathSyntaxError('Use visible parentheses for mathematical grouping. Braces are reserved for command arguments and scripts.', token.start);
    if (Object.hasOwn(closingDelimiters, token.value)) return this.group();
    if (token.value.startsWith('begin:')) return this.table();
    this.take();
    if (this.scriptDepth && token.value === '*' && ['}', ','].includes(this.peek().value)) {
      return { kind: 'identifier', value: '*', start: token.start, end: token.end };
    }
    if (token.kind === 'number' || token.kind === 'name') return { kind: token.kind === 'name' ? 'identifier' : 'number', value: token.value, start: token.start, end: token.end };
    if (token.kind === 'operator' || token.kind === 'text') return { kind: token.kind, value: token.value, start: token.start, end: token.end };
    if (token.value === '+' || token.value === '-') {
      const operand = this.expression(60);
      return { kind: 'unary', operator: token.value, operand, start: token.start, end: operand.end };
    }
    if (token.kind === 'command') {
      if (identifiers.has(token.value)) return { kind: 'identifier', value: `\\${token.value}`, start: token.start, end: token.end };
      if (this.scriptDepth && ['otimes', 'oplus'].includes(token.value)) {
        const operand = this.expression(60);
        return { kind: 'unary', operator: token.value === 'otimes' ? 'tensor-power' : 'direct-sum-power', operand, start: token.start, end: operand.end };
      }
      if (this.scriptDepth && token.value === 'perp') return { kind: 'identifier', value: '\\perp', start: token.start, end: token.end };
      if (['frac', 'dfrac', 'tfrac'].includes(token.value)) {
        const numerator = this.requiredGroup();
        const denominator = this.requiredGroup();
        return { kind: 'fraction', numerator, denominator, start: token.start, end: denominator.end };
      }
      if (['braket', 'ip', 'ketbra', 'set', 'binom'].includes(token.value)) {
        const left = this.requiredGroup();
        const right = this.requiredGroup();
        const kind = token.value === 'ketbra' ? 'outer-product' : token.value === 'set' ? 'set-builder' : token.value === 'binom' ? 'binomial' : 'inner-product';
        return { kind, left, right, start: token.start, end: right.end };
      }
      if (['sqrt', 'ket', 'bra', 'norm', 'abs'].includes(token.value) || mathStyles.has(token.value) || mathAccents.has(token.value)) {
        const degree = token.value === 'sqrt' && this.peek().value === '[' ? this.group() : undefined;
        const argument = this.requiredGroup();
        const kind = token.value === 'sqrt' ? 'root' : token.value === 'ket' ? 'ket' : token.value === 'bra' ? 'bra' : token.value === 'norm' ? 'norm' : token.value === 'abs' ? 'absolute' : mathAccents.has(token.value) ? 'accent' : 'style';
        return { kind, argument, ...(kind === 'style' || kind === 'accent' ? { style: token.value } : {}), ...(degree ? { degree } : {}), start: token.start, end: argument.end };
      }
      if (mathAggregates.has(token.value)) {
        let lower: MathNode | undefined;
        let upper: MathNode | undefined;
        while (['_', '^'].includes(this.peek().value)) {
          const script = this.take();
          if (script.value === '_') {
            if (lower) throw new MathSyntaxError('Duplicate lower limit.', script.start);
            lower = this.scriptArgument();
          } else {
            if (upper) throw new MathSyntaxError('Duplicate upper limit.', script.start);
            upper = this.scriptArgument();
          }
        }
        if (!lower && !['int', 'iint', 'oint'].includes(token.value)) throw new MathSyntaxError('An aggregate requires an explicit lower limit or index set.', token.start, token.end - token.start);
        const body = this.expression(21);
        return { kind: 'aggregate', operator: token.value, lower, upper, body, start: token.start, end: body.end };
      }
      if (token.value === 'forall' || token.value === 'exists') {
        const binder = this.expression(0);
        this.expect(',');
        const body = this.expression(0);
        return { kind: 'quantifier', operator: token.value, binder, body, start: token.start, end: body.end };
      }
      if (token.value === 'neg' || token.value === 'lnot') {
        const operand = this.expression(10);
        return { kind: 'unary', operator: 'not', operand, start: token.start, end: operand.end };
      }
      if (functions.has(token.value)) {
        const scripts = this.scripts();
        const argument = this.expression(60);
        return { kind: 'function', name: token.value, argument, ...scripts, start: token.start, end: argument.end };
      }
    }
    throw new MathSyntaxError('Expected a mathematical expression.', token.start, Math.max(1, token.end - token.start));
  }
}

/** Offsets in returned nodes are zero-based UTF-16 offsets in `source`. */
export function parseMath(source: string): MathNode {
  if (source.length > 32_768) throw new MathSyntaxError('Mathematical expression exceeds the 32,768-character prototype limit.', 0);
  const tokens = tokenize(source);
  // Bound recursive descent to keep adversarial or accidentally deep input responsive.
  const delimiters: Token[] = [];
  for (const token of tokens) {
    if (Object.hasOwn(closingDelimiters, token.value)) {
      delimiters.push(token);
      if (delimiters.length > 128) throw new MathSyntaxError('Mathematical nesting exceeds the prototype limit of 128.', token.start);
    } else if (allClosings.has(token.value)) {
      const opening = delimiters.pop();
      const expected = opening ? closingDelimiters[opening.value] : [];
      if (!expected.includes(token.value)) throw new MathSyntaxError('Mismatched mathematical delimiters.', token.start);
      if (!!opening?.sized !== !!token.sized) {
        throw new MathSyntaxError(opening?.sized ? 'A \\left delimiter must close with a matching \\right delimiter.' : '\\right has no matching \\left delimiter.', token.start, token.end - token.start);
      }
    }
  }
  if (delimiters.length) {
    const opening = delimiters[delimiters.length - 1];
    throw new MathSyntaxError(opening.sized ? 'Unclosed \\left delimiter; expected a matching \\right delimiter.' : 'Unclosed mathematical delimiter.', opening.start, opening.end - opening.start);
  }
  try { return new Parser(tokens).parse(); }
  catch (error) {
    if (error instanceof RangeError) throw new MathSyntaxError('Mathematical expression exceeds the parser recursion limit.', 0);
    throw error;
  }
}

/** Canonicalize ASCII relation aliases for TeX without rewriting literal text labels.
 * This only changes presentation; document offsets and the editable source stay intact. */
export function toMathLatex(source: string): string {
  const replacements: Record<string, string> = { '<=': '\\le ', '>=': '\\ge ', '!=': '\\ne ', '->': '\\to ', '=>': '\\implies ' };
  let result = source;
  for (const token of tokenize(source).reverse()) {
    if (token.kind === 'symbol' && Object.hasOwn(replacements, token.value)) {
      result = result.slice(0, token.start) + replacements[token.value] + result.slice(token.end);
    }
  }
  return result;
}
