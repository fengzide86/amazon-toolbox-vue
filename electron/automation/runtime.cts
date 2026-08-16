const fs = require('fs');
const path = require('path');

const PROTOCOL_VERSION = 1;

const EVENTS = Object.freeze({
  RUN_STARTED: 'run.started',
  BROWSER_NAVIGATED: 'browser.navigated',
  STEP_STARTED: 'step.started',
  STEP_COMPLETED: 'step.completed',
  STEP_RETRYING: 'step.retrying',
  RUN_PAUSED: 'run.paused',
  RUN_RESUMED: 'run.resumed',
  USER_ACTION_REQUIRED: 'user.action_required',
  USER_ACTION_COMPLETED: 'user.action_completed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',
  ARTIFACT_CREATED: 'artifact.created',
});

interface LaunchGrant {
  expiresAt?: string
  expiresIn?: number
  scriptKey?: string
  runnerApiVersion?: number
  toolVersion?: string
}

interface ExecutionContext extends Record<string, unknown> {
  sessionId?: string
  input?: unknown
}

interface AutomationTool extends Record<string, unknown> {
  platformKey?: string
  targetUrl?: string
  launchGrant?: LaunchGrant
  executionContext?: ExecutionContext
}

interface ScriptStep extends Record<string, unknown> {
  id?: string
  title?: string
  detail?: string
  action?: string
}

interface AutomationScript extends Record<string, unknown> {
  steps?: ScriptStep[]
}

function createSteps(tool: AutomationTool = {}, script: AutomationScript = {}) {
  const platformName = tool.platformKey === 'aliexpress' ? '速卖通' : '亚马逊';
  const workflowSteps = Array.isArray(script.steps)
    ? script.steps.flatMap((step, index) => step.id ? [{
      id: step.id,
      title: step.title || `执行步骤 ${index + 1}`,
      detail: step.detail || '按照已发布的工具适配器处理当前页面。',
      action: step.action || step.title || '正在处理页面',
    }] : [])
    : [];
  return [
    { id: 'prepare', title: '初始化本地运行环境', detail: '校验启动授权并准备独立浏览器 Profile。', action: '正在检查授权和浏览器环境' },
    { id: 'open', title: `打开${platformName}页面`, detail: '使用可见浏览器进入工具目标页面。', action: `正在访问 ${tool.targetUrl || '目标页面'}` },
    { id: 'inspect', title: '扫描并检查页面', detail: '采集脱敏页面结构指纹，检查登录、验证码和页面变化。', action: '正在扫描页面状态' },
    ...workflowSteps,
    { id: 'verify', title: '检查执行结果', detail: '核对页面状态并生成运行结果。', action: '正在校验执行结果' },
    { id: 'summary', title: '整理任务结果', detail: '汇总本次本地 Runner 执行结果。', action: '正在生成结果摘要' },
  ];
}

function browserCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates: Array<string | undefined> = [env.TOOLBOX_BROWSER_EXECUTABLE];
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
  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

function findBrowserExecutable(env: NodeJS.ProcessEnv = process.env): string | null {
  return browserCandidates(env).find(candidate => fs.existsSync(candidate)) || null;
}

function findBrowserExecutables(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set(browserCandidates(env).filter(candidate => fs.existsSync(candidate)))];
}

function safeProfileName(tool: AutomationTool = {}): string {
  const platform = String(tool.platformKey || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const session = String(tool.executionContext?.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${platform}${session ? `_${session}` : ''}`.slice(0, 90) || 'default';
}

function publicTool(tool: AutomationTool = {}): AutomationTool {
  const grant = tool.launchGrant || {};
  const executionContext = tool.executionContext || {};
  const { input: _privateInput, ...publicExecutionContext } = executionContext;
  return {
    ...tool,
    executionContext: Object.keys(publicExecutionContext).length ? publicExecutionContext : undefined,
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
