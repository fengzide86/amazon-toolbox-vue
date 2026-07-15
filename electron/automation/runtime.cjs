const fs = require('fs');
const path = require('path');

const PROTOCOL_VERSION = 1;

const EVENTS = Object.freeze({
  RUN_STARTED: 'run.started',
  BROWSER_NAVIGATED: 'browser.navigated',
  STEP_STARTED: 'step.started',
  STEP_COMPLETED: 'step.completed',
  RUN_PAUSED: 'run.paused',
  RUN_RESUMED: 'run.resumed',
  USER_ACTION_REQUIRED: 'user.action_required',
  USER_ACTION_COMPLETED: 'user.action_completed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',
  ARTIFACT_CREATED: 'artifact.created',
});

function createSteps(tool = {}) {
  const platformName = tool.platformKey === 'aliexpress' ? '速卖通' : '亚马逊';
  const scriptKey = tool.launchGrant?.scriptKey || '';
  const isRegisterFlow = scriptKey.includes('register');
  return [
    { id: 'prepare', title: '初始化本地运行环境', detail: '校验启动授权并准备独立浏览器 Profile。', action: '正在检查授权和浏览器环境' },
    { id: 'open', title: `打开${platformName}页面`, detail: '使用可见浏览器进入工具目标页面。', action: `正在访问 ${tool.targetUrl || '目标页面'}` },
    { id: 'inspect', title: '检查页面状态', detail: '确认页面已正常加载并准备执行任务。', action: '正在检查页面状态' },
    {
      id: 'execute',
      title: isRegisterFlow ? '执行注册流程' : '运行工具脚本',
      detail: '按照预设流程处理当前任务。',
      action: isRegisterFlow ? '正在处理注册信息' : '正在执行本地工具脚本',
    },
    { id: 'verify', title: '检查执行结果', detail: '核对页面状态并生成运行结果。', action: '正在校验执行结果' },
    { id: 'summary', title: '整理任务结果', detail: '汇总本次本地 Runner 执行结果。', action: '正在生成结果摘要' },
  ];
}

function browserCandidates(env = process.env) {
  const candidates = [env.TOOLBOX_BROWSER_EXECUTABLE];
  if (process.platform === 'win32') {
    candidates.push(
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium');
  }
  return candidates.filter(Boolean);
}

function findBrowserExecutable(env = process.env) {
  return browserCandidates(env).find(candidate => fs.existsSync(candidate)) || null;
}

function findBrowserExecutables(env = process.env) {
  return [...new Set(browserCandidates(env).filter(candidate => fs.existsSync(candidate)))];
}

function safeProfileName(tool = {}) {
  const platform = String(tool.platformKey || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return platform.slice(0, 50) || 'default';
}

function publicTool(tool = {}) {
  const grant = tool.launchGrant || {};
  return {
    ...tool,
    launchGrant: {
      expiresAt: grant.expiresAt,
      expiresIn: grant.expiresIn,
      scriptKey: grant.scriptKey,
      runnerApiVersion: grant.runnerApiVersion,
      toolVersion: grant.toolVersion,
    },
  };
}

module.exports = {
  EVENTS,
  PROTOCOL_VERSION,
  createSteps,
  findBrowserExecutable,
  findBrowserExecutables,
  publicTool,
  safeProfileName,
};
