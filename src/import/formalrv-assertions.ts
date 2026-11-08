import { FormalrvMath, formalrvMath, parseFormalrvMath, renderFormalrvMath } from './formalrv-math';

/** The source structure retained by the FormalRV contract transcription. */
export interface FormalrvContract {
  name: string;
  binders: string[];
  clauses: FormalrvContractClause[];
}

export type FormalrvContractClause =
  | { kind: 'requires' | 'assumes' | 'ensures' | 'outcomes'; source: string; condition?: string }
  | { kind: 'resource'; entries: { name: string; source: string }[] };

export interface FormalrvDefinition {
  name: string;
  patterns: string[];
  rhs: string;
}

function fail(message: string): never {
  throw new Error(`FormalRV assertion: ${message}`);
}

/** Split only at the outer level; half-open bands deliberately end in `)`. */
export function splitFormalrvOuter(source: string, delimiter: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if ('([{'.includes(character)) depth++;
    else if (')]}'.includes(character)) {
      if (--depth < 0) fail(`Unbalanced delimiters in ${source.slice(0, 100)}`);
    } else if (depth === 0 && source.startsWith(delimiter, index)) {
      result.push(source.slice(start, index).trim());
      start = index + delimiter.length;
      index += delimiter.length - 1;
    }
  }
  if (depth !== 0) fail(`Unbalanced delimiters in ${source.slice(0, 100)}`);
  result.push(source.slice(start).trim());
  return result;
}

function bracket(source: string, start: number): { body: string; end: number; close: string } {
  if (source[start] !== '[') fail('Expected a register selector.');
  let depth = 1;
  for (let index = start + 1; index < source.length; index++) {
    if ('(['.includes(source[index])) depth++;
    else if (')]'.includes(source[index]) && --depth === 0) {
      return { body: source.slice(start + 1, index), end: index + 1, close: source[index] };
    }
  }
  return fail('Unclosed register selector.');
}

function bandArguments(body: string, close: string): { kind: 'at' | 'band' | 'mapped'; args: string[] } {
  if (/^\s*map\s/.test(body)) {
    if (close !== ']') fail('A mapped register selector must end in ].');
    return { kind: 'mapped', args: [body.trim()] };
  }
  const pieces = splitFormalrvOuter(body, ',');
  if (pieces.some(piece => !piece)) fail('Empty register selector.');
  if (pieces.length === 1 && close === ']') return { kind: 'at', args: pieces };
  if (pieces.length !== 2 || close !== ')') fail('A band must be [lower, upper) or [lower, upper : stride).');
  const end = splitFormalrvOuter(pieces[1], ':');
  if (end.length > 2 || end.some(piece => !piece)) fail('Malformed band stride.');
  return { kind: 'band', args: [pieces[0], end[0], end[1] ?? '1'] };
}

/**
 * Translate the assertion-specific constructors before the ordinary expression
 * parser runs. Every ket value, selector and probability event remains a parsed
 * expression. A register band is never flattened to a textual label.
 */
