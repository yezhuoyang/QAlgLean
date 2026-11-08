/** A deliberately finite mathematical syntax. No TeX is executed. */
export type MathNode =
  | { kind: 'number' | 'identifier'; value: string; start: number; end: number }
  | { kind: 'unary'; operator: string; operand: MathNode; start: number; end: number }
  | { kind: 'binary'; operator: string; left: MathNode; right: MathNode; start: number; end: number }
  | { kind: 'script'; base: MathNode; subscript?: MathNode; superscript?: MathNode; start: number; end: number }
  | { kind: 'group'; delimiter: string; elements: MathNode[]; start: number; end: number }
  | { kind: 'fraction'; numerator: MathNode; denominator: MathNode; start: number; end: number }
  | { kind: 'root' | 'ket' | 'bra' | 'norm' | 'style'; argument: MathNode; style?: string; start: number; end: number }
  | { kind: 'inner-product'; left: MathNode; right: MathNode; start: number; end: number }
  | { kind: 'application'; function: MathNode; argument: MathNode; start: number; end: number }
  | { kind: 'aggregate'; operator: string; lower?: MathNode; upper?: MathNode; body: MathNode; start: number; end: number }
  | { kind: 'quantifier'; operator: string; binder: MathNode; body: MathNode; start: number; end: number }
  | { kind: 'function'; name: string; argument: MathNode; start: number; end: number };

export class MathSyntaxError extends Error {
  constructor(message: string, public readonly offset: number, public readonly length = 1) {
    super(message);
    this.name = 'MathSyntaxError';
  }
}

interface Token { value: string; start: number; end: number; kind: 'name' | 'number' | 'symbol' | 'command' | 'eof'; sized?: 'left' | 'right' }
const identifiers = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi',
  'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
  'Upsilon', 'Phi', 'Psi', 'Omega', 'infty', 'ell', 'dagger', 'top', 'bot', 'emptyset', 'cdots', 'ldots',
]);
const functions = new Set(['sin', 'cos', 'tan', 'exp', 'log', 'ln', 'min', 'max', 'Pr', 'Tr', 'dim']);
const binaryCommands: Record<string, string> = {
  otimes: 'tensor', cdot: 'multiply', times: 'multiply', mapsto: 'maps-to', to: 'arrow', rightarrow: 'arrow',
  le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', approx: 'approximately', equiv: 'equivalent',
  in: 'in', subseteq: 'subset', land: 'and', wedge: 'and', lor: 'or', vee: 'or', implies: 'implies',
};
const specialCommands = new Set(['frac', 'sqrt', 'ket', 'bra', 'braket', 'norm', 'sum', 'prod', 'bigotimes', 'forall', 'exists', 'mathbb', 'mathcal', 'mathrm']);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const start = i;
    if (source[i] === '\\') {
      i++;
      if (',;! '.includes(source[i] ?? '\0')) { i++; continue; }
      const match = /^[A-Za-z]+/.exec(source.slice(i));
      if (!match) throw new MathSyntaxError('Expected a supported mathematical command after \\.', start);
      i += match[0].length;
      const name = match[0];
      if (name === 'left' || name === 'right') {
        while (i < source.length && /\s/.test(source[i])) i++;
        const delimiter = source[i];
        const expected = name === 'left' ? ['(', '['] : [')', ']'];
        if (!expected.includes(delimiter)) {
          throw new MathSyntaxError(`\\${name} must be followed by ${expected.join(' or ')} in the supported mathematical fragment.`, start, i - start);
        }
        tokens.push({ kind: 'symbol', value: delimiter, start, end: ++i, sized: name });
        continue;
      }
      if (['quad', 'qquad'].includes(name)) continue;
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
    if ('{}()[]_^+-*/=<>:,'.includes(source[i])) {
      tokens.push({ kind: 'symbol', value: source[i++], start, end: i }); continue;
    }
    const unicode: Record<string, string> = { '⊗': 'otimes', '∈': 'in', '≤': 'le', '≥': 'ge', '≠': 'ne', '≈': 'approx', '↦': 'mapsto', '→': 'to', '⇒': 'implies', '∧': 'land', '∨': 'lor', '∀': 'forall', '∃': 'exists', '∑': 'sum', '∞': 'infty', '·': 'cdot', '−': '-' };
    if (source[i] in unicode) {
      const value = unicode[source[i++]];
      tokens.push({ kind: value === '-' ? 'symbol' : 'command', value, start, end: i }); continue;
    }
    throw new MathSyntaxError(`Unexpected mathematical character ${JSON.stringify(source[i])}.`, i);
  }
  tokens.push({ kind: 'eof', value: '', start: source.length, end: source.length });
  return tokens;
}

const precedence: Record<string, number> = {
  'maps-to': 5, arrow: 5, implies: 6, or: 8, and: 9,
  '=': 10, '<': 10, '>': 10, '<=': 10, '>=': 10, '!=': 10, approximately: 10, equivalent: 10, in: 10, subset: 10, ':': 10,
  '+': 20, '-': 20, tensor: 30, multiply: 35, '*': 35, '/': 35,
};

