import { createHash } from 'node:crypto';

export type Slot = { key: string; kind: 'text' | 'checkbox'; start: number; end: number; context?: 'inline' | 'section' };
export type Template = { path: string | null; source: string; fingerprint: string; slots: Slot[] };

function escaped(text: string, index: number): boolean {
  let count = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count % 2 === 1;
}

export function parseTemplate(path: string | null, source: string): Template {
  const fingerprint = createHash('sha256').update(JSON.stringify([path, source])).digest('hex');
  const slots: Slot[] = [];
  const counts = new Map<string, number>();
  const key = (name: string) => {
    const base = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'section';
    const safe = base === '__proto__' || base === 'constructor' || base === 'prototype' ? `field_${base}` : base;
    const count = (counts.get(safe) ?? 0) + 1;
    counts.set(safe, count);
    return `${safe}_${count}`;
  };
  const lines = [...source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)].filter((match) => match[0].length);
  let fence: string | undefined;
  let comment = false;
  let headings = 0;
  let table = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i][0].replace(/\r\n$|[\r\n]$/, '');
    const offset = lines[i].index!;
    if (fence) {
      const close = raw.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (!comment) {
      const opening = raw.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening) { fence = opening[1]; continue; }
    }
    let line = '';
    for (let j = 0; j < raw.length;) {
      if (comment) {
        const end = raw.indexOf('-->', j);
        if (end < 0) { line += ' '.repeat(raw.length - j); break; }
        line += ' '.repeat(end + 3 - j); j = end + 3; comment = false;
      } else if (raw.startsWith('<!--', j)) { comment = true; line += '    '; j += 4; }
      else if (raw[j] === '`' && !escaped(raw, j)) {
        let end = j;
        while (raw[end] === '`') end++;
        const size = end - j;
        let close = end;
        while (close < raw.length) {
          if (raw[close] !== '`') { close++; continue; }
          let after = close;
          while (raw[after] === '`') after++;
          if (after - close === size) break;
          close = after;
        }
        if (close === raw.length) throw new Error('Unclosed inline code');
        const after = close + size;
        // Keep offsets stable while hiding code delimiters and contents from field parsing.
        line += ' '.repeat(after - j); j = after;
      } else { line += raw[j++]; }
    }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) continue;
    const checkbox = line.match(/^ {0,3}[-*+]\s+\[([ xX])\]/);
    if (checkbox) {
      const start = offset + line.indexOf('[') + 1;
      slots.push({ key: key(`checkbox_${line.slice(line.indexOf(']') + 1)}`), kind: 'checkbox', start, end: start + 1 });
    }
    const heading = line.match(/^ {0,3}#{1,6}(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/);
    const next = lines[i + 1]?.[0].replace(/\r\n$|[\r\n]$/, '') ?? '';
    const setext = !heading && line.trim() && !/^ {0,3}(?:[-*+]\s|\d+[.)]\s|>|(?:[-*_]\s*){3,}$)/.test(line) && /^ {0,3}(?:=+|-+)\s*$/.test(next);
    if (heading || setext) {
      if (/\{\{|\}\}/.test(line)) throw new Error('Placeholder in heading');
      const headingLine = setext ? lines[++i] : lines[i];
      const start = headingLine.index! + headingLine[0].length;
      slots.push({ key: key(heading ? heading[1] : line), kind: 'text', context: 'section', start, end: start });
      headings++;
      table = false;
      continue;
    }
    const separator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next);
    const separatorLine = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
    if (separator) table = true;
    if (table && line.includes('|') && !separatorLine) {
      const boundaries = [-1];
      for (let p = 0; p < line.length; p++) {
        if (line[p] === '|' && !escaped(line, p)) boundaries.push(p);
      }
      boundaries.push(line.length);
      for (let p = 0; p < boundaries.length - 1; p++) {
        const start = boundaries[p] + 1, end = boundaries[p + 1];
        if ((p === 0 && boundaries[1] === 0) || (p === boundaries.length - 2 && boundaries[p] === line.length - 1)) continue;
        if (!raw.slice(start, end).trim()) slots.push({ key: key('table_cell'), kind: 'text', context: 'inline', start: offset + start, end: offset + end });
      }
    } else if (!separatorLine && !line.includes('|')) table = false;
    const placeholders = [...line.matchAll(/\{\{([^{}\r\n]+)\}\}/g)];
    const stripped = line.replace(/\{\{([^{}\r\n]+)\}\}/g, '');
    if (/\{\{|\}\}/.test(stripped)) throw new Error('Malformed placeholder');
    for (const match of placeholders) {
      const start = offset + match.index!;
      slots.push({ key: key(match[1]), kind: 'text', context: 'inline', start, end: start + match[0].length });
    }
  }
  if (fence || comment) throw new Error('Unclosed template fence or comment');
  if (!headings) slots.push({ key: key('content'), kind: 'text', context: 'section', start: source.length, end: source.length });
  slots.sort((a, b) => a.start - b.start);
  if (slots.some((slot, i) => i > 0 && slot.start < slots[i - 1].end)) throw new Error('Overlapping template fields');
  return { path, source, fingerprint, slots };
}

export function templateSchema(template: Template): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(template.slots.map((slot) => [slot.key, slot.kind === 'checkbox' ? { type: 'boolean' } : { type: 'string', minLength: 1 }])),
    required: template.slots.map((slot) => slot.key),
    additionalProperties: false,
  };
}

export function renderTemplate(template: Template, values: unknown): string {
  if (!values || typeof values !== 'object' || Array.isArray(values) || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) throw new Error('Invalid template fields');
  const record = values as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (keys.length !== template.slots.length || template.slots.some((slot) => !Object.hasOwn(record, slot.key))) throw new Error('Template fields do not match');
  const newline = template.source.includes('\r\n') ? '\r\n' : template.source.includes('\r') && !template.source.includes('\n') ? '\r' : '\n';
  let result = template.source;
  for (const slot of [...template.slots].reverse()) {
    const value = record[slot.key];
    let replacement: string;
    if (slot.kind === 'checkbox') {
      if (typeof value !== 'boolean') throw new Error(`Invalid checkbox: ${slot.key}`);
      replacement = value ? 'x' : ' ';
    } else {
      if (typeof value !== 'string' || !value.trim() || (/^n[\s./-]*a(?=$|[^\p{L}\p{N}])/iu.test(value.trim()) && !/[\p{L}\p{N}]/u.test(value.trim().replace(/^n[\s./-]*a/iu, '')))) throw new Error(`Invalid text: ${slot.key}`);
      const text = value.trim();
      if (slot.context === 'inline') {
        if (/[\r\n]/.test(text)) throw new Error(`Invalid inline text: ${slot.key}`);
        replacement = text.replace(/[\\`*_[\]<>|{}()!#]/g, '\\$&');
      } else {
        if (/(?:^|\r\n|\r|\n) {0,3}(?:#{1,6}(?:\s|$)|`{3,}|~{3,}|(?:=+|-+)\s*$)/m.test(text) || /[<>`\[\]]/.test(text)) throw new Error(`Invalid section text: ${slot.key}`);
        const prefix = slot.start > 0 && !/[\r\n]/.test(template.source[slot.start - 1]) ? newline : '';
        replacement = `${prefix}${newline}${text.replace(/\r\n|\r|\n/g, newline)}${newline}`;
      }
    }
    result = result.slice(0, slot.start) + replacement + result.slice(slot.end);
  }
  return result;
}
