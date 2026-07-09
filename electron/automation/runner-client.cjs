const { fork } = require('child_process');

class RunnerClient {
  constructor({ scriptPath, env = {}, onEvent = () => {}, onHostRequest = null, forkFn = fork, timeoutMs = 15000 }) {
    this.scriptPath = scriptPath;
    this.env = env;
    this.onEvent = onEvent;
    this.onHostRequest = onHostRequest;
    this.forkFn = forkFn;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.pending = new Map();
    this.sequence = 0;
  }

  ensureStarted() {
    if (this.child?.connected) return;
    this.child = this.forkFn(this.scriptPath, [], {
      env: { ...process.env, ...this.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    this.child.on('message', message => this.handleMessage(message));
    this.child.on('exit', (code, signal) => this.handleExit(code, signal));
    this.child.on('error', error => this.handleExit(null, null, error));
    this.child.stdout?.on('data', data => console.log('[AutomationRunner]', String(data).trim()));
    this.child.stderr?.on('data', data => console.error('[AutomationRunner]', String(data).trim()));
  }

  handleMessage(message) {
    if (message?.type === 'event') {
      this.onEvent(message.event);
      return;
    }
    if (message?.type === 'host-request') {
      this.handleHostRequest(message);
      return;
    }
    if (message?.type !== 'response') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.ok) pending.resolve(message.data);
    else pending.reject(Object.assign(new Error(message.error?.message || 'Runner command failed'), message.error));
  }

  async handleHostRequest(message) {
    if (!this.child?.connected) return;
    try {
      if (!this.onHostRequest) throw Object.assign(new Error('Browser host is unavailable'), { code: 'BROWSER_HOST_UNAVAILABLE' });
      const data = await this.onHostRequest(message.action, message.payload || {});
      this.child.send({ type: 'host-response', id: message.id, ok: true, data });
    } catch (error) {
      this.child.send({
        type: 'host-response',
        id: message.id,
        ok: false,
        error: { code: error.code || 'BROWSER_HOST_ERROR', message: error.message || 'Browser host request failed' },
      });
    }
  }

  handleExit(code, signal, error) {
    const message = error?.message || `Runner exited (code=${code}, signal=${signal || 'none'})`;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.child = null;
  }

  command(command, payload = {}) {
    this.ensureStarted();
    this.sequence += 1;
    const id = `cmd_${Date.now()}_${this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Runner command timed out: ${command}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.send({ type: 'command', id, command, payload });
    });
  }

  start(tool) { return this.command('start', { tool }); }
  pause() { return this.command('pause'); }
  resume() { return this.command('resume'); }
  cancel() { return this.command('cancel'); }

  async stop() {
    if (!this.child) return;
    const child = this.child;
    try {
      await this.command('shutdown');
    } catch {}
    if (child.connected) child.disconnect();
    child.kill();
    this.child = null;
  }
}

module.exports = { RunnerClient };
