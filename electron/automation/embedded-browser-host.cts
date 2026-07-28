import type { Event, WebContents } from 'electron';

type NavigationError = Error & {
  code: string;
  chromiumCode?: number;
  url?: string;
};

type NavigationCleanup = {
  attemptId: number;
  cancel: (reason?: NavigationError) => void;
};

const NAVIGATION_TIMEOUT_MS = 30000;
const TRANSIENT_NETWORK_CODES = new Set([-7, -21, -101, -102, -105, -106, -118, -130]);

class EmbeddedBrowserHost {
  guest: WebContents | null;
  debuggerAttached: boolean;
  navigationSequence: number;
  activeNavigation: NavigationCleanup | null;

  constructor() {
    this.guest = null;
    this.debuggerAttached = false;
    this.navigationSequence = 0;
    this.activeNavigation = null;
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
    if (action === 'browser.scan') return this.scan(guest);
    if (action === 'browser.action') return this.action(guest, payload);
    if (action === 'browser.detect-interruption') return this.detectInterruption(guest);
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
    const currentUrl = guest.getURL?.() || '';
    if (await this.canReusePage(guest, currentUrl, url)) {
      return { url: currentUrl, reused: true };
    }

    let lastError: NavigationError | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const finalUrl = await this.navigateOnce(guest, url);
        return { url: finalUrl, reused: false, retried: attempt > 0 };
      } catch (error) {
        lastError = error as NavigationError;
        if (attempt > 0 || !this.isTransientNavigationError(lastError)) throw lastError;
      }
    }
    throw lastError || this.navigationError('BROWSER_NAVIGATION_FAILED', '页面暂时没有打开', undefined, url);
  }

  async navigateOnce(guest: WebContents, url: string): Promise<string> {
    this.cancelActiveNavigation();
    const attemptId = ++this.navigationSequence;

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const isCurrent = () => this.activeNavigation?.attemptId === attemptId;
      const removeListeners = () => {
        clearTimeout(timer);
        guest.removeListener('dom-ready', onDomReady);
        guest.removeListener('did-frame-finish-load', onFrameFinished);
        guest.removeListener('did-navigate', onNavigated);
        guest.removeListener('did-redirect-navigation', onRedirect);
        guest.removeListener('did-fail-load', onFailed);
      };
      const finish = (error?: NavigationError) => {
        if (settled || !isCurrent()) return;
        settled = true;
        removeListeners();
        this.activeNavigation = null;
        if (error) reject(error);
        else resolve(guest.getURL?.() || url);
      };
      const finishWhenDocumentReady = async () => {
        if (settled || !isCurrent()) return;
        const loadedUrl = guest.getURL?.() || '';
        if (!this.isAllowedNavigationTarget(loadedUrl, url)) return;
        if (await this.isDocumentReady(guest)) finish();
      };
      const onDomReady = () => { void finishWhenDocumentReady(); };
      const onFrameFinished = (_event: Event, isMainFrame: boolean) => {
        if (isMainFrame !== false) void finishWhenDocumentReady();
      };
      const onNavigated = (_event: Event, navigatedUrl: string) => {
        if (this.isAllowedNavigationTarget(navigatedUrl, url)) void finishWhenDocumentReady();
      };
      const onRedirect = (
        _event: Event,
        navigatedUrl: string,
        _isInPlace: boolean,
        isMainFrame: boolean,
      ) => {
        if (isMainFrame !== false && this.isAllowedNavigationTarget(navigatedUrl, url)) {
          void finishWhenDocumentReady();
        }
      };
      const onFailed = (
        _event: Event,
        code: number,
        description: string,
        validatedUrl: string,
        isMainFrame: boolean,
      ) => {
        if (isMainFrame === false || code === -3) return;
        finish(this.navigationError(
          'BROWSER_NAVIGATION_FAILED',
          description || '页面暂时没有打开',
          code,
          validatedUrl || url,
        ));
      };
      const timer = setTimeout(() => {
        finish(this.navigationError('BROWSER_NAVIGATION_TIMEOUT', '页面暂时没有打开', -7, guest.getURL?.() || url));
      }, NAVIGATION_TIMEOUT_MS);

      this.activeNavigation = {
        attemptId,
        cancel: (reason = this.navigationError('BROWSER_NAVIGATION_CANCELLED', '页面打开已取消')) => finish(reason),
      };
      guest.on('dom-ready', onDomReady);
      guest.on('did-frame-finish-load', onFrameFinished);
      guest.on('did-navigate', onNavigated);
      guest.on('did-redirect-navigation', onRedirect);
      guest.on('did-fail-load', onFailed);
      guest.loadURL(url).catch((error: Error & { errno?: number }) => {
        if (error?.errno === -3 || /ERR_ABORTED/i.test(error?.message || '')) return;
        finish(this.navigationError('BROWSER_NAVIGATION_FAILED', error?.message || '页面暂时没有打开', error?.errno, url));
      });
    });
  }

  async canReusePage(guest: WebContents, currentUrl: string, targetUrl: string): Promise<boolean> {
    if (guest.isLoading?.() || !this.isReusableNavigationTarget(currentUrl, targetUrl)) return false;
    return this.isDocumentReady(guest);
  }

  isReusableNavigationTarget(currentUrl: string, targetUrl: string): boolean {
    try {
      const current = new URL(currentUrl);
      const target = new URL(targetUrl);
      const samePage = current.origin === target.origin
        && current.pathname.replace(/\/+$/, '') === target.pathname.replace(/\/+$/, '')
      return samePage || (this.isAmazonHost(current.hostname) && this.isAmazonHost(target.hostname));
    } catch {
      return false;
    }
  }

  async isDocumentReady(guest: WebContents): Promise<boolean> {
    try {
      const state = await guest.executeJavaScript('document.readyState', true);
      return state === 'interactive' || state === 'complete';
    } catch {
      return false;
    }
  }

  isAllowedNavigationTarget(currentUrl: string, targetUrl: string): boolean {
    try {
      const current = new URL(currentUrl);
      const target = new URL(targetUrl);
      if (!['http:', 'https:'].includes(current.protocol)) return false;
      if (current.origin === target.origin) return true;
      return this.isAmazonHost(current.hostname) && this.isAmazonHost(target.hostname);
    } catch {
      return false;
    }
  }

  isAmazonHost(hostname: string): boolean {
    return /(^|\.)amazon\.[a-z.]+$/i.test(hostname);
  }

  isTransientNavigationError(error: NavigationError): boolean {
    return error.code === 'BROWSER_NAVIGATION_TIMEOUT'
      || (typeof error.chromiumCode === 'number' && TRANSIENT_NETWORK_CODES.has(error.chromiumCode));
  }

  cancelActiveNavigation(reason?: NavigationError): void {
    this.activeNavigation?.cancel(reason);
    this.activeNavigation = null;
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

  async scan(guest: WebContents): Promise<unknown> {
    await this.prepare(guest);
    const expression = `(() => {
      const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 180);
      const labelFor = element => {
        if (element.labels?.length) return normalize(Array.from(element.labels).map(item => item.textContent).join(' '));
        const id = element.getAttribute('id');
        if (id) return normalize(document.querySelector('label[for="' + CSS.escape(id) + '"]')?.textContent);
        return normalize(element.closest('label')?.textContent);
      };
      const nodes = Array.from(document.querySelectorAll('input, textarea, select, button, [role="button"], a[href]')).slice(0, 500);
      return {
        schemaVersion: 1,
        title: normalize(document.title),
        path: location.pathname,
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 30).map(node => normalize(node.textContent)).filter(Boolean),
        forms: Array.from(document.forms).map((form, index) => ({ index, id: normalize(form.id), name: normalize(form.getAttribute('name')), method: form.method, actionPath: (() => { try { return new URL(form.action).pathname; } catch { return ''; } })() })),
        controls: nodes.map((element, index) => ({
          index, tag: element.tagName.toLowerCase(), type: element.getAttribute('type') || '', id: normalize(element.id),
          name: normalize(element.getAttribute('name')), testId: normalize(element.getAttribute('data-testid') || element.getAttribute('data-test')),
          role: normalize(element.getAttribute('role')), label: labelFor(element), placeholder: normalize(element.getAttribute('placeholder')),
          text: normalize(element.textContent), hrefPath: element.tagName === 'A' ? (() => { try { return new URL(element.href).pathname; } catch { return ''; } })() : ''
        }))
      };
    })()`;
    return guest.executeJavaScript(expression, true);
  }

  async action(guest: WebContents, payload: Record<string, unknown>): Promise<unknown> {
    await this.prepare(guest);
    const serialized = JSON.stringify({ action: payload.action || {}, input: payload.input || {} })
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const expression = `(async payload => {
      const action = payload.action || {};
      const input = payload.input || {};
      const value = action.inputKey ? input[action.inputKey] : action.value;
      if (action.inputKey && action.required !== false && !action.optional && (value === undefined || value === null || value === '')) {
        const error = new Error('缺少必填参数：' + (action.title || action.inputKey)); error.code = 'INPUT_REQUIRED'; throw error;
      }
      const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim();
      const byCandidate = candidate => {
        const strategy = candidate.strategy; const target = String(candidate.value || ''); let matches = [];
        try {
          if (strategy === 'css') matches = Array.from(document.querySelectorAll(target));
          else if (strategy === 'id') matches = [document.getElementById(target)].filter(Boolean);
          else if (strategy === 'name') matches = Array.from(document.getElementsByName(target));
          else if (strategy === 'testId') matches = Array.from(document.querySelectorAll('[data-testid="' + CSS.escape(target) + '"],[data-test="' + CSS.escape(target) + '"]'));
          else if (strategy === 'placeholder') matches = Array.from(document.querySelectorAll('[placeholder]')).filter(el => normalize(el.getAttribute('placeholder')).includes(target));
          else if (strategy === 'label') {
            const labels = Array.from(document.querySelectorAll('label')).filter(el => normalize(el.textContent).includes(target));
            matches = labels.flatMap(el => { const id = el.getAttribute('for'); return [id ? document.getElementById(id) : el.querySelector('input,textarea,select,button')].filter(Boolean); });
          } else if (strategy === 'role') {
            const role = target; const roleSelector = role === 'button' ? 'button,input[type="button"],input[type="submit"],[role="button"]' : '[role="' + CSS.escape(role) + '"]';
            matches = Array.from(document.querySelectorAll(roleSelector)).filter(el => !candidate.name || normalize(el.textContent || el.value).includes(candidate.name));
          } else if (strategy === 'text') matches = Array.from(document.querySelectorAll('button,a,[role="button"],span,div')).filter(el => normalize(el.textContent) === target || normalize(el.textContent).includes(target));
        } catch {}
        return matches.find(visible) || null;
      };
      const deadline = Date.now() + Math.min(Math.max(Number(action.timeoutMs) || 8000, 500), 30000);
      let element = null;
      while (!element && Date.now() < deadline) {
        for (const candidate of action.selectors || []) { element = byCandidate(candidate); if (element) break; }
        if (!element) await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!element) {
        if (action.optional) return { skipped: true, optional: true };
        const error = new Error('页面中没有找到“' + (action.title || action.id || '目标控件') + '”'); error.code = 'SELECTOR_NOT_FOUND'; throw error;
      }
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (action.kind === 'fill') {
        const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set; if (setter) setter.call(element, String(value ?? '')); else element.value = String(value ?? '');
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value ?? '') })); element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action.kind === 'select') {
        const option = Array.from(element.options || []).find(item => item.value === String(value) || normalize(item.textContent).includes(String(value)));
        if (!option) { const error = new Error('下拉选项不存在：' + value); error.code = 'OPTION_NOT_FOUND'; throw error; }
        element.value = option.value; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action.kind === 'click') element.click();
      else if (action.kind === 'check') { element.checked = Boolean(value ?? true); element.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (action.kind === 'waitFor') return { visible: true };
      else if (action.kind === 'assertText') { const actual = normalize(element.textContent || element.value); const expected = normalize(value); if (expected && !actual.includes(expected)) { const error = new Error('结果核验失败：页面未出现“' + expected + '”'); error.code = 'RESULT_NOT_CONFIRMED'; throw error; } return { text: actual.slice(0, 500) }; }
      else if (action.kind === 'upload') { const error = new Error('嵌入浏览器不支持自动上传，请切换独立浏览器执行'); error.code = 'UPLOAD_REQUIRES_PLAYWRIGHT'; throw error; }
      else { const error = new Error('不支持的动作类型：' + action.kind); error.code = 'ACTION_UNSUPPORTED'; throw error; }
      return { completed: true, actionId: action.id };
    })(${serialized})`;
    return guest.executeJavaScript(expression, true);
  }

  async detectInterruption(guest: WebContents): Promise<unknown> {
    await this.prepare(guest);
    const expression = `(() => {
      const url = location.href.toLowerCase();
      const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      if (/\\/(login|signin|sign-in|auth)(\\/|\\?|$)/.test(url) || Array.from(document.querySelectorAll('input[type="password"]')).some(visible)) return { type:'login', title:'需要登录平台', instruction:'请完成账号登录，工具不会读取或上传密码。' };
      if (Array.from(document.querySelectorAll('iframe[src*="captcha" i],[class*="captcha" i],[id*="captcha" i],textarea[name="g-recaptcha-response"]')).some(visible)) return { type:'captcha', title:'需要完成验证码', instruction:'请手动完成页面验证码，然后返回工具箱继续。' };
      if (Array.from(document.querySelectorAll('input[autocomplete="one-time-code"],input[name*="otp" i],input[id*="otp" i]')).some(visible)) return { type:'two_factor', title:'需要二次验证', instruction:'请在页面完成短信或动态码验证。' };
      const text = (document.body?.innerText || '').slice(0,20000); if (/请求过于频繁|访问频率过高|稍后再试|too many requests|rate limit/i.test(text)) { const error = new Error('平台提示访问频率受限，任务已停止'); error.code='PLATFORM_RATE_LIMITED'; throw error; }
      return null;
    })()`;
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
    this.cancelActiveNavigation();
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

  navigationError(code: string, message: string, chromiumCode?: number, url?: string): NavigationError {
    return Object.assign(new Error(message), { code, chromiumCode, url });
  }
}

module.exports = { EmbeddedBrowserHost };
