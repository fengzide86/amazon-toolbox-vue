const http = require('http');

type UnknownRecord = Record<string, unknown>;

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function fieldHtml(rawField: UnknownRecord): string {
  const key = escapeHtml(rawField.key);
  const label = escapeHtml(rawField.label || rawField.key);
  const required = rawField.required === false ? '' : ' required';
  if (rawField.type === 'select') {
    const options = Array.isArray(rawField.options) ? rawField.options : [];
    return `<label><span>${label}</span><select name="${key}" data-field="${key}"${required}>${options.map(option => `<option>${escapeHtml(option)}</option>`).join('')}</select></label>`;
  }
  const type = rawField.type === 'number' ? 'number' : rawField.type === 'file' ? 'file' : 'text';
  const step = type === 'number' ? ' step="any"' : '';
  return `<label><span>${label}</span><input type="${type}" name="${key}" data-field="${key}" placeholder="${label}"${step}${required}></label>`;
}

const SCENARIOS: Record<string, { section: string; kicker: string; action: string; result: string; nav: string[]; metrics: Array<[string, string]> }> = {
  register: { section: '店铺资料中心', kicker: '身份资料与开店信息', action: '提交注册资料', result: '注册资料已保存并通过完整性核验', nav: ['开店概览', '主体资料', '联系人', '审核记录'], metrics: [['资料完整度', '100%'], ['待核验字段', '0'], ['保存状态', '已就绪']] },
  logistics_standard: { section: '配送模板中心', kicker: '国家分组与运费规则', action: '保存物流模板', result: '物流模板已生成，费率版本与国家规则已留痕', nav: ['模板概览', '配送区域', '运费规则', '版本记录'], metrics: [['费率版本', 'v1.0.0'], ['规则核验', '通过'], ['货币', 'USD']] },
  logistics_cost: { section: '物流成本实验室', kicker: '渠道费用与计费重比较', action: '开始比价', result: '候选物流方案已完成计算，推荐渠道已回传工具箱', nav: ['报价概览', '渠道比较', '费用拆分', '计算证据'], metrics: [['候选渠道', '4'], ['汇率', '7.00'], ['计算状态', '可核验']] },
  listing_script: { section: '商品发布工作台', kicker: '基础资料、库存与包装信息', action: '发布商品', result: '商品已保存并进入模拟发布队列', nav: ['商品概览', '基础信息', '库存价格', '包装物流'], metrics: [['字段检查', '通过'], ['发布阶段', '准备完成'], ['证据', '已记录']] },
  ship_script: { section: '订单履约中心', kicker: '渠道选择与发货确认', action: '确认发货', result: '订单已确认发货，物流费用与单号已完成核验', nav: ['待发订单', '渠道选择', '发货确认', '履约记录'], metrics: [['费率版本', 'v1.0.0'], ['单号校验', '通过'], ['订单状态', '待提交']] },
  fba_agl: { section: '入库货件控制台', kicker: '仓库、箱规与货件计划', action: '创建货件', result: 'FBA/AGL 货件计划已创建并完成箱规核验', nav: ['货件计划', '商品明细', '箱规信息', '入库确认'], metrics: [['箱规检查', '通过'], ['仓库状态', '可接收'], ['步骤', '4 / 4']] },
  replenishment: { section: '库存决策中心', kicker: '需求、库存与安全比例', action: '保存补货建议', result: '补货建议已计算并保存，计算输入已留痕', nav: ['库存概览', '需求预测', '补货建议', '计算说明'], metrics: [['规则引擎', '本地'], ['库存风险', '已评估'], ['建议状态', '可执行']] },
  ad_script: { section: '广告活动中心', kicker: '预算、竞价与商品关联', action: '创建广告活动', result: '广告活动已创建，预算与竞价已通过校验', nav: ['活动概览', '预算竞价', '商品关联', '发布记录'], metrics: [['预算校验', '通过'], ['商品状态', '可投放'], ['活动阶段', '草稿']] },
  ali_register: { section: '速卖通开店中心', kicker: '开店资料与联系人', action: '提交开店资料', result: '速卖通开店资料已保存并完成核验', nav: ['开店概览', '主体资料', '联系人', '审核记录'], metrics: [['资料完整度', '100%'], ['字段状态', '通过'], ['保存状态', '已就绪']] },
  ali_listing: { section: '速卖通商品中心', kicker: '商品资料与库存发布', action: '发布商品', result: '速卖通商品已保存并进入模拟发布队列', nav: ['商品概览', '基础信息', '价格库存', '发布记录'], metrics: [['字段检查', '通过'], ['库存状态', '充足'], ['发布阶段', '准备完成']] },
  ali_ship: { section: '速卖通履约中心', kicker: '订单与物流通知', action: '确认发货', result: '速卖通发货通知已填写并完成核验', nav: ['待发订单', '承运商', '物流单号', '履约记录'], metrics: [['订单检查', '通过'], ['物流状态', '可提交'], ['证据', '已记录']] },
};

