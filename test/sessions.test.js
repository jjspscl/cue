const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createSessionStore } = require('../src/sessions');

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-sessions-'));
  return { dir, store: createSessionStore({ dir }) };
}

test('appendTurn with null id creates a session titled from the question', () => {
  const { store } = tmpStore();
  const id = store.appendTurn(null, { mode: 'ask', question: 'What is a closure?', answer: 'A function plus its scope.' });
  const session = store.get(id);
  assert.strictEqual(session.title, 'What is a closure?');
  assert.strictEqual(session.turns.length, 1);
  assert.strictEqual(session.turns[0].answer, 'A function plus its scope.');
  assert.strictEqual(session.turns[0].image, null);
});

test('later turns append to the same session and keep its title', () => {
  const { store } = tmpStore();
  const id = store.appendTurn(null, { question: 'First', answer: 'a' });
  const again = store.appendTurn(id, { question: 'Second', answer: 'b' });
  assert.strictEqual(again, id);
  const session = store.get(id);
  assert.deepStrictEqual(session.turns.map((t) => t.question), ['First', 'Second']);
  assert.strictEqual(session.title, 'First');
});

test('long titles are truncated', () => {
  const { store } = tmpStore();
  const id = store.appendTurn(null, { question: 'x'.repeat(200), answer: 'a' });
  assert.ok(store.get(id).title.length <= 61);
  assert.ok(store.get(id).title.endsWith('…'));
});

test('screenshots are written to disk and read back as data URLs', () => {
  const { dir, store } = tmpStore();
  const id = store.appendTurn(null, { question: 'see screen', answer: 'ok', imageDataUrl: PNG });
  const turn = store.get(id).turns[0];
  assert.ok(turn.image && turn.image.endsWith('.png'));
  assert.ok(fs.existsSync(path.join(dir, id, turn.image)));
  assert.strictEqual(store.imageDataUrl(id, turn.id), PNG);
});

test('list is newest first and omits turns', () => {
  const { store } = tmpStore();
  const older = store.appendTurn(null, { question: 'old', answer: 'a' });
  const newer = store.appendTurn(null, { question: 'new', answer: 'b' });
  const list = store.list();
  assert.strictEqual(list.length, 2);
  assert.ok(list.every((s) => s.turns === undefined && typeof s.turnCount === 'number'));
  assert.ok(list[0].updatedAt >= list[1].updatedAt);
  assert.ok([older, newer].includes(list[0].id));
});

test('remove deletes the session folder', () => {
  const { dir, store } = tmpStore();
  const id = store.appendTurn(null, { question: 'bye', answer: 'a', imageDataUrl: PNG });
  assert.strictEqual(store.remove(id), true);
  assert.strictEqual(fs.existsSync(path.join(dir, id)), false);
  assert.strictEqual(store.get(id), null);
  assert.deepStrictEqual(store.list(), []);
});

test('ids that are not UUIDs are rejected so they cannot escape the folder', () => {
  const { store } = tmpStore();
  assert.strictEqual(store.get('../../etc'), null);
  assert.strictEqual(store.imageDataUrl('../../etc', 'x'), null);
  assert.throws(() => store.remove('../../etc'), /Invalid session id/);
});

test('unrecognised image data is ignored instead of written', () => {
  const { dir, store } = tmpStore();
  const id = store.appendTurn(null, { question: 'q', answer: 'a', imageDataUrl: 'not an image' });
  assert.strictEqual(store.get(id).turns[0].image, null);
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, id)), ['session.json']);
});

test('empty directory lists nothing', () => {
  const store = createSessionStore({ dir: path.join(os.tmpdir(), 'cue-missing-' + Date.now()) });
  assert.deepStrictEqual(store.list(), []);
});
