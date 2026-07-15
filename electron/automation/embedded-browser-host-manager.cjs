const { EmbeddedBrowserHost } = require('./embedded-browser-host.cjs');

class EmbeddedBrowserHostManager {
  constructor() {
    this.hosts = new Map();
  }

  register(itemId, guest) {
    if (!itemId) throw this.error('BATCH_ITEM_REQUIRED', '缺少批次账号标识');
    let host = this.hosts.get(itemId);
    if (!host) {
      host = new EmbeddedBrowserHost();
      this.hosts.set(itemId, host);
    }
    return host.register(guest);
  }

  isReady(itemId) {
    return Boolean(this.hosts.get(itemId)?.isReady());
  }

  request(itemId, action, payload) {
    const host = this.hosts.get(itemId);
    if (!host) throw this.error('BROWSER_NOT_REGISTERED', '该账号浏览器尚未就绪');
    return host.request(action, payload);
  }

  release(itemId) {
    const host = this.hosts.get(itemId);
    if (!host) return { released: true };
    const result = host.release();
    this.hosts.delete(itemId);
    return result;
  }

  releaseAll() {
    for (const host of this.hosts.values()) host.release();
    this.hosts.clear();
  }

  size() {
    return [...this.hosts.values()].filter(host => host.isReady()).length;
  }

  error(code, message) {
    return Object.assign(new Error(message), { code });
  }
}

module.exports = { EmbeddedBrowserHostManager };