function sandboxHtml(script: UnknownRecord): string {
  const fields = Array.isArray(script.inputSchema) ? script.inputSchema as UnknownRecord[] : [];
  const capabilityKey = String(script.capabilityKey || 'listing_script');
  const scenario = SCENARIOS[capabilityKey] || SCENARIOS.listing_script!;
  const nav = scenario.nav.map((item, index) => `<button class="nav-item${index === 0 ? ' active' : ''}" type="button"><i></i>${escapeHtml(item)}</button>`).join('');
  const metrics = scenario.metrics.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>实时状态</small></article>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(script.name)} - 本地模拟平台</title><style>
  :root{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;color:#182033;background:#f4f5f7;--blue:#2d5fca;--gold:#a98552;--border:#e1e5eb;--muted:#667085;--ink:#101828}*{box-sizing:border-box}body{margin:0}.top{height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;color:#fff;background:var(--ink);border-bottom:1px solid rgba(255,255,255,.1)}.brand{display:flex;align-items:center;gap:10px}.brand-mark{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;color:#fff;background:var(--blue);font-weight:900}.brand strong{font-size:13px}.brand small{display:block;margin-top:2px;color:rgba(255,255,255,.48);font-size:10px;letter-spacing:.08em}.secure{display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:rgba(255,255,255,.68);font-size:11px}.secure i{width:6px;height:6px;border-radius:50%;background:#72d9ad;box-shadow:0 0 0 4px rgba(114,217,173,.1)}.layout{display:grid;grid-template-columns:205px 1fr;min-height:calc(100vh - 60px)}aside{padding:18px 12px;background:#fcfcfd;border-right:1px solid var(--border)}.workspace-label{padding:0 10px 12px;color:#98a2b3;font-size:10px;font-weight:800;letter-spacing:.13em}.nav-item{width:100%;height:38px;display:flex;align-items:center;gap:9px;margin-bottom:3px;padding:0 10px;border:0;border-radius:8px;color:var(--muted);background:transparent;font:600 12px/1 inherit;text-align:left}.nav-item i{width:6px;height:6px;border-radius:2px;background:#cfd5de}.nav-item.active{color:var(--blue);background:#eaf0ff}.nav-item.active i{background:var(--blue)}.aside-note{margin:24px 7px 0;padding:11px;border:1px solid var(--border);border-radius:9px;color:#667085;background:#f8f9fb;font-size:10px;line-height:1.55}.main{min-width:0;padding:24px 28px 40px}.crumb{color:#98a2b3;font-size:11px}.heading{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin:9px 0 18px}.heading h1{margin:0;font-size:24px;letter-spacing:-.035em}.heading p{margin:6px 0 0;color:var(--muted);font-size:12px}.adapter{padding:7px 9px;border-radius:8px;color:#765d38;background:#f4eee5;font-size:10px;font-weight:800}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.metrics article{display:grid;gap:5px;padding:13px 15px;border:1px solid var(--border);border-radius:11px;background:#fcfcfd}.metrics span,.metrics small{color:#98a2b3;font-size:10px}.metrics strong{font-size:18px}.card{border:1px solid var(--border);border-radius:13px;background:#fcfcfd;box-shadow:0 8px 24px rgba(24,32,51,.05);overflow:hidden}.card-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border);background:#f8f9fb}.card-head div{display:grid;gap:3px}.card-head strong{font-size:13px}.card-head span{color:#98a2b3;font-size:10px}.stage-pills{display:flex;gap:5px}.stage-pills i{width:26px;height:4px;border-radius:8px;background:#dfe4eb}.stage-pills i:first-child{background:var(--blue)}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:18px}label{display:grid;gap:6px;color:#344054;font-size:11px;font-weight:700}input,select{width:100%;height:40px;padding:0 11px;border:1px solid #cfd5de;border-radius:8px;color:#182033;font:12px inherit;background:#fff;outline:0;transition:border .16s,box-shadow .16s}input:focus,select:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(45,95,202,.14)}button[type=submit]{grid-column:1/-1;height:42px;margin-top:2px;border:0;border-radius:8px;color:#fff;background:var(--blue);font-weight:800;cursor:pointer;box-shadow:0 7px 18px rgba(45,95,202,.18)}.result{display:none;margin:0 18px 18px;padding:15px;border:1px solid rgba(22,138,99,.16);border-radius:10px;color:#087a55;background:#eaf7f2}.result.show{display:grid;grid-template-columns:auto 1fr;gap:10px}.result-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;color:#fff;background:#168a63;font-weight:900}.result strong{font-size:12px}.result p{margin:4px 0 0;color:#39725f;font-size:10px;line-height:1.55}.evidence{grid-column:1/-1;display:flex;gap:10px;padding-top:9px;border-top:1px solid rgba(22,138,99,.14);font-size:9px}.evidence span{padding:4px 6px;border-radius:5px;background:rgba(255,255,255,.62)}@media(max-width:760px){.layout{grid-template-columns:1fr}aside{display:none}.main{padding:18px}.metrics{grid-template-columns:1fr}.heading{display:grid}form{grid-template-columns:1fr}}
  </style></head><body><header class="top"><div class="brand"><span class="brand-mark">赛</span><div><strong>跨境电商赛训模拟平台</strong><small>LOCAL COMPETITION SANDBOX</small></div></div><div class="secure"><i></i>本地隔离会话 · 数据不外传</div></header><div class="layout"><aside><div class="workspace-label">${escapeHtml(scenario.section)}</div>${nav}<div class="aside-note">当前页面由本地执行器控制。登录、验证码与二次验证不会被自动绕过。</div></aside><main class="main"><div class="crumb">控制台 / ${escapeHtml(scenario.section)} / 自动化任务</div><div class="heading"><div><h1>${escapeHtml(script.name)}</h1><p>${escapeHtml(scenario.kicker)} · 提交后生成可核验的本地结果</p></div><span class="adapter">适配器 ${escapeHtml(script.version || '1.0.0')}</span></div><section class="metrics">${metrics}</section><section class="card"><div class="card-head"><div><strong>任务输入</strong><span>执行器将依次填写、提交并读取成功状态</span></div><span class="stage-pills"><i></i><i></i><i></i><i></i></span></div><form id="task-form">${fields.map(fieldHtml).join('')}<button id="submit-task" data-action="submit" type="submit">${escapeHtml(scenario.action)}</button></form><div id="result" class="result" data-status="idle"><span class="result-icon">✓</span><div><strong>操作成功</strong><p id="result-copy">${escapeHtml(scenario.result)}</p></div><div class="evidence"><span>页面状态：SUCCESS</span><span>字段核验：PASS</span><span>本地证据：已生成</span></div></div></section></main></div><script>
  const capability=${JSON.stringify(capabilityKey)};document.getElementById('task-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const result=document.getElementById('result');result.dataset.status='success';result.classList.add('show');document.querySelectorAll('.stage-pills i').forEach(item=>item.style.background='#168a63');const key=capability.includes('ship')?'order_id':capability.includes('listing')?'sku':capability.includes('logistics')?'country':'';const value=key&&form.elements[key]?form.elements[key].value:'';if(value)document.getElementById('result-copy').textContent+=(' · 业务标识：'+value);});
  </script></body></html>`;
}

function startSandboxServer(script: UnknownRecord): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const html = sandboxHtml(script);
    const server = http.createServer((request: import('http').IncomingMessage, response: import('http').ServerResponse) => {
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(html);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('无法启动本地模拟平台')); return; }
      resolve({ url: `http://127.0.0.1:${address.port}/automation-sandbox`, close: () => new Promise(done => server.close(() => done())) });
    });
  });
}

module.exports = { sandboxHtml, startSandboxServer };