class Parser {
  private cursor = 0;
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
    return token.kind === 'name' || token.kind === 'number' || ['{', '(', '['].includes(token.value) ||
      (token.kind === 'command' && !Object.hasOwn(binaryCommands, token.value));
  }
  private expression(min: number): MathNode {
    let left = this.atom();
    while (true) {
      const token = this.peek();
      if (token.value === '(' && (left.kind === 'identifier' || left.kind === 'script' || left.kind === 'application') && min <= 65) {
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
    if (token.value === '{') return this.group();
    if (token.kind === 'number' && token.value.length > 1) {
      throw new MathSyntaxError(`Use braces around a multi-character script: {${token.value}}. TeX otherwise applies the script to only its first character.`, token.start, token.end - token.start);
    }
    if (token.kind === 'name' || token.kind === 'number' || (token.kind === 'command' && identifiers.has(token.value))) {
      this.take();
      return { kind: token.kind === 'number' ? 'number' : 'identifier', value: token.kind === 'command' ? `\\${token.value}` : token.value, start: token.start, end: token.end };
    }
    throw new MathSyntaxError('Expected a script value; use braces for a compound subscript or exponent.', token.start);
  }
  private group(): MathNode {
    const opening = this.take();
    const closing = ({ '{': '}', '(': ')', '[': ']' } as Record<string, string>)[opening.value];
    const elements: MathNode[] = [];
    if (this.peek().value === closing) throw new MathSyntaxError('Empty mathematical groups are not supported.', this.peek().start);
    elements.push(this.expression(0));
    while (this.peek().value === ',') { this.take(); elements.push(this.expression(0)); }
    const end = this.expect(closing).end;
    return { kind: 'group', delimiter: opening.value + closing, elements, start: opening.start, end };
  }
  private requiredGroup(): MathNode {
    if (this.peek().value !== '{') throw new MathSyntaxError('Expected a braced argument {…}.', this.peek().start);
    return this.group();
  }
  private atom(): MathNode {
    const token = this.peek();
    if (token.value === '{') throw new MathSyntaxError('Use visible parentheses for mathematical grouping. Braces are reserved for command arguments and scripts.', token.start);
    if (['(', '['].includes(token.value)) return this.group();
    this.take();
    if (token.kind === 'number' || token.kind === 'name') return { kind: token.kind === 'name' ? 'identifier' : 'number', value: token.value, start: token.start, end: token.end };
    if (token.value === '+' || token.value === '-') {
      const operand = this.expression(60);
      return { kind: 'unary', operator: token.value, operand, start: token.start, end: operand.end };
    }
    if (token.kind === 'command') {
      if (identifiers.has(token.value)) return { kind: 'identifier', value: `\\${token.value}`, start: token.start, end: token.end };
      if (token.value === 'frac') {
        const numerator = this.requiredGroup();
        const denominator = this.requiredGroup();
        return { kind: 'fraction', numerator, denominator, start: token.start, end: denominator.end };
      }
      if (token.value === 'braket') {
        const left = this.requiredGroup();
        const right = this.requiredGroup();
        return { kind: 'inner-product', left, right, start: token.start, end: right.end };
      }
      if (['sqrt', 'ket', 'bra', 'norm', 'mathbb', 'mathcal', 'mathrm'].includes(token.value)) {
        const argument = this.requiredGroup();
        const kind = token.value === 'sqrt' ? 'root' : token.value === 'ket' ? 'ket' : token.value === 'bra' ? 'bra' : token.value === 'norm' ? 'norm' : 'style';
        return { kind, argument, ...(kind === 'style' ? { style: token.value } : {}), start: token.start, end: argument.end };
      }
      if (['sum', 'prod', 'bigotimes'].includes(token.value)) {
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
        if (!lower) throw new MathSyntaxError('An aggregate requires an explicit lower limit or index set.', token.start, token.end - token.start);
        const body = this.expression(21);
        return { kind: 'aggregate', operator: token.value, lower, upper, body, start: token.start, end: body.end };
      }
      if (token.value === 'forall' || token.value === 'exists') {
        const binder = this.expression(0);
        this.expect(',');
        const body = this.expression(0);
        return { kind: 'quantifier', operator: token.value, binder, body, start: token.start, end: body.end };
      }
      if (functions.has(token.value)) {
        const argument = this.expression(60);
        return { kind: 'function', name: token.value, argument, start: token.start, end: argument.end };
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
    if (['{', '(', '['].includes(token.value)) {
      delimiters.push(token);
      if (delimiters.length > 128) throw new MathSyntaxError('Mathematical nesting exceeds the prototype limit of 128.', token.start);
    } else if (['}', ')', ']'].includes(token.value)) {
      const opening = delimiters.pop();
      const expected = opening ? ({ '{': '}', '(': ')', '[': ']' } as Record<string, string>)[opening.value] : undefined;
      if (expected !== token.value) throw new MathSyntaxError('Mismatched mathematical delimiters.', token.start);
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
