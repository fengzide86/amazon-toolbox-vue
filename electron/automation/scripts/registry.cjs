const SCRIPTS = Object.freeze({
  'amazon.register.v1': {
    key: 'amazon.register.v1',
    name: '新手快速注册工具',
    mode: 'workflow',
    description: '按预设步骤处理新手店铺注册流程。',
  },
});

const FALLBACK_SCRIPT = Object.freeze({
  key: 'workflow.generic.v1',
  name: '通用工具流程',
  mode: 'workflow',
  description: '按预设步骤处理工具任务。',
});

function resolveScript(scriptKey) {
  return SCRIPTS[scriptKey] || { ...FALLBACK_SCRIPT, requestedKey: scriptKey || null };
}

module.exports = { FALLBACK_SCRIPT, SCRIPTS, resolveScript };
