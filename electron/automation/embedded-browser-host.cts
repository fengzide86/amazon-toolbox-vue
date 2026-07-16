import type { Event, WebContents } from 'electron';

class EmbeddedBrowserHost {
  guest: WebContents | null;
  debuggerAttached: boolean;

  constructor() {
    this.guest = null;
    this.debuggerAttached = false;
  }

  register(guest: WebContents) {
    if (!guest || guest.isDestroyed?.()) throw this.error('BROWSER_GUEST_INVALID', '嵌入浏览器不可用');
    this.release();
    this.guest = guest;
    guest.once?.('destroyed', () => {
      if (this.guest === guest) {
        this.guest = null;
        this.debuggerAttached = false;
      }
    });
    return { id: guest.id, url: guest.getURL?.() || '' };
  }

  isReady(): boolean {
    return Boolean(this.guest && !this.guest.isDestroyed?.());
  }

  async request(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (action === 'browser.release') return this.release();
    if (action === 'browser.detach') return this.detach();
    const guest = this.requireGuest();
    if (action === 'browser.prepare') return this.prepare(guest);
    if (action === 'browser.navigate') return this.navigate(guest, payload.url);
    if (action === 'browser.inspect') return this.inspect(guest);
    if (action === 'browser.highlight') return this.highlight(guest);
    if (action === 'browser.screenshot') return this.screenshot(guest);
    if (action === 'browser.wait') return this.wait(payload.ms);
    throw this.error('BROWSER_ACTION_UNSUPPORTED', `不支持的浏览器动作: ${action}`);
  }

  async prepare(guest: WebContents = this.requireGuest()) {
    if (!guest.debugger.isAttached()) guest.debugger.attach('1.3');
    this.debuggerAttached = true;
    await guest.debugger.sendCommand('Page.enable');
    await guest.debugger.sendCommand('Runtime.enable');
    return { mode: 'embedded-cdp', webContentsId: guest.id, url: guest.getURL() };
  }

  async navigate(guest: WebContents, rawUrl: unknown) {
    const url = this.validUrl(rawUrl);
    if (guest.getURL() === url && !guest.isLoading?.()) return { url };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        guest.removeListener('did-stop-loading', onLoaded);
        guest.removeListener('did-fail-load', onFailed);
        if (error) reject(error);
        else resolve();
      };
      const onLoaded = () => finish();
      const onFailed = (_event: Event, code: number, description: string, validatedUrl: string, isMainFrame: boolean) => {
        if (isMainFrame === false || code === -3) return;
        finish(this.error('BROWSER_NAVIGATION_FAILED', description || `页面加载失败: ${validatedUrl}`));
      };
      const timer = setTimeout(() => finish(this.error('BROWSER_NAVIGATION_TIMEOUT', '页面加载超时')), 45000);
      guest.once('did-stop-loading', onLoaded);
      guest.on('did-fail-load', onFailed);
      guest.loadURL(url).catch((error: Error) => finish(this.error('BROWSER_NAVIGATION_FAILED', error.message)));
    });
    return { url: guest.getURL() };
  }

  async inspect(guest: WebContents): Promise<unknown> {
    await this.prepare(guest);
    const expression = `(() => ({
      title: document.title,
      url: location.href,
      forms: document.forms.length,
      inputs: document.querySelectorAll('input, textarea, select').length,
      buttons: document.querySelectorAll('button, [role="button"], input[type="submit"]').length,
      links: document.links.length,
      headings: Array.from(document.querySelectorAll('h1, h2')).slice(0, 5).map(node => node.innerText.trim()).filter(Boolean)
    }))()`;
    return guest.executeJavaScript(expression, true);
  }

  async highlight(guest: WebContents): Promise<unknown> {
    await this.prepare(guest);
    const expression = `(() => {
      const old = document.getElementById('__toolbox_runner_overlay__');
      if (old) old.remove();
      const candidate = document.querySelector('form, main, [role="main"], input, button');
      if (candidate) {
        candidate.dataset.toolboxOldOutline = candidate.style.outline || '';
        candidate.style.outline = '3px solid #4f46e5';
        candidate.style.outlineOffset = '4px';
      }
      const badge = document.createElement('div');
      badge.id = '__toolbox_runner_overlay__';
      badge.textContent = '工具正在识别当前页面';
      Object.assign(badge.style, {
        position: 'fixed', top: '18px', right: '18px', zIndex: '2147483647',
        padding: '10px 14px', borderRadius: '10px', color: '#fff',
        background: '#4f46e5', font: '600 13px system-ui', boxShadow: '0 8px 24px rgba(15,23,42,.22)'
      });
      document.documentElement.appendChild(badge);
      setTimeout(() => {
        badge.remove();
        if (candidate) candidate.style.outline = candidate.dataset.toolboxOldOutline || '';
      }, 1800);
      return { matched: Boolean(candidate), tagName: candidate?.tagName || null };
    })()`;
    return guest.executeJavaScript(expression, true);
  }

  async screenshot(guest: WebContents) {
    await this.prepare(guest);
    const image = await guest.capturePage();
    return { base64: image.toPNG().toString('base64'), mimeType: 'image/png' };
  }

  wait(ms: unknown = 250): Promise<{ waited: number }> {
    const safeMs = Math.min(Math.max(Number(ms) || 0, 0), 5000);
    return new Promise(resolve => setTimeout(() => resolve({ waited: safeMs }), safeMs));
  }

  release() {
    this.detach();
    this.guest = null;
    this.debuggerAttached = false;
    return { released: true };
  }

  detach() {
    if (this.guest && !this.guest.isDestroyed?.() && this.guest.debugger?.isAttached()) {
      try { this.guest.debugger.detach(); } catch {}
    }
    this.debuggerAttached = false;
    return { detached: true };
  }

  requireGuest(): WebContents {
    if (!this.isReady()) throw this.error('BROWSER_NOT_REGISTERED', '工作区浏览器尚未就绪');
    return this.guest as WebContents;
  }

  validUrl(rawUrl: unknown): string {
    try {
      const url = new URL(String(rawUrl || ''));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.toString();
    } catch {
      throw this.error('TARGET_URL_INVALID', '工具目标网址无效');
    }
  }

  error(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
  }
}

module.exports = { EmbeddedBrowserHost };
