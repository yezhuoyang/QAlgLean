export interface MathSpan { from: number; to: number; latex: string }

/** Preserve source line links while keeping multiline mathematical spans together. */
export function programLines(source: string): { source: string; line: number }[] {
  const spans = mathSpans(source);
  const result: { source: string; line: number }[] = [];
  let start = 0, line = 0, startLine = 0, spanIndex = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== '\n') continue;
    while (spans[spanIndex] && spans[spanIndex].to <= index) spanIndex++;
    const span = spans[spanIndex];
    if (!span || index < span.from) {
      result.push({ source: source.slice(start, index).replace(/\r$/, ''), line: startLine });
      start = index + 1;
      startLine = line + 1;
    }
    line++;
  }
  if (start < source.length) result.push({ source: source.slice(start), line: startLine });
  return result;
}

/** Source ranges include both dollar delimiters. Quotes and comments stay literal. */
export function mathSpans(source: string): MathSpan[] {
  const result: MathSpan[] = [];
  let start = -1;
  let quoted = false;
  let comment = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (comment) { if (character === '\n') comment = false; continue; }
    if (character === '\\') { index++; continue; }
    if (quoted) { if (character === '"') quoted = false; continue; }
    if (start < 0 && character === '/' && source[index + 1] === '/') { comment = true; index++; }
    else if (start < 0 && character === '"') quoted = true;
    else if (character === '$') {
      if (start < 0) start = index;
      else { result.push({ from: start, to: index + 1, latex: source.slice(start + 1, index) }); start = -1; }
    }
  }
  return result;
}

export interface TextChange { from: number; to: number; text: string }

/** A bounded, minimal contiguous edit; offsets follow VS Code's UTF-16 convention. */
export function difference(before: string, after: string): TextChange | undefined {
  if (before === after) return undefined;
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  const splitsPair = (text: string, offset: number) => offset > 0 && offset < text.length
    && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
  if (splitsPair(before, from) || splitsPair(after, from)) from--;
  let to = before.length;
  let end = after.length;
  while (to > from && end > from && before[to - 1] === after[end - 1]) { to--; end--; }
  if (splitsPair(before, to) || splitsPair(after, end)) { to++; end++; }
  return { from, to, text: after.slice(from, end) };
}

/** Merge only disjoint edits. An overlap must be resolved by the author. */
export function mergeUnrelated(base: string, local: string, remote: string): string | undefined {
  const localEdit = difference(base, local);
  const remoteEdit = difference(base, remote);
  if (!localEdit) return remote;
  if (!remoteEdit || local === remote) return local;
  // Adjacent replacements are safe; simultaneous insertions at one point are not.
  if (localEdit.to <= remoteEdit.from && localEdit.from < remoteEdit.from) {
    return remote.slice(0, localEdit.from) + localEdit.text + remote.slice(localEdit.to);
  }
  if (remoteEdit.to <= localEdit.from && remoteEdit.from < localEdit.from) {
    const shift = remoteEdit.text.length - (remoteEdit.to - remoteEdit.from);
    return remote.slice(0, localEdit.from + shift) + localEdit.text + remote.slice(localEdit.to + shift);
  }
  return undefined;
}
