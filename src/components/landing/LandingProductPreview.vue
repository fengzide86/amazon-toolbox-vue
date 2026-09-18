<template>
  <section class="product-preview" aria-label="课赛通产品界面预览" data-testid="landing-product-preview">
    <div class="preview-switcher">
      <div class="preview-tabs" role="tablist" aria-label="选择产品界面">
        <button
          v-for="tab in tabs"
          :id="`product-preview-tab-${tab.key}`"
          :key="tab.key"
          ref="tabButtons"
          type="button"
          role="tab"
          :data-preview-tab="tab.key"
          :aria-selected="activeTab === tab.key"
          :aria-controls="`product-preview-panel-${tab.key}`"
          :tabindex="activeTab === tab.key ? 0 : -1"
          @click="activeTab = tab.key"
          @keydown="onTabKeydown($event, tab.key)"
        >
          <component :is="tab.icon" :size="15" aria-hidden="true" />
          {{ tab.label }}
        </button>
      </div>
      <span class="preview-caption"><span class="caption-dot" />可交互的界面示意</span>
    </div>

    <div class="preview-frame">
      <header class="preview-titlebar">
        <div class="window-dots" aria-hidden="true"><i /><i /><i /></div>
        <span>课赛通 KST <span class="title-divider">/</span> {{ activeTab === 'business' ? '专业批量工作台' : '个人效率工具箱' }}</span>
        <span class="titlebar-demo">产品预览</span>
      </header>

      <div class="preview-app">
        <aside class="preview-sidebar" aria-label="界面示意导航">
          <div class="preview-brand"><BrandMark :size="27" decorative /><strong>课赛通 <span>KST</span></strong></div>
          <p class="sidebar-label">{{ activeTab === 'business' ? '专业工作空间' : '个人工作空间' }}</p>
          <div class="sidebar-items" aria-hidden="true">
            <span v-for="item in navigation" :key="item.label" :class="{ selected: item.active }">
              <component :is="item.icon" :size="15" />{{ item.label }}
            </span>
          </div>
          <div class="sidebar-bottom"><span class="avatar">K</span><span>演示工作空间<small>仅展示产品界面</small></span></div>
        </aside>

        <div class="preview-content">
          <Transition name="preview-panel" mode="out-in">
            <section
              v-if="activeTab === 'business'"
              id="product-preview-panel-business"
              key="business"
              class="workspace-panel"
              role="tabpanel"
              aria-labelledby="product-preview-tab-business"
              tabindex="0"
            >
              <div class="workspace-heading">
                <div><span class="panel-overline">BATCH WORKSPACE</span><h3>物流模板 · 批量演示</h3><p>每个账号的进展，都在一张工作台里。</p></div>
                <span class="demo-badge"><span />演示批次</span>
              </div>

              <div class="batch-summary" aria-label="示意批次汇总：共 8 项，运行中 3 项，完成 4 项，需关注 1 项">
                <div><span>本批账号</span><strong>8<small>项</small></strong></div>
                <div><span><i class="metric-dot blue" />运行中</span><strong>3</strong></div>
                <div><span><i class="metric-dot green" />已完成</span><strong>4</strong></div>
                <div><span><i class="metric-dot amber" />需关注</span><strong>1</strong></div>
                <div class="summary-progress"><span>整体进度 <b>50%</b></span><span class="progress-track"><i style="width: 50%" /></span><small>4 / 8 项演示完成</small></div>
              </div>

              <div class="batch-workspace">
                <div class="account-table">
                  <div class="table-toolbar"><strong>账号任务</strong><span><Search :size="13" aria-hidden="true" />账号名称</span></div>
                  <div class="table-head" aria-hidden="true"><span>账号</span><span>状态</span><span>进度</span><span /></div>
                  <button
                    v-for="account in accounts"
                    :key="account.id"
                    type="button"
                    class="account-row"
                    :class="{ 'is-selected': selectedAccountId === account.id }"
                    :data-preview-account="account.id"
                    :aria-pressed="selectedAccountId === account.id"
                    :aria-label="`查看${account.name}的${account.status}示意详情`"
                    aria-controls="product-preview-account-detail"
                    @click="selectedAccountId = account.id"
                  >
                    <span class="account-name"><span class="account-avatar">{{ account.number }}</span><span>{{ account.name }}<small>{{ account.stage }}</small></span></span>
                    <span :class="['row-status', account.tone]"><component :is="account.icon" :size="12" aria-hidden="true" />{{ account.status }}</span>
                    <span class="row-progress"><span>{{ account.progress }}%</span><span class="progress-track"><i :style="{ width: `${account.progress}%` }" /></span></span>
                    <ChevronRight class="row-chevron" :size="14" aria-hidden="true" />
                  </button>
                  <div class="table-footer"><span>展示 3 / 8 个演示账号</span><span><MousePointer2 :size="12" aria-hidden="true" />点击账号查看详情</span></div>
                </div>

                <aside id="product-preview-account-detail" class="account-detail" aria-label="所选演示账号详情" aria-live="polite" data-testid="preview-account-detail">
                  <div class="detail-top"><span>账号详情</span><span class="sample-label">示意</span></div>
                  <Transition name="preview-detail" mode="out-in">
                    <div :key="selectedAccount.id" class="detail-body">
                      <div class="detail-account"><span class="account-avatar">{{ selectedAccount.number }}</span><div><strong>{{ selectedAccount.name }}</strong><span>{{ selectedAccount.status }}</span></div></div>
                      <ol class="detail-steps">
                        <li v-for="(step, index) in selectedAccount.steps" :key="step.label" :class="`step-${step.state}`"><span class="step-mark"><Check v-if="step.state === 'done'" :size="11" aria-hidden="true" /><span v-else>{{ index + 1 }}</span></span><span>{{ step.label }}</span></li>
                      </ol>
                      <div :class="['detail-note', selectedAccount.tone]"><component :is="selectedAccount.icon" :size="14" aria-hidden="true" /><p>{{ selectedAccount.note }}</p></div>
                      <span class="detail-readonly">界面示意 · 不会操作真实账号</span>
                    </div>
                  </Transition>
                </aside>
              </div>
            </section>

            <section
              v-else
              id="product-preview-panel-consumer"
              key="consumer"
              class="workspace-panel consumer-panel"
              role="tabpanel"
              aria-labelledby="product-preview-tab-consumer"
              tabindex="0"
            >
              <div class="workspace-heading"><div><span class="panel-overline">PERSONAL TOOLBOX</span><h3>选择工具，专注下一步。</h3><p>工具、执行记录与使用帮助，集中在一个工作空间。</p></div><span class="demo-badge"><span />界面示意</span></div>
              <div class="tool-filter"><span class="filter-active">全部工具</span><span>物流与配送</span><span class="tool-search"><Search :size="13" aria-hidden="true" />查找工具</span></div>
              <div class="tool-grid">
                <article v-for="tool in consumerTools" :key="tool.name" class="preview-tool">
                  <div class="tool-card-top"><span class="tool-icon"><component :is="tool.icon" :size="23" aria-hidden="true" /></span><span class="sample-label">流程演示</span></div>
                  <h4>{{ tool.name }}</h4><p>{{ tool.description }}</p>
                  <div class="tool-card-foot"><span>{{ tool.category }}</span><span>工具详情 <ArrowUpRight :size="14" aria-hidden="true" /></span></div>
                </article>
              </div>
              <div class="consumer-support"><span class="support-icon"><CircleHelp :size="18" aria-hidden="true" /></span><div><strong>遇到问题，不必离开工作空间。</strong><span>查看工具帮助，或通过客服提交使用问题。</span></div><span class="support-link">工具帮助 <ChevronRight :size="14" aria-hidden="true" /></span></div>
              <p class="consumer-boundary">演示用于了解流程；真实自动化仅在桌面端受控运行。</p>
            </section>
          </Transition>
        </div>
      </div>
      <footer class="preview-disclaimer"><span class="caption-dot" />产品界面与数据均为示意，不代表真实账号执行结果。<span class="disclaimer-tail">同一产品 · 两种工作方式</span></footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ArrowUpRight, Check, ChevronRight, CircleAlert, CircleCheck, CircleHelp, FileClock, KeyRound, Layers3, LayoutGrid, MousePointer2, Package, Search, Truck } from '@lucide/vue'
