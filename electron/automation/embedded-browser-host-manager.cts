const { EmbeddedBrowserHost } = require('./embedded-browser-host.cjs');

interface BrowserHost {
  register(guest: unknown): unknown;
  isReady(): boolean;
  request(action: string, payload: Record<string, unknown>): Promise<unknown> | unknown;
  release(): unknown;
}

class EmbeddedBrowserHostManager {
  hosts: Map<string, BrowserHost>;

  constructor() {
    this.hosts = new Map();
  }

  register(itemId: string, guest: unknown) {
    if (!itemId) throw this.error('BATCH_ITEM_REQUIRED', '缺少批次账号标识');
    let host = this.hosts.get(itemId);
    if (!host) {
      const created = new EmbeddedBrowserHost() as BrowserHost;
      this.hosts.set(itemId, created);
      host = created;
    }
    return host.register(guest);
  }

  isReady(itemId: string): boolean {
    return Boolean(this.hosts.get(itemId)?.isReady());
  }

  request(itemId: string, action: string, payload: Record<string, unknown>) {
    const host = this.hosts.get(itemId);
    if (!host) throw this.error('BROWSER_NOT_REGISTERED', '该账号浏览器尚未就绪');
    return host.request(action, payload);
  }

  release(itemId: string) {
    const host = this.hosts.get(itemId);
    if (!host) return { released: true };
    const result = host.release();
    this.hosts.delete(itemId);
    return result;
  }

  releaseAll(): void {
    for (const host of this.hosts.values()) host.release();
    this.hosts.clear();
  }

  size(): number {
    return [...this.hosts.values()].filter(host => host.isReady()).length;
  }

  error(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
  }
}

module.exports = { EmbeddedBrowserHostManager };
