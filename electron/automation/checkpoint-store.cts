const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

type UnknownRecord = Record<string, unknown>;

function safeName(value: unknown): string {
  return String(value || 'run').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'run';
}

function inputHash(input: UnknownRecord): string {
  return crypto.createHash('sha256').update(JSON.stringify(input || {})).digest('hex');
}

class CheckpointStore {
  filePath: string;
  scriptKey: string;
  hash: string;
  data: { scriptKey: string; inputHash: string; completedActions: string[]; updatedAt: string };

  constructor(root: string, key: string, scriptKey: string, input: UnknownRecord) {
    fs.mkdirSync(root, { recursive: true });
    this.filePath = path.join(root, `${safeName(key)}.json`);
    this.scriptKey = scriptKey;
    this.hash = inputHash(input);
    this.data = { scriptKey, inputHash: this.hash, completedActions: [], updatedAt: new Date().toISOString() };
    try {
      const loaded = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (loaded.scriptKey === scriptKey && loaded.inputHash === this.hash && Array.isArray(loaded.completedActions)) this.data = loaded;
    } catch {}
  }

  has(actionId: string): boolean { return this.data.completedActions.includes(actionId); }

  mark(actionId: string): void {
    if (!this.data.completedActions.includes(actionId)) this.data.completedActions.push(actionId);
    this.data.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  clear(): void { try { fs.rmSync(this.filePath, { force: true }); } catch {} }
}

module.exports = { CheckpointStore, inputHash };
