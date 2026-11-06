import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, renderTemplate, templateSchema } from './template.ts';

test('fingerprints distinguish absence, path, and bytes', () => {
  const hashes = [parseTemplate(null, ''), parseTemplate('x', ''), parseTemplate('x', 'a'), parseTemplate('x', 'b')].map((t) => t.fingerprint);
  assert.equal(new Set(hashes).size, 4);
});

test('headings preserve fixed text and ignore fenced, indented and commented headings', () => {
  const source = '<!--\n# hidden\n-->\n```\n<!--\n# fenced\n```\n    # indented\n## 日本語\nfixed\n日本語\n======\n';
  const template = parseTemplate('x', source);
  assert.deepEqual(template.slots.map((s) => s.key), ['日本語_1', '日本語_2']);
  assert.equal(renderTemplate(template, { 日本語_1: 'one', 日本語_2: 'two' }), source.replace('## 日本語\n', '## 日本語\n\none\n').replace('======\n', '======\n\ntwo\n'));
});

test('checkboxes, placeholders and empty table cells use independent fields', () => {
  const source = '## Test\n- [ ] Done\nHello {{name}}\n| A | B |\n| --- | --- |\n| fixed |  |\n';
  const t = parseTemplate('x', source);
  assert.deepEqual(t.slots.map((s) => s.key), ['test_1', 'checkbox_done_1', 'name_1', 'table_cell_1']);
  assert.equal(renderTemplate(t, { test_1: 'Ready', checkbox_done_1: true, name_1: 'a|b', table_cell_1: 'x|y' }), '## Test\n\nReady\n- [x] Done\nHello a\\|b\n| A | B |\n| --- | --- |\n| fixed |x\\|y|\n');
  assert.deepEqual(templateSchema(t).required, t.slots.map((s) => s.key));
  assert.equal(templateSchema(t).additionalProperties, false);
});

test('EOF and CRLF section insertion keeps headings separate', () => {
  const t = parseTemplate('x', '## First\r\n## Last');
  assert.equal(renderTemplate(t, { first_1: 'a\nb', last_1: 'last' }), '## First\r\n\r\na\r\nb\r\n## Last\r\n\r\nlast\r\n');
});

test('field validation rejects extras, inherited fields, empty and unexplained N/A', () => {
  const t = parseTemplate(null, '');
  for (const value of [{}, { content_1: '' }, { content_1: 'N/A' }, { content_1: 'ok', extra: 1 }, Object.create({ content_1: 'ok' }), JSON.parse('{"content_1":"ok","__proto__":{}}')]) assert.throws(() => renderTemplate(t, value));
  assert.match(renderTemplate(t, { content_1: 'N/A - not applicable because no UI changed' }), /because/);
});

test('multiline section content allows lists but rejects structural injection', () => {
  const t = parseTemplate('x', '## Summary\n## Tests\n');
  assert.doesNotThrow(() => renderTemplate(t, { summary_1: 'Details\n- item\n- another', tests_1: 'Passed' }));
  for (const value of ['ok\n## forged', 'ok\n---', 'ok\n```', '<h1>forged</h1>', '<!--']) assert.throws(() => renderTemplate(t, { summary_1: value, tests_1: 'Passed' }));
});

test('malformed templates fail before rendering', () => {
  for (const source of ['```\n', '<!-- open', '{{broken', '## {{heading}}\n']) assert.throws(() => parseTemplate('x', source));
});

test('inline code and escaped pipes remain fixed while edge table cells become fields', () => {
  const source = '## Body\n`{{fixed}}` and ``<!-- # fixed -->``\nA | B | C\n--- | --- | ---\n | `a|b` | \nleft\\|pipe | middle | \n | middle | right\n';
  const t = parseTemplate('x', source);
  assert.deepEqual(t.slots.map((s) => s.key), ['body_1', 'table_cell_1', 'table_cell_2', 'table_cell_3', 'table_cell_4']);
  const output = renderTemplate(t, { body_1: 'ok', table_cell_1: 'first', table_cell_2: 'last', table_cell_3: 'end', table_cell_4: 'start' });
  assert.match(output, /`\{\{fixed\}\}` and ``<!-- # fixed -->``/);
  assert.match(output, /first\| `a\|b` \|last/);
  assert.match(output, /left\\\|pipe \| middle \|end/);
  assert.match(output, /start\| middle \| right/);
});

test('even backslashes do not escape table delimiters', () => {
  const t = parseTemplate('x', '## T\na | b\n--- | ---\nx\\\\| \n');
  assert.deepEqual(t.slots.map((s) => s.key), ['t_1', 'table_cell_1']);
});

test('commented fences and headings, and list separators do not create sections', () => {
  const t = parseTemplate('x', '<!--\n```\n# hidden\n-->\n- item\n---\n## Real\n');
  assert.deepEqual(t.slots.map((s) => s.key), ['real_1']);
});

test('checkbox at EOF without headings keeps all source bytes', () => {
  const t = parseTemplate('x', '- [ ]');
  assert.equal(renderTemplate(t, { checkbox_1: true, content_1: 'details' }), '- [x]\n\ndetails\n');
});

test('bare N/A punctuation is rejected and section markup cannot swallow fixed headings', () => {
  const t = parseTemplate('x', '## A\n## B\n');
  for (const text of ['N/A:', 'N/A -', 'N.A.', 'N/A...', '[unfinished', '`unfinished', '<unfinished']) assert.throws(() => renderTemplate(t, { a_1: text, b_1: 'ok' }));
  assert.doesNotThrow(() => renderTemplate(t, { a_1: 'N/A: no UI changes', b_1: 'ok' }));
});
