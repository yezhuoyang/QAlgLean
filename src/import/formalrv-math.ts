/** Structural transcription of the authored FormalRV expression dialect.
 * Names and operators survive in the tree; this is not a semantic checker.
 */
export type FormalrvMath =
  | { kind: 'name' | 'number'; value: string }
  | { kind: 'unary'; operator: string; value: FormalrvMath }
  | { kind: 'binary'; operator: string; left: FormalrvMath; right: FormalrvMath }
  | { kind: 'call'; name: string; arguments: FormalrvMath[] }
  | { kind: 'index'; base: FormalrvMath; index: FormalrvMath }
  | { kind: 'binder'; operator: string; variable: string; bound?: FormalrvMath; body: FormalrvMath }
  | { kind: 'conditional'; condition: FormalrvMath; yes: FormalrvMath; no: FormalrvMath };

interface Token { value: string; offset: number }
const precedence: Record<string, number> = {
  '↔': 4, '→': 5, '↦': 5, '∨': 8, '∧': 9,
  '=': 10, '≠': 10, '<': 10, '>': 10, '≤': 10, '≥': 10,
  '⊕': 15, '>>': 17, '<<': 17, '+': 20, '-': 20,
  '⊗': 25, '*': 30, '/': 30, '//': 30, '%': 30, '^': 40,
};
const comparisons = new Set(['=', '≠', '<', '>', '≤', '≥']);
const constructorArity: Record<string, number> = {
  ketat: 2, ketband: 4, ketmapped: 2,
  recordat: 1, recordband: 3, recordmapped: 1,
  qat: 1, qband: 3, qmapped: 1, probability: 1
};

export function parseFormalrvMath(source: string): FormalrvMath {
  if (source.length > 262144) throw new Error('FormalRV expression exceeds the transcription limit.');
  const tokens: Token[] = [];
  for (let i = 0; i < source.length;) {
    if (/\s/u.test(source[i])) { i++; continue; }
    const match = /^(?:[0-9]+(?:\.[0-9]+)?|[A-Za-z_][A-Za-z_0-9]*|[αβω]|>>|<<|\/\/|[ΣΠ∀∃⊗⊕∧∨¬≤≥≠→↦↔+*/%\^=<>(),.\[\]-])/.exec(source.slice(i));
    if (!match) throw new Error(`FormalRV math: unexpected ${JSON.stringify(source[i])} at ${i}.`);
    tokens.push({ value: match[0], offset: i }); i += match[0].length;
    if (tokens.length > 65536) throw new Error('FormalRV expression token limit exceeded.');
  }
  tokens.push({ value: '', offset: source.length });
  let cursor = 0, depth = 0;
  const peek = () => tokens[cursor].value;
  const take = () => tokens[cursor++].value;
  const fail = (message: string): never => { const offset = tokens[cursor]?.offset ?? source.length; throw new Error(`FormalRV math: ${message} at ${offset} near ${JSON.stringify(source.slice(offset, offset + 60))}.`); };
  const expect = (value: string) => { if (peek() !== value) fail(`expected ${value}`); take(); };
  const identifier = (value: string) => /^(?:[A-Za-z_][A-Za-z_0-9]*|[αβω])$/.test(value);
  function expression(minimum = 0): FormalrvMath {
    if (++depth > 128) fail('expression nesting exceeds 128');
    let left!: FormalrvMath;
    const first = take();
    if (first === '(') { left = expression(); expect(')'); }
    // The authored spec parser splits additions before its leading-minus case:
    // -a % n means -(a % n), not (-a) % n. Preserve this even when displaying TeX.
    else if (first === '-' || first === 'not' || first === '¬') left = { kind: 'unary', operator: first, value: expression(first === '-' ? 21 : 10) };
    else if (['Σ', 'Π', '∀', '∃', '⊗', '⊕', 'map'].includes(first)) {
      const variable = take();
      if (!identifier(variable)) fail('expected binder variable');
      let bound: FormalrvMath | undefined;
      if (first !== '∀' || peek() !== '.') { expect('<'); bound = expression(11); }
      expect('.');
      left = { kind: 'binder', operator: first, variable, bound, body: expression() };
    } else if (first === 'if') {
      const condition = expression(); expect('then');
      const yes = expression(); expect('else');
      left = { kind: 'conditional', condition, yes, no: expression() };
    } else if (/^[0-9]/.test(first)) left = { kind: 'number', value: first };
    else if (identifier(first) && !['then', 'else'].includes(first)) left = { kind: 'name', value: first };
    else fail(`expected expression, received ${JSON.stringify(first)}`);
    while (true) {
      if (peek() === '(' && left.kind === 'name') {
        take(); const args: FormalrvMath[] = [];
        if (peek() !== ')') { do { args.push(expression()); if (peek() !== ',') break; take(); } while (true); }
        expect(')');
        if (Object.hasOwn(constructorArity, left.value) && args.length !== constructorArity[left.value]) {
          fail(`${left.value} requires ${constructorArity[left.value]} argument(s), received ${args.length}`);
        }
        if (['ketmapped', 'recordmapped', 'qmapped'].includes(left.value)) {
          const mapping = args[args.length - 1];
          if (mapping?.kind !== 'binder' || mapping.operator !== 'map') fail(`${left.value} requires an explicit bounded map selector`);
        }
        left = { kind: 'call', name: left.value, arguments: args }; continue;
      }
      if (peek() === '[') { take(); const index = expression(); expect(']'); left = { kind: 'index', base: left, index }; continue; }
      const op = peek(), power = precedence[op];
      if (power === undefined || power < minimum) break;
      if (comparisons.has(op) && left.kind === 'binary' && comparisons.has(left.operator)) fail('comparisons do not chain; use an explicit conjunction');
      take(); left = { kind: 'binary', operator: op, left, right: expression(power + (['^', '→', '↦', '∧', '∨'].includes(op) ? 0 : 1)) };
    }
    depth--;
    return left;
  }
  const result = expression();
  if (peek()) fail('unexpected trailing token');
  return result;
}

