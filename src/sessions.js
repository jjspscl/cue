// Session history: each conversation is a folder holding session.json and one
// screenshot file per turn. Plain fs only (no Electron) so it can be unit tested.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TITLE_CHARS = 60;

function createSessionStore({ dir }) {
  const UUID = /^[0-9a-f-]{36}$/;
  const sessionDir = (id) => {
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid session id.');
    return path.join(dir, id);
  };
  const sessionFile = (id) => path.join(sessionDir(id), 'session.json');

  function readSession(id) {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    try {
      return JSON.parse(fs.readFileSync(sessionFile(id), 'utf8'));
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    fs.mkdirSync(sessionDir(session.id), { recursive: true });
    const tmp = sessionFile(session.id) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
    fs.renameSync(tmp, sessionFile(session.id));
  }

  function saveImage(id, dataUrl) {
    const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl || '');
    if (!match) return null;
    const file = `${crypto.randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : 'png'}`;
    fs.mkdirSync(sessionDir(id), { recursive: true });
    fs.writeFileSync(path.join(sessionDir(id), file), Buffer.from(match[2], 'base64'));
    return file;
  }

  return {
    // Appends one completed question/answer turn. Creates a session when id is null.
    // Returns the session id the turn was stored under.
    appendTurn(id, { mode, question, answer, imageDataUrl }) {
      const now = Date.now();
      let session = id ? readSession(id) : null;
      if (!session) {
        session = {
          id: crypto.randomUUID(),
          title: '',
          createdAt: now,
          updatedAt: now,
          turns: []
        };
      }
      const turn = {
        id: crypto.randomUUID(),
        at: now,
        mode: mode || '',
        question: question || '',
        answer: answer || '',
        image: saveImage(session.id, imageDataUrl)
      };
      if (!session.title) {
        const text = (turn.question || turn.answer).trim();
        session.title = text.length > TITLE_CHARS ? text.slice(0, TITLE_CHARS) + '…' : (text || 'Untitled session');
      }
      session.turns.push(turn);
      session.updatedAt = now;
      writeSession(session);
      return session.id;
    },

    // Newest first, without turns, so the menu stays light.
    list() {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return [];
      }
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => readSession(e.name))
        .filter(Boolean)
        .map(({ id, title, createdAt, updatedAt, turns }) => ({ id, title, createdAt, updatedAt, turnCount: turns.length }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    get(id) {
      return readSession(id);
    },

    // Returns a data URL for a turn's screenshot, or null if it has none.
    imageDataUrl(id, turnId) {
      const session = readSession(id);
      const turn = session && session.turns.find((t) => t.id === turnId);
      if (!turn || !turn.image) return null;
      const buf = fs.readFileSync(path.join(sessionDir(id), turn.image));
      const type = turn.image.endsWith('.jpg') ? 'jpeg' : 'png';
      return `data:image/${type};base64,${buf.toString('base64')}`;
    },

    remove(id) {
      sessionDir(id);
      fs.rmSync(sessionDir(id), { recursive: true, force: true });
      return true;
    }
  };
}

module.exports = { createSessionStore };