import BrandMark from '@/components/brand/BrandMark.vue'

type PreviewTab = 'consumer' | 'business'
type StepState = 'done' | 'current' | 'pending'
const activeTab = ref<PreviewTab>('business')
const tabButtons = ref<HTMLButtonElement[]>([])
const tabs = [
  { key: 'consumer' as const, label: '个人工具箱', icon: LayoutGrid },
  { key: 'business' as const, label: '批量工作台', icon: Layers3 },
]

async function onTabKeydown(event: KeyboardEvent, current: PreviewTab): Promise<void> {
  let next: PreviewTab
  if (event.key === 'Home') next = 'consumer'
  else if (event.key === 'End') next = 'business'
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = current === 'consumer' ? 'business' : 'consumer'
  else return
  event.preventDefault()
  activeTab.value = next
  await nextTick()
  tabButtons.value.find(button => button.dataset.previewTab === next)?.focus()
}

const navigation = computed(() => activeTab.value === 'business' ? [
  { label: '工作概览', icon: LayoutGrid, active: false },
  { label: '批量工作台', icon: Layers3, active: true },
  { label: '执行记录', icon: FileClock, active: false },
  { label: '授权与席位', icon: KeyRound, active: false },
] : [
  { label: '工具箱', icon: LayoutGrid, active: true },
  { label: '执行记录', icon: FileClock, active: false },
  { label: '套餐与授权', icon: KeyRound, active: false },
  { label: '工具帮助', icon: CircleHelp, active: false },
])

