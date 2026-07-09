const SCRIPTS = Object.freeze({
  'amazon.register.v1': {
    key: 'amazon.register.v1',
    name: '亚马逊注册页面巡检',
    mode: 'read-only',
    description: '读取页面结构并标记主要操作区域，不填写或提交数据。',
  },
});

const FALLBACK_SCRIPT = Object.freeze({
  key: 'read-only.page-inspection.v1',
  name: '通用页面巡检',
  mode: 'read-only',
  description: '读取页面标题、表单、输入框和按钮数量，不提交数据。',
});

function resolveScript(scriptKey) {
  return SCRIPTS[scriptKey] || { ...FALLBACK_SCRIPT, requestedKey: scriptKey || null };
}

module.exports = { FALLBACK_SCRIPT, SCRIPTS, resolveScript };
