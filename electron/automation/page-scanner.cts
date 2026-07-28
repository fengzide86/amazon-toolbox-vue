const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

type UnknownRecord = Record<string, unknown>;

function safeName(value: unknown): string {
  return String(value || 'page').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'page';
}

function fingerprint(pageMap: UnknownRecord): string {
  return crypto.createHash('sha256').update(JSON.stringify(pageMap)).digest('hex');
}

async function scanPlaywrightPage(page: import('playwright-core').Page): Promise<UnknownRecord> {
  return page.evaluate(() => {
    const normalize = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    const labelFor = (element: Element): string => {
      const htmlElement = element as HTMLInputElement;
      if (htmlElement.labels?.length) return normalize(Array.from(htmlElement.labels).map(item => item.textContent).join(' '));
      const id = element.getAttribute('id');
      if (id) return normalize(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent);
      return normalize(element.closest('label')?.textContent);
    };
    const nodes = Array.from(document.querySelectorAll('input, textarea, select, button, [role="button"], a[href]')).slice(0, 500);
    const controls = nodes.map((element, index) => ({
      index,
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type') || '',
      id: normalize(element.getAttribute('id')),
      name: normalize(element.getAttribute('name')),
      testId: normalize(element.getAttribute('data-testid') || element.getAttribute('data-test')),
      role: normalize(element.getAttribute('role')),
      label: labelFor(element),
      placeholder: normalize(element.getAttribute('placeholder')),
      text: normalize(element.textContent),
      hrefPath: element instanceof HTMLAnchorElement ? (() => { try { return new URL(element.href).pathname; } catch { return ''; } })() : '',
    }));
    return {
      schemaVersion: 1,
      title: normalize(document.title),
      path: location.pathname,
      headings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 30).map(node => normalize(node.textContent)).filter(Boolean),
      forms: Array.from(document.forms).map((form, index) => ({ index, id: normalize(form.id), name: normalize(form.getAttribute('name')), method: form.method, actionPath: (() => { try { return new URL(form.action).pathname; } catch { return ''; } })() })),
      controls,
    };
  });
}

function persistPageScan(root: string, scriptKey: string, pageMap: UnknownRecord): UnknownRecord {
  fs.mkdirSync(root, { recursive: true });
  const base = safeName(scriptKey);
  const currentFingerprint = fingerprint(pageMap);
  const latestPath = path.join(root, `${base}.latest.json`);
  let previous: UnknownRecord | null = null;
  try { previous = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch {}
  const previousFingerprint = typeof previous?.fingerprint === 'string' ? previous.fingerprint : null;
  const changed = Boolean(previousFingerprint && previousFingerprint !== currentFingerprint);
  const report = {
    schemaVersion: 1,
    scriptKey,
    scannedAt: new Date().toISOString(),
    fingerprint: currentFingerprint,
    previousFingerprint,
    changed,
    page: pageMap,
  };
  const reportPath = path.join(root, `${base}.${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });
  return { ...report, reportPath };
}

module.exports = { fingerprint, persistPageScan, scanPlaywrightPage };