const accounts = [
  { id: 'demo-01', number: '01', name: '演示账号 01', status: '运行中', tone: 'blue', stage: '正在准备模板', progress: 62, icon: Layers3,
    steps: [{ label: '数据检查', state: 'done' }, { label: '模板准备', state: 'current' }, { label: '结果确认', state: 'pending' }] as { label: string; state: StepState }[], note: '展示当前账号的执行阶段与独立进度，仅供了解界面。' },
  { id: 'demo-02', number: '02', name: '演示账号 02', status: '已完成', tone: 'green', stage: '演示流程结束', progress: 100, icon: CircleCheck,
    steps: [{ label: '数据检查', state: 'done' }, { label: '模板准备', state: 'done' }, { label: '结果确认', state: 'done' }] as { label: string; state: StepState }[], note: '本项模拟流程已结束。此状态不是实际平台执行结果。' },
  { id: 'demo-03', number: '03', name: '演示账号 03', status: '需关注', tone: 'amber', stage: '等待用户确认', progress: 38, icon: CircleAlert,
    steps: [{ label: '数据检查', state: 'done' }, { label: '等待用户确认', state: 'current' }, { label: '结果确认', state: 'pending' }] as { label: string; state: StepState }[], note: '此处展示需关注状态；工作台可保留现场，等待用户确认。' },
 ] as const
const selectedAccountId = ref('demo-03')
const selectedAccount = computed(() => accounts.find(account => account.id === selectedAccountId.value) || accounts[0])
const consumerTools = [
  { name: '物流模板标准版', category: '物流与配送', description: '了解配送模板的填写、检查与保存流程。', icon: Truck },
  { name: '物流模板成本优选版', category: '物流与配送', description: '了解物流成本比较与方案选择流程。', icon: Package },
]
</script>