const symbols: Record<string, string> = { α: '\\alpha', β: '\\beta', ω: '\\omega' };
function name(value: string): string {
  return symbols[value] ?? (/^[A-Za-z]$/.test(value) ? value : `\\operatorname{${value.replace(/_/g, '\\_')}}`);
}
const parens = (value: string) => `\\left(${value}\\right)`;

export function renderFormalrvMath(node: FormalrvMath): string {
  const render = renderFormalrvMath;
  switch (node.kind) {
    case 'name': return name(node.value);
    case 'number': return node.value;
    case 'index': return `${render(node.base)}_{${render(node.index)}}`;
    case 'unary': return `${node.operator === 'not' || node.operator === '¬' ? '\\neg ' : '-'}${parens(render(node.value))}`;
    case 'binder': {
      const lower = `${name(node.variable)}${node.bound ? ` < ${render(node.bound)}` : ''}`;
      if (node.operator === '∀' || node.operator === '∃') return `${node.operator === '∀' ? '\\forall' : '\\exists'} ${lower}, ${parens(render(node.body))}`;
      const operator = ({ 'Σ': '\\sum', 'Π': '\\prod', '⊗': '\\bigotimes', '⊕': '\\bigoplus', map: '\\operatorname{map}' } as Record<string, string>)[node.operator];
      return `${operator}_{${lower}} ${parens(render(node.body))}`;
    }
    case 'conditional': return `\\begin{cases} ${render(node.yes)} & ${render(node.condition)} \\\\ ${render(node.no)} & \\text{otherwise} \\end{cases}`;
    case 'call': {
      const args = node.arguments.map(render);
      const selector = (kind: string, offset = 0) => {
        const register = kind.startsWith('record') ? 'c' : 'q';
        if (kind.endsWith('mapped')) return `${register}_{${args[offset]}}`;
        if (kind.endsWith('at')) return `${register}_{${args[offset]}}`;
        // Half-open, strided bands stay explicit rather than becoming a single index.
        return `${register}_{\\operatorname{band}${parens(args.slice(offset).join(', '))}}`;
      };
      if (['ketat', 'ketband', 'ketmapped'].includes(node.name)) {
        const value = node.arguments[0];
        const primitive = value.kind === 'name' ? ({ plusstate: '+', minusstate: '-' } as Record<string, string>)[value.value] : undefined;
        return `\\ket{${primitive ?? args[0]}}_{${selector(node.name, 1)}}`;
      }
      if (['recordat', 'recordband', 'recordmapped', 'qat', 'qband', 'qmapped'].includes(node.name)) return selector(node.name);
      if (node.name === 'probability') return `\\Pr${parens(args.join(', '))}`;
      if (node.name === 'sqrt' && args.length === 1) return `\\sqrt{${args[0]}}`;
      if (!args.length) return `\\operatorname{apply}${parens(name(node.name))}`;
      return `${name(node.name)}${parens(args.join(', '))}`;
    }
    case 'binary': {
      const a = render(node.left), b = render(node.right);
      if (node.operator === '^') return `${parens(a)}^{${b}}`;
      if (node.operator === '/') return `\\frac{${a}}{${b}}`;
      if (node.operator === '//') return `\\left\\lfloor\\frac{${a}}{${b}}\\right\\rfloor`;
      if (['>>', '<<', '⊕', '%'].includes(node.operator)) return `\\operatorname{${({ '>>': 'shr', '<<': 'shl', '⊕': 'xor', '%': 'mod' } as Record<string, string>)[node.operator]}}${parens(`${a}, ${b}`)}`;
      const op = ({ '*': '\\cdot', '⊗': '\\otimes', '∧': '\\land', '∨': '\\lor', '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '→': '\\implies', '↦': '\\mapsto', '↔': '\\iff' } as Record<string, string>)[node.operator] ?? node.operator;
      return parens(`${a} ${op} ${b}`);
    }
  }
}

export function formalrvMath(source: string): string { return renderFormalrvMath(parseFormalrvMath(source)); }
