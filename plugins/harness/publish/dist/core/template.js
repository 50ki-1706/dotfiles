import { createHash } from 'node:crypto';
/** Opening or closing code fence with its marker and remainder. */
const FENCE_MARKER = /^(?: {0,3})(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const INDENTED_CODE = /^(?: {4}|\t)/;
const CHECKBOX = /^ {0,3}[-*+]\s+\[([ xX])\]/;
const HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/;
const LIST_OR_RULE = /^ {0,3}(?:[-*+]\s|\d+[.)]\s|>|(?:[-*_]\s*){3,}$)/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const PLACEHOLDER = /\{\{([^{}\r\n]+)\}\}/g;
const PLACEHOLDER_LIKE = /\{\{|\}\}/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Assign unique field names, so repeated headings and cells stay distinct. */
class FieldNames {
    #counts = new Map();
    next(name) {
        const normalized = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'section';
        const safe = RESERVED_KEYS.has(normalized) ? `field_${normalized}` : normalized;
        const count = (this.#counts.get(safe) ?? 0) + 1;
        this.#counts.set(safe, count);
        return `${safe}_${count}`;
    }
}
/** Split into lines while keeping each line's offset; a trailing newline is not a line. */
function splitLines(source) {
    const matches = [...source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)];
    return matches
        .filter((match) => match[0].length > 0)
        .map((match) => ({ text: match[0].replace(/\r\n$|[\r\n]$/, ''), start: match.index ?? 0 }));
}
function isEscaped(text, index) {
    let backslashes = 0;
    while (index > 0 && text[--index] === '\\')
        backslashes++;
    return backslashes % 2 === 1;
}
/** Replace code spans and HTML comments with spaces, keeping offsets stable. */
function maskNonMarkdown(raw, commentOpen) {
    let masked = '';
    for (let i = 0; i < raw.length;) {
        if (commentOpen.value) {
            const end = raw.indexOf('-->', i);
            if (end < 0) {
                masked += ' '.repeat(raw.length - i);
                break;
            }
            masked += ' '.repeat(end + 3 - i);
            i = end + 3;
            commentOpen.value = false;
            continue;
        }
        if (raw.startsWith('<!--', i)) {
            commentOpen.value = true;
            masked += '    ';
            i += 4;
            continue;
        }
        if (raw[i] !== '`' || isEscaped(raw, i)) {
            masked += raw[i++];
            continue;
        }
        let runEnd = i;
        while (raw[runEnd] === '`')
            runEnd++;
        const size = runEnd - i;
        let close = runEnd;
        while (close < raw.length) {
            if (raw[close] !== '`') {
                close++;
                continue;
            }
            let after = close;
            while (raw[after] === '`')
                after++;
            if (after - close === size)
                break;
            close = after;
        }
        if (close === raw.length)
            throw new Error('Unclosed inline code');
        const after = close + size;
        masked += ' '.repeat(after - i);
        i = after;
    }
    return masked;
}
/** True when `next` underlines the current line as a Setext heading. */
function isSetextHeading(line, next) {
    return Boolean(line.trim())
        && !LIST_OR_RULE.test(line)
        && SETEXT_UNDERLINE.test(next);
}
/** Cell boundaries of a Markdown table row; the positions are pipe indexes. */
function tableCellBoundaries(line) {
    const boundaries = [-1];
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '|' && !isEscaped(line, i))
            boundaries.push(i);
    }
    boundaries.push(line.length);
    return boundaries;
}
/** Collect the empty cells of a table row as inline fields. */
function tableSlots(line, raw, offset, names, slots) {
    const boundaries = tableCellBoundaries(line);
    for (let cell = 0; cell < boundaries.length - 1; cell++) {
        const start = boundaries[cell] + 1;
        const end = boundaries[cell + 1];
        const leadingPipe = cell === 0 && boundaries[1] === 0;
        const trailingPipe = cell === boundaries.length - 2 && boundaries[cell] === line.length - 1;
        if (leadingPipe || trailingPipe)
            continue;
        if (raw.slice(start, end).trim())
            continue;
        slots.push({ key: names.next('table_cell'), kind: 'text', context: 'inline', start: offset + start, end: offset + end });
    }
}
/** Collect `{{name}}` placeholders as inline fields. */
function placeholderSlots(line, offset, names, slots) {
    const placeholders = [...line.matchAll(PLACEHOLDER)];
    if (PLACEHOLDER_LIKE.test(line.replace(PLACEHOLDER, '')))
        throw new Error('Malformed placeholder');
    for (const match of placeholders) {
        const start = offset + (match.index ?? 0);
        slots.push({ key: names.next(match[1]), kind: 'text', context: 'inline', start, end: start + match[0].length });
    }
}
/**
 * Parse a pull request template into fixed text plus editable fields.
 *
 * Headings define section fields, checkboxes and placeholders define inline
 * fields, and empty table cells become inline fields. Fenced or indented code,
 * HTML comments, and inline code stay fixed.
 */