<style scoped>
.product-preview{width:100%;color:#18243b;font:inherit;text-align:left}.product-preview *{box-sizing:border-box}.preview-switcher{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:19px}.preview-tabs{display:inline-flex;gap:4px;padding:4px;border:1px solid #e4e8ee;border-radius:9px;background:#f7f9fc}.preview-tabs button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 19px;border:1px solid transparent;border-radius:6px;background:transparent;color:#768091;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:color 180ms,background 180ms,border-color 180ms}.preview-tabs button[aria-selected=true]{border-color:#e7ebf1;background:#fff;color:#18243b;box-shadow:0 1px 3px #18243b06}.preview-tabs button:hover{color:#1565ff}.preview-tabs button:focus-visible,.account-row:focus-visible,.workspace-panel:focus-visible{outline:2px solid #1565ff;outline-offset:3px}.preview-caption{display:flex;align-items:center;gap:7px;color:#7e8795;font-size:11px}.caption-dot{width:5px;height:5px;flex:none;border-radius:50%;background:#9ca7b8}.preview-frame{overflow:hidden;border:1px solid #dde3eb;border-radius:12px;background:#fff;box-shadow:0 28px 75px -36px #263b6a2e,0 4px 12px -7px #263b6a12}.preview-titlebar{height:40px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid #e9edf3;background:#fcfdff;color:#8590a0;font-size:10px}.window-dots{display:flex;gap:5px}.window-dots i{width:6px;height:6px;border-radius:50%;background:#d9dfe8}.title-divider{padding:0 8px;color:#c2c9d3}.titlebar-demo{justify-self:end;font-size:9px;letter-spacing:.08em}.preview-app{display:grid;grid-template-columns:174px minmax(0,1fr);min-height:486px}.preview-sidebar{display:flex;flex-direction:column;min-width:0;padding:22px 13px 18px;border-right:1px solid #e9edf3;background:#fbfcfe}.preview-brand{display:flex;align-items:center;gap:7px;padding:0 7px}.preview-brand strong{font-size:13px;font-weight:650;white-space:nowrap}.preview-brand strong>span{margin-left:2px;font-size:10px;font-weight:500;letter-spacing:.06em;color:#78849a}.sidebar-label{margin:32px 10px 12px;color:#97a0ae;font-size:9px;letter-spacing:.08em}.sidebar-items{display:grid;gap:6px}.sidebar-items>span{display:flex;align-items:center;gap:9px;min-height:35px;padding:0 11px;border-radius:5px;color:#768297;font-size:11px;white-space:nowrap}.sidebar-items>span.selected{color:#1565ff;background:#edf3ff;font-weight:600}.sidebar-bottom{display:flex;align-items:center;gap:8px;margin-top:auto;padding:32px 8px 0;font-size:10px;color:#59677c}.avatar{width:26px;height:26px;display:grid;place-items:center;border:1px solid #e2e8f0;border-radius:50%;background:#fff;font-size:11px;color:#73849f}.sidebar-bottom small{display:block;margin-top:3px;color:#98a2b1;font-size:8px}.preview-content{min-width:0;padding:27px 27px 22px}.workspace-panel{outline:none}.workspace-heading{display:flex;align-items:center;justify-content:space-between;gap:18px}.panel-overline{display:block;margin-bottom:8px;color:#97a2b1;font-size:8px;font-weight:600;letter-spacing:.17em}.workspace-heading h3{margin:0;font-size:18px;font-weight:600;letter-spacing:-.025em;line-height:1.5}.workspace-heading p{margin:6px 0 0;color:#8a94a5;font-size:10px;line-height:1.65}.demo-badge{display:inline-flex;align-items:center;gap:5px;flex:none;padding:5px 8px;border:1px solid #e3eaf5;border-radius:5px;color:#6681ad;font-size:9px}.demo-badge>span{width:4px;height:4px;border-radius:50%;background:#7194ce}.batch-summary{display:grid;grid-template-columns:repeat(4,1fr) 1.5fr;align-items:center;gap:12px;margin:23px 0 22px;padding:17px 0;border-top:1px solid #e9edf3;border-bottom:1px solid #e9edf3}.batch-summary>div{min-width:0}.batch-summary>div>span{display:flex;align-items:center;gap:5px;color:#8b95a5;font-size:9px;white-space:nowrap}.batch-summary strong{display:block;margin-top:5px;color:#28374e;font-size:24px;line-height:1.25;font-weight:500;letter-spacing:-.05em;font-variant-numeric:tabular-nums}.batch-summary strong small{margin-left:5px;font-size:9px;font-weight:400;letter-spacing:0;color:#9ca5b2}.metric-dot{width:4px;height:4px;border-radius:50%}.metric-dot.blue{background:#6393ee}.metric-dot.green{background:#72a999}.metric-dot.amber{background:#d2ad70}.summary-progress{padding-left:15px;border-left:1px solid #e9edf3}.summary-progress>span:first-child{justify-content:space-between}.summary-progress b{color:#5d6f8c;font-size:10px;font-weight:500}.progress-track{display:block;overflow:hidden;height:3px;border-radius:10px;background:#edf1f7}.progress-track i{display:block;height:100%;border-radius:inherit;background:#6393ed;transition:width 240ms ease}.summary-progress .progress-track{margin:9px 0 7px}.summary-progress small{color:#a3aab6;font-size:8px}.batch-workspace{display:grid;grid-template-columns:minmax(0,1fr) 204px;gap:20px}.account-table{min-width:0}.table-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.table-toolbar strong{font-size:11px;font-weight:600}.table-toolbar>span{display:flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid #e9edf3;border-radius:5px;color:#a0a9b7;font-size:8px}.table-head,.account-row{display:grid;grid-template-columns:minmax(124px,1.5fr) 64px minmax(35px,.7fr) 14px;align-items:center;gap:9px}.table-head{padding:7px 9px;border-bottom:1px solid #e9edf3;color:#9da6b4;font-size:8px}.account-row{width:100%;min-height:65px;padding:10px 9px;border:0;border-bottom:1px solid #edf0f5;background:transparent;text-align:left;color:inherit;font:inherit;cursor:pointer;transition:background 180ms}.account-row:hover{background:#f7f9fc}.account-row.is-selected{background:#f3f7ff}.account-name{display:flex;align-items:center;gap:8px;min-width:0;color:#56667e;font-size:10px;font-weight:500;white-space:nowrap}.account-avatar{width:25px;height:28px;display:grid;place-items:center;flex:none;border:1px solid #e4eaf3;border-radius:5px;background:#fbfcff;color:#8c9ab1;font-size:9px;font-variant-numeric:tabular-nums}.account-name small{display:block;margin-top:5px;color:#a0a9b7;font-size:8px;font-weight:400}.row-status{display:flex;align-items:center;gap:4px;white-space:nowrap;font-size:9px}.row-status.blue{color:#6487c8}.row-status.green{color:#6b9989}.row-status.amber{color:#bd9860}.row-progress{min-width:0;color:#929eaf;font-size:8px;font-variant-numeric:tabular-nums}.row-progress>.progress-track{margin-top:6px;height:2px}.row-chevron{color:#a5b3c8}.account-row.is-selected .row-chevron{color:#608ada}.table-footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:12px;color:#a2abb9;font-size:8px}.table-footer>span:last-child{display:flex;align-items:center;gap:4px}.account-detail{min-width:0;border:1px solid #e6ebf3;border-radius:7px;background:#fcfdff}.detail-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:35px;padding:0 13px;border-bottom:1px solid #e9edf3;color:#7a879a;font-size:9px}.sample-label{padding:3px 5px;border:1px solid #e6ebf3;border-radius:4px;color:#96a0af;font-size:8px;font-weight:400;white-space:nowrap}.detail-body{padding:13px}.detail-account{display:flex;align-items:center;gap:8px}.detail-account strong{display:block;font-size:10px;font-weight:600}.detail-account>div>span{display:block;margin-top:4px;color:#98a2b2;font-size:8px}.detail-steps{display:grid;gap:13px;list-style:none;margin:18px 0;padding:0}.detail-steps li{position:relative;display:flex;align-items:center;gap:8px;font-size:9px;color:#a3adbc}.detail-steps li:not(:last-child)::after{position:absolute;top:18px;left:7px;content:'';width:1px;height:12px;background:#e4eaf4}.step-mark{display:grid;place-items:center;flex:none;width:16px;height:16px;border:1px solid #e1e7f0;border-radius:50%;font-size:7px}.step-done .step-mark{color:#729b8f;border-color:#dceae4;background:#f3f8f5}.detail-steps .step-done{color:#80928e}.step-current .step-mark{color:#7193cd;border-color:#cbdcf8;background:#f0f5ff}.detail-steps .step-current{color:#6b85af}.detail-note{display:flex;align-items:flex-start;gap:6px;padding:8px;border:1px solid #e8edf5;border-radius:5px;background:#f7f9fd;color:#8b9bb2}.detail-note>svg{flex:none;margin-top:1px}.detail-note.amber{border-color:#f0e7d6;background:#fdfbf7;color:#b3a085}.detail-note.green{border-color:#e1ece5;background:#f8fbf9;color:#849f91}.detail-note p{margin:0;font-size:8px;line-height:1.75}.detail-readonly{display:block;margin-top:10px;text-align:center;color:#aeb6c2;font-size:7px}.consumer-panel{min-height:436px}.tool-filter{display:flex;align-items:center;gap:21px;margin:27px 0 21px;padding-bottom:12px;border-bottom:1px solid #e9edf3;font-size:10px;color:#a0a9b6}.tool-filter>.filter-active{color:#5f7fb3;font-weight:600}.tool-search{display:flex;align-items:center;gap:6px;margin-left:auto;color:#adb5c0}.tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:17px}.preview-tool{padding:19px;border:1px solid #e4eaf3;border-radius:8px;background:#fff}.tool-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.tool-icon{display:grid;place-items:center;width:43px;height:43px;border:1px solid #e4edfd;border-radius:9px;background:#f4f8ff;color:#779bdd}.preview-tool h4{margin:18px 0 9px;font-size:13px;font-weight:600}.preview-tool p{margin:0;color:#95a0b0;font-size:10px;line-height:1.8}.tool-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:27px;padding-top:12px;border-top:1px solid #edf0f5;color:#a3adbb;font-size:8px}.tool-card-foot>span:last-child{display:flex;align-items:center;gap:4px;color:#7592bf}.consumer-support{display:flex;align-items:center;gap:11px;margin-top:19px;padding:13px 14px;border:1px solid #e8edf4;border-radius:6px;background:#fcfdff}.support-icon{display:grid;place-items:center;color:#92a5c1}.consumer-support strong{display:block;font-size:10px;font-weight:500;color:#76869d}.consumer-support>div>span{display:block;margin-top:4px;color:#a5aebb;font-size:8px}.support-link{display:flex;align-items:center;gap:4px;margin-left:auto;white-space:nowrap;color:#839bbf;font-size:9px}.consumer-boundary{margin:14px 0 0;color:#aab2bf;font-size:8px}.preview-disclaimer{display:flex;align-items:center;gap:7px;min-height:36px;padding:10px 18px;border-top:1px solid #e9edf3;color:#9ca6b5;font-size:9px;line-height:1.6}.disclaimer-tail{margin-left:auto;white-space:nowrap;color:#aeb6c2}.preview-panel-enter-active,.preview-panel-leave-active,.preview-detail-enter-active,.preview-detail-leave-active{transition:opacity 180ms ease,transform 180ms ease}.preview-panel-enter-from,.preview-panel-leave-to,.preview-detail-enter-from,.preview-detail-leave-to{opacity:0;transform:translateY(3px)}
@media(min-width:1100px){.preview-content{padding:29px 30px 25px}.workspace-heading h3{font-size:20px}.account-name{font-size:11px}.batch-workspace{grid-template-columns:minmax(0,1fr) 215px;gap:23px}.detail-note p{font-size:9px}.detail-steps li{font-size:10px}.detail-account strong{font-size:11px}.account-row{min-height:67px}}
@media(max-width:980px){.preview-app{grid-template-columns:145px minmax(0,1fr)}.preview-sidebar{padding-right:9px;padding-left:9px}.preview-brand strong{font-size:11px}.preview-brand strong>span{font-size:8px}.preview-content{padding:22px 18px}.batch-workspace{grid-template-columns:minmax(0,1fr)}.batch-summary{gap:10px}.table-head,.account-row{grid-template-columns:minmax(140px,1.5fr) 80px minmax(50px,.6fr) 14px}.preview-app{min-height:455px}}
@media(max-width:699px){.preview-switcher{justify-content:center;margin-bottom:15px}.preview-caption{display:none}.preview-tabs{width:100%;max-width:350px}.preview-tabs button{flex:1;min-height:42px;padding:0 11px;font-size:12px}.preview-titlebar{height:35px;padding:0 12px;grid-template-columns:auto 1fr;font-size:9px}.window-dots{gap:4px}.window-dots i{width:5px;height:5px}.titlebar-demo{display:none}.preview-titlebar>span:nth-child(2){text-align:center}.preview-app{display:block;min-height:0}.preview-sidebar{display:none}.preview-content{padding:23px 16px 18px}.workspace-heading{gap:10px;align-items:flex-start}.panel-overline{font-size:8px}.workspace-heading h3{font-size:17px}.workspace-heading p{font-size:11px;line-height:1.8;max-width:210px}.demo-badge{margin-top:22px;font-size:8px;padding:4px 5px}.batch-summary{grid-template-columns:repeat(4,1fr);gap:14px 9px;margin:21px 0;padding:14px 0}.batch-summary>div>span{font-size:10px}.batch-summary strong{font-size:24px}.summary-progress{grid-column:1/-1;padding:10px 0 0;border-left:0;border-top:1px solid #edf0f5}.summary-progress small{font-size:9px}.summary-progress .progress-track{height:3px}.table-toolbar{margin-bottom:9px}.table-toolbar strong{font-size:12px}.table-toolbar>span{font-size:9px}.table-head,.account-row{grid-template-columns:minmax(112px,1fr) 64px 39px 10px;gap:6px}.table-head{padding-right:3px;padding-left:3px;font-size:9px}.account-row{min-height:70px;padding-right:3px;padding-left:3px}.account-name{gap:6px;font-size:10px}.account-name small{font-size:9px}.account-avatar{width:23px;font-size:9px}.row-status{gap:3px;font-size:9px}.row-status svg{width:10px}.row-progress{font-size:9px}.row-chevron{width:10px}.table-footer{font-size:9px;line-height:1.7}.account-detail{display:block;margin-top:3px}.detail-top{min-height:39px;font-size:11px}.sample-label{font-size:9px}.detail-body{padding:14px}.detail-account strong{font-size:12px}.detail-account>div>span{font-size:10px}.detail-steps{grid-template-columns:1fr;gap:15px;margin:18px 0}.detail-steps li{font-size:11px}.detail-steps li:not(:last-child)::after{height:15px}.step-mark{width:17px;height:17px;font-size:8px}.detail-note{padding:10px;gap:8px}.detail-note p{font-size:11px}.detail-readonly{font-size:9px}.preview-disclaimer{align-items:flex-start;padding:12px;font-size:10px}.preview-disclaimer>.caption-dot{margin-top:5px}.disclaimer-tail{display:none}.consumer-panel{min-height:0}.tool-filter{gap:16px;font-size:11px;margin-top:23px}.tool-search{font-size:0;gap:0}.tool-search svg{width:15px;height:15px}.tool-grid{grid-template-columns:1fr;gap:13px}.preview-tool{padding:17px}.preview-tool h4{font-size:15px}.preview-tool p{font-size:12px}.tool-card-foot{font-size:10px;margin-top:22px}.consumer-support{align-items:flex-start;gap:9px}.consumer-support strong{font-size:11px;line-height:1.6}.consumer-support>div>span{font-size:10px;line-height:1.8}.support-link{display:none}.consumer-boundary{font-size:10px;line-height:1.8}}
@media(prefers-reduced-motion:reduce){.product-preview *,.product-preview *::before,.product-preview *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
.preview-disclaimer, .detail-readonly, .consumer-boundary { color: #6b7a90; }
@media (min-width: 700px) {
  .workspace-heading p, .preview-tool p { color: #687b94; font-size: 12px; }
  .account-name small, .table-footer, .detail-note p { color: #6b7a90; font-size: 10px; }
  .detail-steps li, .consumer-support strong { font-size: 11px; }
  .preview-disclaimer, .consumer-boundary, .tool-card-foot { font-size: 10px; }
  .consumer-support > div > span { color: #748399; font-size: 10px; }
}
</style>
