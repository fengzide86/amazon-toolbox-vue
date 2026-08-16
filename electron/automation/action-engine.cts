type UnknownRecord = Record<string, unknown>;

interface SelectorCandidate {
  strategy?: string;
  value?: string;
  name?: string;
}

interface WorkflowAction extends UnknownRecord {
  id?: string;
  kind?: string;
  title?: string;
  selectors?: SelectorCandidate[];
  inputKey?: string;
  value?: unknown;
  optional?: boolean;
  timeoutMs?: number;
}

function actionError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function resolveValue(action: WorkflowAction, input: UnknownRecord): unknown {
  if (action.inputKey) {
    const value = input[action.inputKey];
    if ((value === undefined || value === null || value === '') && action.required !== false && !action.optional) {
      throw actionError('INPUT_REQUIRED', `缺少必填参数：${action.title || action.inputKey}`);
    }
    return value;
  }
  return action.value;
}

function locatorFor(page: import('playwright-core').Page, candidate: SelectorCandidate) {
  const value = String(candidate.value || '');
  if (candidate.strategy === 'css') return page.locator(value);
  if (candidate.strategy === 'id') return page.locator(`[id=${JSON.stringify(value)}]`);
  if (candidate.strategy === 'name') return page.locator(`[name=${JSON.stringify(value)}]`);
  if (candidate.strategy === 'testId') return page.getByTestId(value);
  if (candidate.strategy === 'label') return page.getByLabel(value, { exact: false });
  if (candidate.strategy === 'placeholder') return page.getByPlaceholder(value, { exact: false });
  if (candidate.strategy === 'text') return page.getByText(value, { exact: false });
  if (candidate.strategy === 'role') return page.getByRole(candidate.value as never, { name: candidate.name || undefined, exact: false });
  return page.locator(value);
}

async function firstVisibleLocator(page: import('playwright-core').Page, action: WorkflowAction) {
  const candidates = Array.isArray(action.selectors) ? action.selectors : [];
  const timeout = Math.min(Math.max(Number(action.timeoutMs) || 8000, 500), 30000);
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      try {
        const locator = locatorFor(page, candidate).first();
        if (await locator.isVisible({ timeout: 150 })) return locator;
      } catch (error) {
        lastError = error;
      }
    }
    await page.waitForTimeout(250);
  }
  if (action.optional) return null;
  const suffix = lastError instanceof Error ? `：${lastError.message}` : '';
  throw actionError('SELECTOR_NOT_FOUND', `页面中没有找到“${action.title || action.id || '目标控件'}”${suffix}`);
}

async function executePlaywrightAction(
  page: import('playwright-core').Page,
  rawAction: WorkflowAction,
  input: UnknownRecord,
): Promise<UnknownRecord> {
  const action = { ...rawAction };
  const locator = await firstVisibleLocator(page, action);
  if (!locator) return { skipped: true, optional: true };
  const value = resolveValue(action, input);
  const timeout = Math.min(Math.max(Number(action.timeoutMs) || 10000, 500), 30000);

  if (action.kind === 'fill') await locator.fill(String(value ?? ''), { timeout });
  else if (action.kind === 'select') {
    await locator.selectOption({ label: String(value ?? '') }, { timeout }).catch(async () => {
      await locator.selectOption(String(value ?? ''), { timeout });
    });
  } else if (action.kind === 'click') await locator.click({ timeout });
  else if (action.kind === 'check') await locator.setChecked(Boolean(value ?? true), { timeout });
  else if (action.kind === 'upload') await locator.setInputFiles(String(value ?? ''), { timeout });
  else if (action.kind === 'waitFor') await locator.waitFor({ state: 'visible', timeout });
  else if (action.kind === 'assertText') {
    const actual = (await locator.innerText({ timeout })).trim();
    const expected = String(value ?? '').trim();
    if (expected && !actual.includes(expected)) throw actionError('RESULT_NOT_CONFIRMED', `结果核验失败：页面未出现“${expected}”`);
    return { text: actual.slice(0, 500) };
  } else throw actionError('ACTION_UNSUPPORTED', `不支持的动作类型：${action.kind}`);

  return { completed: true, actionId: action.id };
}

async function detectPlaywrightInterruption(page: import('playwright-core').Page): Promise<UnknownRecord | null> {
  const url = page.url().toLowerCase();
  if (/\/(login|signin|sign-in|auth)(\/|\?|$)/.test(url)) {
    return { type: 'login', title: '需要登录平台', instruction: '请在打开的浏览器中完成登录，然后返回工具箱继续。' };
  }
  const passwordVisible = await page.locator('input[type="password"]').first().isVisible({ timeout: 100 }).catch(() => false);
  if (passwordVisible) return { type: 'login', title: '需要登录平台', instruction: '请完成账号登录，工具不会读取或上传密码。' };
  const captchaVisible = await page.locator('iframe[src*="captcha" i], [class*="captcha" i], [id*="captcha" i], textarea[name="g-recaptcha-response"]').first().isVisible({ timeout: 100 }).catch(() => false);
  if (captchaVisible) return { type: 'captcha', title: '需要完成验证码', instruction: '请手动完成页面验证码，完成后返回工具箱继续。' };
  const twoFactorVisible = await page.locator('input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i]').first().isVisible({ timeout: 100 }).catch(() => false);
  if (twoFactorVisible) return { type: 'two_factor', title: '需要二次验证', instruction: '请在页面完成短信或动态码验证，然后继续。' };
  const text = (await page.locator('body').innerText({ timeout: 1000 }).catch(() => '')).slice(0, 20000);
  if (/请求过于频繁|访问频率过高|稍后再试|too many requests|rate limit/i.test(text)) {
    throw actionError('PLATFORM_RATE_LIMITED', '平台提示访问频率受限，任务已停止，请稍后再试');
  }
  return null;
}

function isTransientActionError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code || '') : '';
  const message = error instanceof Error ? error.message : '';
  if (['INPUT_REQUIRED', 'RESULT_NOT_CONFIRMED', 'PLATFORM_RATE_LIMITED', 'ACTION_UNSUPPORTED'].includes(code)) return false;
  return /timeout|timed out|detached|navigation|net::|temporarily|closed/i.test(`${code} ${message}`);
}

module.exports = { actionError, detectPlaywrightInterruption, executePlaywrightAction, isTransientActionError, resolveValue };