export function parseTemplate(path, source) {
    const fingerprint = createHash('sha256').update(JSON.stringify([path, source])).digest('hex');
    const slots = [];
    const names = new FieldNames();
    const lines = splitLines(source);
    const commentOpen = { value: false };
    let fence;
    let headingCount = 0;
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
        const { text: raw, start: offset } = lines[i];
        if (fence) {
            const close = raw.match(FENCE_CLOSE);
            if (close && close[1][0] === fence[0] && close[1].length >= fence.length)
                fence = undefined;
            continue;
        }
        if (!commentOpen.value && FENCE_MARKER.test(raw)) {
            fence = raw.match(FENCE_MARKER)[1];
            continue;
        }
        const line = maskNonMarkdown(raw, commentOpen);
        // Masking can expose a fence after a comment closes on this same line.
        const marker = line.match(FENCE_MARKER);
        if (marker) {
            if (!fence)
                fence = marker[1];
            else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
                fence = undefined;
            continue;
        }
        if (fence || INDENTED_CODE.test(line))
            continue;
        const checkbox = line.match(CHECKBOX);
        if (checkbox) {
            const bracket = line.indexOf('[');
            const start = offset + bracket + 1;
            slots.push({ key: names.next(`checkbox_${line.slice(line.indexOf(']') + 1)}`), kind: 'checkbox', start, end: start + 1 });
        }
        const heading = line.match(HEADING);
        const next = lines[i + 1]?.text ?? '';
        const setext = !heading && isSetextHeading(line, next);
        if (heading || setext) {
            if (PLACEHOLDER_LIKE.test(line))
                throw new Error('Placeholder in heading');
            const headingLine = setext ? lines[++i] : lines[i];
            const afterHeading = headingLine.start + headingLine.text.length;
            const start = afterHeading + lineTerminatorLength(source, afterHeading);
            slots.push({ key: names.next(heading ? heading[1] : line), kind: 'text', context: 'section', start, end: start });
            headingCount++;
            inTable = false;
            continue;
        }
        const separatorBelow = TABLE_SEPARATOR.test(next);
        const separatorLine = TABLE_SEPARATOR.test(line);
        if (separatorBelow)
            inTable = true;
        if (inTable && line.includes('|') && !separatorLine) {
            tableSlots(line, raw, offset, names, slots);
        }
        else if (!separatorLine && !line.includes('|')) {
            inTable = false;
        }
        placeholderSlots(line, offset, names, slots);
    }
    if (fence || commentOpen.value)
        throw new Error('Unclosed template fence or comment');
    if (!headingCount)
        slots.push({ key: names.next('content'), kind: 'text', context: 'section', start: source.length, end: source.length });
    slots.sort((a, b) => a.start - b.start);
    if (slots.some((slot, index) => index > 0 && slot.start < slots[index - 1].end)) {
        throw new Error('Overlapping template fields');
    }
    return { path, source, fingerprint, slots };
}
/** Length of the line terminator beginning at `offset`, or 0 at end of source. */
function lineTerminatorLength(source, offset) {
    if (source.startsWith('\r\n', offset))
        return 2;
    if (source[offset] === '\n' || source[offset] === '\r')
        return 1;
    return 0;
}
/** JSON schema for the template's fields, used as the `publish_pr` input. */
export function templateSchema(template) {
    return {
        type: 'object',
        properties: Object.fromEntries(template.slots.map((slot) => [slot.key, slot.kind === 'checkbox' ? { type: 'boolean' } : { type: 'string', minLength: 1 }])),
        required: template.slots.map((slot) => slot.key),
        additionalProperties: false,
    };
}
/** A bare "N/A" sentence is rejected; it must explain why the field does not apply. */
const BARE_NOT_APPLICABLE = /^n[\s./-]*a(?=$|[^\p{L}\p{N}])/iu;
const MEANINGFUL_TEXT = /[\p{L}\p{N}]/u;
const INLINE_ESCAPE = /[\\`*_[\]<>|{}()!#]/g;
const SECTION_MARKUP = /[<>`\[\]]/;
const STRUCTURAL_LINE = /(?:^|\r\n|\r|\n) {0,3}(?:#{1,6}(?:\s|$)|`{3,}|~{3,}|(?:=+|-+)\s*$)/m;
const isPlainObject = (value) => typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function lineEndingOf(source) {
    if (source.includes('\r\n'))
        return '\r\n';
    if (source.includes('\r') && !source.includes('\n'))
        return '\r';
    return '\n';
}
/** Reject text that is empty or a bare, unexplained "N/A". */
function requireExplainedText(value, key) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(`Invalid text: ${key}`);
    const text = value.trim();
    if (BARE_NOT_APPLICABLE.test(text) && !MEANINGFUL_TEXT.test(text.replace(BARE_NOT_APPLICABLE, ''))) {
        throw new Error(`Invalid text: ${key}`);
    }
    return text;
}
/** Render template fields into a complete pull request body. */
export function renderTemplate(template, values) {
    if (!isPlainObject(values))
        throw new Error('Invalid template fields');
    const record = values;
    const keys = Reflect.ownKeys(record);
    if (keys.length !== template.slots.length || template.slots.some((slot) => !Object.hasOwn(record, slot.key))) {
        throw new Error('Template fields do not match');
    }
    const newline = lineEndingOf(template.source);
    let body = template.source;
    for (const slot of [...template.slots].reverse()) {
        const value = record[slot.key];
        let replacement;
        if (slot.kind === 'checkbox') {
            if (typeof value !== 'boolean')
                throw new Error(`Invalid checkbox: ${slot.key}`);
            replacement = value ? 'x' : ' ';
        }
        else {
            const text = requireExplainedText(value, slot.key);
            if (slot.context === 'inline') {
                if (/[\r\n]/.test(text))
                    throw new Error(`Invalid inline text: ${slot.key}`);
                replacement = text.replace(INLINE_ESCAPE, '\\$&');
            }
            else {
                if (STRUCTURAL_LINE.test(text) || SECTION_MARKUP.test(text))
                    throw new Error(`Invalid section text: ${slot.key}`);
                const prefix = slot.start > 0 && !/[\r\n]/.test(template.source[slot.start - 1]) ? newline : '';
                replacement = `${prefix}${newline}${text.replace(/\r\n|\r|\n/g, newline)}${newline}`;
            }
        }
        body = body.slice(0, slot.start) + replacement + body.slice(slot.end);
    }
    return body;
}