export function formalrvAssertionExpression(source: string): string {
  let result = '';
  for (let index = 0; index < source.length;) {
    if (source[index] === '|') {
      const ketEnd = source.indexOf('⟩', index + 1);
      if (ketEnd < 0) fail('Unclosed ket.');
      const literal = source.slice(index + 1, ketEnd).trim();
      const value = literal === '+' ? 'plusstate' : literal === '-' || literal === '−' ? 'minusstate' : literal;
      if (!value) fail('Empty ket value.');
      const suffix = /^\s*_q\s*\[/.exec(source.slice(ketEnd + 1));
      if (!suffix) fail('Every FormalRV ket must carry its quantum register selector.');
      const open = ketEnd + 1 + suffix[0].lastIndexOf('[');
      const selector = bracket(source, open);
      const band = bandArguments(selector.body, selector.close);
      result += `ket${band.kind}(${[value, ...band.args].map(formalrvAssertionExpression).join(',')})`;
      index = selector.end;
      continue;
    }
    const prefix = /^(Pr|c|q)\s*\[/.exec(source.slice(index));
    if (prefix && (index === 0 || !/[\p{L}\p{N}_]/u.test(source[index - 1]))) {
      const open = index + prefix[0].lastIndexOf('[');
      const selector = bracket(source, open);
      if (prefix[1] === 'Pr') {
        if (selector.close !== ']' || !selector.body.trim()) fail('A probability event must end in ].');
        result += `probability(${formalrvAssertionExpression(selector.body)})`;
      } else {
        const band = bandArguments(selector.body, selector.close);
        result += `${prefix[1] === 'c' ? 'record' : 'q'}${band.kind}(${band.args.map(formalrvAssertionExpression).join(',')})`;
      }
      index = selector.end;
      continue;
    }
    if (source[index] === '⟩') fail('Ket closing delimiter without opening delimiter.');
    result += source[index++];
  }
  return result;
}

export function formalrvAssertionMath(source: string): string {
  return formalrvMath(formalrvAssertionExpression(source));
}

/** Parse a whole source contract, rejecting unknown or dropped clauses. */
export function parseFormalrvSpec(source: string): FormalrvContract {
  const normalized = source.replace(/\r/g, '').trim();
  const header = /^spec\s+([A-Za-z_][A-Za-z_0-9]*)\s*:\s*/.exec(normalized);
  if (!header) fail('Expected a spec name: header.');
  const body = normalized.slice(header[0].length);
  const markers = [...body.matchAll(/(?:^|\n)[ \t]*(requires|assumes|ensures|outcomes|resource)\b/g)];
  if (!markers.length) fail(`Contract ${header[1]} has no clauses.`);
  const prefix = body.slice(0, markers[0].index).trim();
  const binders: string[] = [];
  let remaining = prefix;
  while (remaining) {
    if (!remaining.startsWith('∀')) fail(`Unrecognized contract prefix: ${remaining.slice(0, 80)}`);
    const pieces = splitFormalrvOuter(remaining.slice(1), '.');
    if (pieces.length < 2 || !pieces[0]) fail('A universal contract binder must end with a dot.');
    binders.push(pieces[0]);
    remaining = pieces.slice(1).join('.').trim();
  }
  const clauses: FormalrvContractClause[] = markers.map((marker, index) => {
    const kind = marker[1] as FormalrvContractClause['kind'];
    let content = body.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? body.length).trim();
    if (!content) fail(`Empty ${kind} clause in ${header[1]}.`);
    if (kind === 'resource') {
      if (!content.startsWith('{') || !content.endsWith('}') || content.startsWith('{{')) fail('Expected a resource record.');
      const names = new Set<string>();
      const entries = splitFormalrvOuter(content.slice(1, -1), ',').map(entry => {
        const field = /^([A-Za-z_][A-Za-z_0-9]*)\s*:\s*(.+)$/s.exec(entry);
        if (!field) fail(`Malformed resource entry: ${entry.slice(0, 80)}`);
        if (names.has(field[1])) fail(`Duplicate resource counter ${field[1]}.`);
        names.add(field[1]);
        return { name: field[1], source: field[2].trim() };
      });
      return { kind, entries };
    }
    let condition: string | undefined;
    if (kind === 'ensures') {
      const conditional = /^(\{\{[\s\S]*\}\})\s+given\s+([\s\S]+)$/.exec(content);
      if (conditional) {
        content = conditional[1];
        condition = conditional[2].trim();
      }
    }
    if (kind === 'assumes' || kind === 'ensures') {
      if (!content.startsWith('{{') || !content.endsWith('}}')) fail(`Expected {{ state }} in ${kind}.`);
      content = content.slice(2, -2).trim();
      if (!content) fail(`Empty ${kind} state.`);
    }
    return { kind, source: content, ...(condition ? { condition } : {}) };
  });
  return { name: header[1], binders, clauses };
}

export function transcribeFormalrvSpec(source: string): string {
  const contract = parseFormalrvSpec(source);
  const lines = [`spec ${contract.name} {`];
  for (const binder of contract.binders) lines.push(`  bind $${formalrvAssertionMath(binder)}$`);
  for (const clause of contract.clauses) {
    if (clause.kind === 'resource') {
      for (const entry of clause.entries) lines.push(`  resource ${entry.name} := $${formalrvAssertionMath(entry.source)}$`);
    } else if (clause.kind === 'outcomes' && clause.source === 'none') {
      lines.push('  outcomes none');
    } else {
      // Only an AST-root conjunction can become separate premises. Textual
      // splitting would wrongly detach conjuncts owned by a binder or implication.
      const conjuncts = (node: FormalrvMath): FormalrvMath[] => node.kind === 'binary' && node.operator === '∧'
        ? [...conjuncts(node.left), ...conjuncts(node.right)] : [node];
      const expressions = clause.kind === 'requires'
        ? conjuncts(parseFormalrvMath(formalrvAssertionExpression(clause.source))).map(renderFormalrvMath)
        : [formalrvAssertionMath(clause.source)];
      for (const expression of expressions) {
        const condition = clause.condition ? ` given $${formalrvAssertionMath(clause.condition)}$` : '';
        lines.push(`  ${clause.kind} $${expression}$${condition}`);
      }
    }
  }
  return [...lines, '}'].join('\n');
}

export function parseFormalrvDefinition(source: string): FormalrvDefinition {
  const match = /^define\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(/.exec(source.trim());
  if (!match) fail('Expected define name(patterns) = expression.');
  const normalized = source.trim();
  let depth = 1;
  let index = match[0].length;
  for (; index < normalized.length && depth; index++) {
    if (normalized[index] === '(') depth++;
    else if (normalized[index] === ')') depth--;
  }
  if (depth) fail('Unclosed definition argument list.');
  const rawPatterns = normalized.slice(match[0].length, index - 1).trim();
  const patterns = rawPatterns ? splitFormalrvOuter(rawPatterns, ',') : [];
  const rest = normalized.slice(index).trim();
  if (!rest.startsWith('=') || rest.startsWith('==') || !rest.slice(1).trim()) fail('Definition must have a right-hand side.');
  return { name: match[1], patterns, rhs: rest.slice(1).trim() };
}

/** The caller emits one `define` signature before a function's equation clauses. */
export function transcribeFormalrvDefinition(source: string): string {
  const definition = parseFormalrvDefinition(source);
  return `equation ${definition.name}(${definition.patterns.join(', ')}) := $${formalrvAssertionMath(definition.rhs)}$`;
}
