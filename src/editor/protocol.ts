/** UTF-16 edits, relative to a specific VS Code document version. */
export interface SourceChange { from: number; to: number; text: string }
export interface EditRequest { type: 'edit'; requestId: number; version: number; changes: SourceChange[] }
export interface EditResult { type: 'edit-result'; requestId: number; accepted: boolean; source: string; version: number; reason?: string }

export const documentLimit = 500_000;

/** Validate at the host boundary; untrusted webviews cannot address another file. */
export function validateEdit(source: string, version: number, input: unknown): EditRequest | undefined {
  if (!input || typeof input !== 'object') return;
  const value = input as EditRequest;
  if (value.type !== 'edit' || !Number.isSafeInteger(value.requestId) || value.requestId < 0 ||
      value.version !== version || !Array.isArray(value.changes) || !value.changes.length || value.changes.length > 10_000) return;
  let end = -1;
  let size = source.length;
  for (const change of value.changes) {
    if (!change || !Number.isInteger(change.from) || !Number.isInteger(change.to) ||
        change.from < 0 || change.from <= end || change.to < change.from || change.to > source.length ||
        typeof change.text !== 'string' || change.text.length > documentLimit) return;
    // A position is between Unicode characters, never between a surrogate pair.
    if ([change.from, change.to].some(position => position > 0 && position < source.length &&
      /[\uD800-\uDBFF]/.test(source[position - 1]) && /[\uDC00-\uDFFF]/.test(source[position]))) return;
    size += change.text.length - (change.to - change.from);
    end = change.to - (change.to > change.from ? 1 : 0);
  }
  if (size > documentLimit) return;
  return value;
}

export function changedSource(source: string, changes: SourceChange[]): string {
  let result = '';
  let position = 0;
  for (const change of changes) {
    result += source.slice(position, change.from) + change.text;
    position = change.to;
  }
  return result + source.slice(position);
}
