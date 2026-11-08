/** Preserve TeX braces when adapting the notation palette to CodeMirror fields. */
export function codeMirrorSnippet(source: string): string {
  const escape = (text: string) => text.replace(/[{}]/g, '\\$&');
  const defaults = new Map<string, string>();
  let result = '';
  for (let index = 0; index < source.length;) {
    const field = /^\$\{(\d+)(?::|\})/.exec(source.slice(index));
    if (!field) {
      // Ordinary TeX argument braces are literal already. Double only a TeX
      // escaped brace, since CodeMirror consumes one escape during insertion.
      if (source[index] === '\\' && /[{}]/.test(source[index + 1] ?? '')) result += '\\';
      result += source[index++];
      continue;
    }
    let end = index + 2;
    let depth = 1;
    while (end < source.length && depth) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') depth--;
      end++;
    }
    if (depth) { result += escape(source.slice(index)); break; }
    const body = source.slice(index + 2, end - 1);
    const colon = body.indexOf(':');
    const number = field[1];
    const text = defaults.get(number) ?? (colon < 0 ? '' : body.slice(colon + 1));
    defaults.set(number, text);
    // CodeMirror numbered fields cannot contain brace escapes. Named fields can.
    result += /[{}]/.test(text) ? '${' + escape(text) + '}' : '${' + number + ':' + text + '}';
    index = end;
  }
  return result;
}
