<template>
  <div :class="['batch-workspace', { 'has-batch': store.isActive || store.snapshot.status === 'completed' }]">
    <template v-if="!store.isActive && store.snapshot.status !== 'completed'">
      <section v-if="!store.bootstrap" class="workspace-loading-state">
        <span><LoaderCircle :size="24" class="spin" /></span>
        <strong>正在准备专业工作台</strong>
      </section>

      <section v-else-if="!store.tools.length" class="workspace-ready-empty">
        <div class="ready-brand"><span>BUSINESS WORKSPACE</span><strong>专业工作台</strong></div>
        <div class="ready-symbol"><Boxes :size="30" /></div>
        <h1>当前还没有开放的批量工具</h1>
        <p>前端、授权和本地浏览器能力已经准备好。业务工具会根据实际脚本能力逐个接入。</p>
        <div class="ready-flow" aria-label="未来批量处理方式">
          <article><FileSpreadsheet :size="19" /><div><strong>本地导入</strong><span>客户表格只在本机解析</span></div></article>
          <i></i>
          <article><Layers3 :size="19" /><div><strong>独立现场</strong><span>每个账号使用独立浏览器</span></div></article>
          <i></i>
          <article><CircleAlert :size="19" /><div><strong>需要时提醒</strong><span>登录和验证时再操作</span></div></article>
        </div>
        <div class="ready-actions">
          <button type="button" :disabled="store.loading" @click="refreshTools">
            <LoaderCircle v-if="store.loading" :size="16" class="spin" />
            <RefreshCw v-else :size="16" />
            刷新可用工具
          </button>
          <router-link to="/business/license">查看授权信息</router-link>
        </div>
        <small class="ready-note"><ShieldCheck :size="14" />没有真实脚本支持的功能不会出现在这里</small>
      </section>

      <section v-else class="batch-setup">
        <header class="setup-header">
          <div><span>NEW BATCH</span><h1>建立一个批量任务</h1><p>选择工具并导入客户数据。账号登录会在各自独立的浏览器现场中完成。</p></div>
          <div class="privacy-mark"><ShieldCheck :size="16" />数据只在本机解析</div>
        </header>

        <div class="setup-section">
          <div class="section-number">01</div>
          <div class="section-copy"><strong>选择批量工具</strong><span>这里只显示后台明确开放批量能力的工具</span></div>
          <div class="business-tools">
            <button v-for="tool in store.tools" :key="tool.id" :class="{ selected: store.selectedTool?.id === tool.id }" @click="store.chooseTool(tool)">
              <span class="tool-icon"><Boxes :size="19" /></span>
              <span><strong>{{ tool.name }}</strong><small>{{ tool.business_description || tool.description }}</small></span>
              <Check v-if="store.selectedTool?.id === tool.id" :size="17" />
            </button>
            <div v-if="!store.tools.length" class="no-tools">当前授权暂无已开放的批量工具，请联系管理员配置。</div>
          </div>
        </div>

        <div class="setup-section" :class="{ disabled: !store.selectedTool }">
          <div class="section-number">02</div>
          <div class="section-copy"><strong>导入客户数据</strong><span>支持 .xlsx 和 .csv，不支持密码、公式和宏</span></div>
          <div class="import-zone">
            <button class="import-button" :disabled="!store.selectedTool || store.loading" @click="chooseFile">
              <FileSpreadsheet :size="20" />
              <span><strong>{{ store.importPreview?.fileName || '选择 Excel 或 CSV 文件' }}</strong><small>最多 {{ store.entitlements.max_batch_rows || 50 }} 个有效账号</small></span>
              <Upload :size="16" />
            </button>
            <div v-if="store.importPreview" class="import-result">
              <span class="valid"><CheckCircle2 :size="15" />{{ store.importPreview.validCount }} 行可执行</span>
              <span v-if="store.importPreview.errorCount" class="invalid"><CircleAlert :size="15" />{{ store.importPreview.errorCount }} 行需要修正</span>
            </div>
            <div v-if="store.importPreview?.rows?.length" class="preview-list">
              <div v-for="row in store.importPreview.rows.slice(0, 6)" :key="row.itemId">
                <span>{{ row.preview.account_label }}</span><small>已通过字段检查</small>
              </div>
              <div v-if="store.importPreview.validCount > 6" class="more-row">还有 {{ store.importPreview.validCount - 6 }} 行未展开</div>
            </div>
            <div v-if="store.importPreview?.errors?.length" class="error-list">
              <div v-for="problem in store.importPreview.errors.slice(0, 4)" :key="problem.rowNumber">第 {{ problem.rowNumber }} 行：{{ problem.message }}</div>
              <button type="button" @click="exportErrors">导出问题清单</button>
            </div>
          </div>
        </div>

        <footer class="setup-footer">
          <div><strong>执行方式</strong><span>系统按顺序处理；需要人工操作的账号会保留现场并让后续账号继续。</span></div>
          <button :disabled="!store.importPreview?.validCount || store.loading" @click="beginBatch">
            <LoaderCircle v-if="store.loading" :size="16" class="spin" /><Play v-else :size="16" />开始批量处理
          </button>
        </footer>
      </section>
    </template>

    <template v-else>
      <header class="workspace-header">
        <div class="batch-identity"><span class="professional-badge">BUSINESS</span><div><strong>{{ store.snapshot.tool?.name }}</strong><small>{{ store.snapshot.counts?.total || 0 }} 个账号</small></div></div>
        <div class="batch-counts">
          <span><small>已处理</small><strong>{{ processedCount }}</strong></span>
          <span><small>正在处理</small><strong>{{ store.snapshot.counts?.running || 0 }}</strong></span>
          <span :class="{ attention: store.snapshot.counts?.waiting }"><small>需要操作</small><strong>{{ store.snapshot.counts?.waiting || 0 }}</strong></span>
        </div>
        <div class="header-actions">
          <span :class="['sync-state', `is-${store.syncState}`]">{{ syncText }}</span>
          <button v-if="store.isActive" @click="endBatch"><Square :size="14" />结束批次</button>
          <button v-else @click="newBatch"><Plus :size="14" />新建批次</button>
        </div>
      </header>

      <div class="workspace-grid">
        <aside :class="['account-queue', { 'mobile-open': queueOpen }]">
          <header><div><strong>账号队列</strong><small>系统会自动继续</small></div><button class="mobile-close" @click="queueOpen=false"><X :size="16" /></button></header>
          <div class="queue-list">
            <button v-for="item in store.items" :key="item.itemId" :class="['queue-item', `is-${item.status}`, { selected: store.selectedItemId === item.itemId }]" @click="store.selectItem(item.itemId)">
              <span class="queue-state">
                <LoaderCircle v-if="item.status === 'running'" :size="15" class="spin" />
                <CircleAlert v-else-if="item.status === 'waiting_user' || item.status === 'failed'" :size="15" />
                <Check v-else-if="item.status === 'completed'" :size="15" />
                <span v-else></span>
              </span>
              <span class="queue-copy"><strong>{{ item.accountLabelMasked }}</strong><small>{{ store.statusText(item.status) }}</small></span>
              <ChevronRight :size="14" />
            </button>
          </div>
        </aside>

        <main class="browser-stage">
          <div class="mobile-toolbar"><button @click="queueOpen=true"><List :size="16" />账号队列</button><span>{{ store.selectedItem?.accountLabelMasked }}</span><button @click="actionOpen=true"><PanelRight :size="16" />状态</button></div>
          <div class="browser-shell">
            <div class="browser-toolbar"><span class="traffic"><i></i><i></i><i></i></span><LockKeyhole :size="13" /><span>{{ displayUrl }}</span><small>{{ store.selectedItem?.accountLabelMasked || '选择一个账号' }}</small></div>
            <div class="browser-viewport">
              <template v-if="isElectron">
                <webview
                  v-for="item in store.openItems"
                  :key="item.itemId"
                  v-show="store.selectedItemId === item.itemId"
                  :src="targetUrl"
                  :partition="partitionFor(item.itemId)"
                  class="batch-webview"
                  @dom-ready="registerBrowser(item, $event)"
                ></webview>
              </template>
              <div v-else class="desktop-required"><MonitorUp :size="36" /><strong>请在桌面客户端使用批量工作台</strong><span>多账号浏览器隔离依赖本机 Electron 环境。</span></div>
              <div v-if="store.selectedItem && !store.selectedItem.browserReady && store.selectedItem.itemId !== store.snapshot.provisioningItemId" class="browser-placeholder">
                <Layers3 :size="34" /><strong>{{ store.statusText(store.selectedItem.status) }}</strong><span>轮到该账号时，系统会在这里打开独立浏览器。</span>
              </div>
              <div v-if="store.selectedItem?.status === 'running'" class="automation-shield"><LoaderCircle :size="15" class="spin" />正在自动处理，请不要操作这个页面</div>
            </div>
          </div>
        </main>

        <aside :class="['action-panel', { 'mobile-open': actionOpen }]">
          <header><div><span>当前账号</span><strong>{{ store.selectedItem?.accountLabelMasked || '未选择' }}</strong></div><button class="mobile-close" @click="actionOpen=false"><X :size="16" /></button></header>
          <template v-if="store.selectedItem">
            <div :class="['status-hero', `is-${store.selectedItem.status}`]">
              <div class="status-symbol"><LoaderCircle v-if="store.selectedItem.status === 'running'" :size="22" class="spin"/><CircleAlert v-else-if="['waiting_user','failed'].includes(store.selectedItem.status)" :size="22"/><Check v-else-if="store.selectedItem.status === 'completed'" :size="22"/><Clock3 v-else :size="22"/></div>
              <span>{{ store.statusText(store.selectedItem.status) }}</span>
              <p>{{ actionDescription }}</p>
            </div>
            <div class="business-stage"><span>业务阶段</span><div><i :class="{done: stageIndex>0,active:stageIndex===0}"></i><i :class="{done:stageIndex>1,active:stageIndex===1}"></i><i :class="{done:stageIndex>2,active:stageIndex===2}"></i><i :class="{done:stageIndex>3,active:stageIndex===3}"></i></div><small>准备 · 执行 · 核验 · 完成</small></div>
            <button v-if="store.selectedItem.status === 'waiting_user'" class="primary-action warning" @click="completeAction">我已完成，继续处理</button>
            <button v-else-if="store.selectedItem.status === 'failed'" class="primary-action" @click="restartItem">重新发起此账号</button>
            <div class="security-note"><ShieldCheck :size="15" /><span>该浏览器只属于当前账号，不会与其他账号共享登录状态。</span></div>
          </template>
        </aside>
      </div>
      <div v-if="queueOpen || actionOpen" class="mobile-overlay" @click="queueOpen=false;actionOpen=false"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Boxes, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, FileSpreadsheet, Layers3, List, LoaderCircle, LockKeyhole, MonitorUp, PanelRight, Play, Plus, RefreshCw, ShieldCheck, Square, Upload, X } from '@lucide/vue'
import { showToast } from '@/utils'
import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'
import type { BatchItem } from '@/features/business/model'

interface EmbeddedWebviewElement extends HTMLElement {
  getWebContentsId?: () => number
}

const store = useBusinessWorkspaceStore()
const queueOpen = ref(false)
const actionOpen = ref(false)
const registered = new Set<string>()
const syncLabels: Record<string, string> = { synced: '状态已同步', syncing: '正在同步', offline: '本地继续处理中' }

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error && error.message ? error.message : fallback
const isElectron = computed(() => Boolean(window.electronAPI?.batch))
const processedCount = computed(() => (store.snapshot.counts.completed || 0) + (store.snapshot.counts.failed || 0))
const targetUrl = computed(() => store.snapshot.tool?.target_url || store.snapshot.tool?.targetUrl || 'https://sellercentral.amazon.com/')
const displayUrl = computed(() => { try { return new URL(targetUrl.value).host } catch { return targetUrl.value } })
const syncText = computed(() => syncLabels[store.syncState] || '')
const actionDescription = computed(() => {
  const item = store.selectedItem
  if (!item) return ''
  if (item.status === 'waiting_user') return item.message || '请在左侧页面完成提示的操作'
  if (item.status === 'running') return '脚本正在自动处理当前账号'
  if (item.status === 'completed') return '这个账号已经处理完成'
  if (item.status === 'failed') return item.message || '本次处理未完成，可以查看页面后重新发起'
  return '系统会在轮到该账号时自动开始'
})
const stageIndex = computed<number>(() => store.selectedItem?.status === 'completed' ? 4 : store.selectedItem?.status === 'running' || store.selectedItem?.status === 'waiting_user' ? 1 : 0)
const partitionFor = (id: string): string => `batch-${String(store.snapshot.batchId || 'draft').replace(/[^a-zA-Z0-9_-]/g, '_')}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`

async function chooseFile() { try { await store.selectImportFile() } catch (error) { showToast(errorMessage(error, '导入失败'), 'error') } }
async function refreshTools() {
  try {
    await store.refreshBootstrap()
    showToast(store.tools.length ? '已发现可用工具' : '暂时没有新开放的批量工具', store.tools.length ? 'success' : 'info')
  } catch (error) {
    showToast(errorMessage(error, '刷新失败'), 'error')
  }
}
async function exportErrors() { try { const result = await store.exportImportErrors(); if (result) showToast('问题清单已导出', 'success') } catch (error) { showToast(errorMessage(error, '导出失败'), 'error') } }
async function beginBatch() { try { await store.startBatch() } catch (error) { showToast(errorMessage(error, '无法开始批次'), 'error') } }
async function registerBrowser(item: BatchItem, event: Event) {
  if (registered.has(item.itemId)) return
  const view = event.currentTarget as EmbeddedWebviewElement | null
  if (!view?.getWebContentsId) return
  registered.add(item.itemId)
  try { await store.registerBrowser(item.itemId, view.getWebContentsId()) }
  catch (error) { registered.delete(item.itemId); showToast(errorMessage(error, '浏览器准备失败'), 'error') }
}
async function completeAction() {
  const itemId = store.selectedItemId
  if (!itemId) return
  try { await store.completeUserAction(itemId); actionOpen.value = false }
  catch (error) { showToast(errorMessage(error, '无法继续'), 'error') }
}
async function restartItem() {
  const itemId = store.selectedItemId
  if (!itemId) return
  try { registered.delete(itemId); await store.restartItem(itemId) }
  catch (error) { showToast(errorMessage(error, '无法重新发起'), 'error') }
}
async function endBatch() {
  try {
    await ElMessageBox.confirm('结束后会关闭所有客户浏览器并清理本机导入数据，不能从通用检查点继续。', '结束当前批次？', { confirmButtonText: '结束批次', cancelButtonText: '继续使用', type: 'warning' })
    await store.cancelBatch('cancelled')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') showToast(errorMessage(error, '结束失败'), 'error')
  }
}
async function newBatch() { try { registered.clear(); await store.resetWorkspace() } catch (error) { showToast(errorMessage(error, '暂时不能新建批次'), 'error') } }
onMounted(() => { void store.init() })
</script>

<style scoped>
.batch-workspace{height:100%;min-height:0}.workspace-loading-state,.workspace-ready-empty{width:min(900px,100%);min-height:560px;margin:0 auto;display:grid;place-content:center;justify-items:center;text-align:center;border:1px solid var(--color-border);border-radius:20px;background:var(--color-surface);box-shadow:var(--shadow-medium)}.workspace-loading-state{gap:12px;color:var(--color-text-secondary)}.workspace-loading-state>span{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;color:var(--color-primary);background:var(--color-primary-soft)}.workspace-loading-state strong{font-size:var(--type-card);color:var(--color-text)}.workspace-ready-empty{position:relative;overflow:hidden;padding:48px 42px}.workspace-ready-empty::before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--color-primary),#7799df,var(--color-premium))}.ready-brand{display:grid;gap:5px}.ready-brand span{font-size:var(--type-micro);font-weight:800;letter-spacing:.13em;color:var(--color-premium)}.ready-brand strong{font-size:var(--type-meta);color:var(--color-text-secondary)}.ready-symbol{width:64px;height:64px;display:grid;place-items:center;margin:20px 0 15px;border-radius:20px;color:var(--color-primary);background:var(--color-primary-soft);box-shadow:0 16px 36px rgba(45,95,202,.12)}.workspace-ready-empty h1{margin:0;color:var(--color-text);font-size:26px;letter-spacing:-.035em}.workspace-ready-empty>p{max-width:620px;margin:10px 0 28px;color:var(--color-text-secondary);font-size:var(--type-control);line-height:1.7}.ready-flow{width:100%;display:grid;grid-template-columns:1fr 32px 1fr 32px 1fr;align-items:center;gap:7px}.ready-flow article{min-height:96px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:11px;padding:15px;text-align:left;border:1px solid var(--color-border);border-radius:13px;background:var(--color-surface-soft)}.ready-flow article>svg{color:var(--color-primary)}.ready-flow article>div{display:grid;gap:4px}.ready-flow strong{font-size:var(--type-control);color:var(--color-text)}.ready-flow span{font-size:var(--type-meta);line-height:1.45;color:var(--color-text-tertiary)}.ready-flow>i{height:1px;background:var(--color-border);position:relative}.ready-flow>i::after{content:'';position:absolute;right:0;top:-3px;border-left:5px solid var(--color-border-strong);border-top:3px solid transparent;border-bottom:3px solid transparent}.ready-actions{display:flex;gap:9px;margin-top:24px}.ready-actions button,.ready-actions a{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 15px;border-radius:10px;font-size:var(--type-control);font-weight:700;text-decoration:none;cursor:pointer}.ready-actions button{border:0;color:#fff;background:var(--color-primary)}.ready-actions button:disabled{opacity:.55;cursor:not-allowed}.ready-actions a{border:1px solid var(--color-border);color:var(--color-text);background:var(--color-surface)}.ready-note{display:flex;align-items:center;gap:6px;margin-top:18px;color:var(--color-success);font-size:var(--type-meta)}.batch-setup{width:min(1060px,100%);margin:0 auto 30px;display:grid;border:1px solid var(--color-border);border-radius:18px;background:var(--color-surface);box-shadow:var(--shadow-medium);overflow:hidden}.setup-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:28px 30px;border-bottom:1px solid var(--color-border);background:linear-gradient(135deg,#fcfcfd,#f8f7f4)}.setup-header>div:first-child>span{font-size:var(--type-micro);font-weight:800;letter-spacing:.13em;color:var(--color-primary)}.setup-header h1{margin:7px 0 0;font-size:27px;letter-spacing:-.04em;color:var(--color-text)}.setup-header p{margin:8px 0 0;color:var(--color-text-secondary);font-size:var(--type-control)}.privacy-mark{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:9px;color:var(--color-success);background:#edf8f4;font-size:var(--type-meta);font-weight:700;white-space:nowrap}.setup-section{display:grid;grid-template-columns:38px 190px 1fr;gap:15px;padding:24px 30px;border-bottom:1px solid var(--color-border)}.setup-section.disabled{opacity:.55}.section-number{font:700 var(--type-micro)/1 var(--font-mono,monospace);color:var(--color-primary);padding-top:4px}.section-copy{display:grid;align-content:start;gap:5px}.section-copy strong{font-size:var(--type-control);color:var(--color-text)}.section-copy span{font-size:var(--type-meta);line-height:1.55;color:var(--color-text-tertiary)}.business-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.business-tools button{min-height:76px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:13px;text-align:left;border:1px solid var(--color-border);border-radius:13px;background:var(--color-surface);cursor:pointer;transition:border var(--motion-fast),box-shadow var(--motion-fast),transform var(--motion-press)}.business-tools button:hover{border-color:var(--color-border-strong);box-shadow:var(--shadow-low)}.business-tools button:active{transform:scale(.99)}.business-tools button.selected{border-color:rgba(45,95,202,.45);background:var(--color-primary-soft)}.tool-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;color:var(--color-primary);background:var(--color-primary-soft)}.business-tools button>span:nth-child(2){display:grid;gap:4px}.business-tools strong{font-size:var(--type-control);color:var(--color-text)}.business-tools small{font-size:var(--type-meta);line-height:1.4;color:var(--color-text-tertiary)}.business-tools button>svg{color:var(--color-primary)}.no-tools{grid-column:1/-1;padding:24px;border:1px dashed var(--color-border);border-radius:12px;text-align:center;color:var(--color-text-secondary);font-size:var(--type-meta)}.import-zone{display:grid;gap:10px}.import-button{min-height:68px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:12px 15px;border:1px dashed var(--color-border-strong);border-radius:13px;background:var(--color-surface-soft);text-align:left;cursor:pointer}.import-button:disabled{cursor:not-allowed}.import-button>svg{color:var(--color-primary)}.import-button span{display:grid;gap:3px}.import-button strong{font-size:var(--type-control);color:var(--color-text)}.import-button small{font-size:var(--type-meta);color:var(--color-text-tertiary)}.import-result{display:flex;gap:12px}.import-result span{display:flex;align-items:center;gap:5px;font-size:var(--type-meta);font-weight:700}.valid{color:var(--color-success)}.invalid{color:var(--color-warning)}.preview-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.preview-list>div{display:flex;justify-content:space-between;padding:8px 10px;border-radius:8px;background:var(--color-surface-soft);font-size:var(--type-meta);color:var(--color-text-secondary)}.preview-list small{color:var(--color-text-tertiary)}.preview-list .more-row{grid-column:1/-1;justify-content:center}.error-list{display:grid;gap:4px;padding:10px;border-radius:9px;color:var(--color-danger);background:#fff2f3;font-size:var(--type-meta)}.setup-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 30px;background:var(--color-surface-soft)}.setup-footer>div{display:grid;gap:4px}.setup-footer strong{font-size:var(--type-control);color:var(--color-text)}.setup-footer span{font-size:var(--type-meta);color:var(--color-text-tertiary)}.setup-footer button{height:42px;display:flex;align-items:center;gap:8px;padding:0 18px;border:0;border-radius:11px;color:#fff;background:var(--color-primary);font-size:var(--type-control);font-weight:700;cursor:pointer;box-shadow:0 8px 18px rgba(45,95,202,.18)}.setup-footer button:disabled{opacity:.45;cursor:not-allowed}
.has-batch{display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px}.workspace-header{min-height:58px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;padding:0 15px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);box-shadow:var(--shadow-low)}.batch-identity{display:flex;align-items:center;gap:10px}.professional-badge{padding:5px 7px;border-radius:6px;color:#765d38;background:#f1eadf;font-size:var(--type-micro);font-weight:800;letter-spacing:.1em}.batch-identity div{display:grid;gap:2px}.batch-identity strong{font-size:var(--type-control);color:var(--color-text)}.batch-identity small{font-size:var(--type-micro);color:var(--color-text-tertiary)}.batch-counts{display:flex;align-items:center}.batch-counts>span{min-width:84px;display:grid;gap:2px;padding:0 16px;border-left:1px solid var(--color-border);text-align:center}.batch-counts>span:first-child{border:0}.batch-counts small{font-size:var(--type-micro);color:var(--color-text-tertiary)}.batch-counts strong{font-size:15px;color:var(--color-text);font-variant-numeric:tabular-nums}.batch-counts .attention strong{color:var(--color-warning)}.header-actions{display:flex;justify-content:flex-end;align-items:center;gap:12px}.sync-state{font-size:var(--type-meta);color:var(--color-success)}.sync-state.is-offline{color:var(--color-warning)}.header-actions button{height:34px;display:flex;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--color-border);border-radius:8px;color:var(--color-text-secondary);background:transparent;font-size:var(--type-control);cursor:pointer}.workspace-grid{min-height:0;display:grid;grid-template-columns:244px minmax(0,1fr) 300px;gap:10px}.account-queue,.action-panel,.browser-shell{min-height:0;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);box-shadow:var(--shadow-low);overflow:hidden}.account-queue{display:grid;grid-template-rows:auto 1fr}.account-queue>header,.action-panel>header{min-height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--color-border)}.account-queue header div,.action-panel header div{display:grid;gap:3px}.account-queue header strong,.action-panel header strong{font-size:var(--type-control);color:var(--color-text)}.account-queue header small,.action-panel header span{font-size:var(--type-meta);color:var(--color-text-tertiary)}.queue-list{min-height:0;padding:8px;display:flex;flex-direction:column;gap:4px;overflow-y:auto}.queue-item{width:100%;min-height:54px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;padding:7px 9px;border:1px solid transparent;border-radius:10px;background:transparent;text-align:left;cursor:pointer;transition:background var(--motion-fast),border var(--motion-fast)}.queue-item:hover{background:var(--color-surface-soft)}.queue-item.selected{border-color:rgba(45,95,202,.2);background:var(--color-primary-soft)}.queue-state{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;color:var(--color-text-tertiary);background:var(--color-surface-soft)}.queue-state>span{width:7px;height:7px;border-radius:50%;background:var(--color-border-strong)}.queue-item.is-running .queue-state{color:var(--color-primary);background:var(--color-primary-soft)}.queue-item.is-waiting_user .queue-state{color:var(--color-warning);background:#fff0d2;animation:attention-pulse 700ms ease 2}.queue-item.is-failed .queue-state{color:var(--color-danger);background:#fff0f1}.queue-item.is-completed .queue-state{color:var(--color-success);background:#eaf8f2}.queue-copy{display:grid;gap:3px;min-width:0}.queue-copy strong{overflow:hidden;text-overflow:ellipsis;font-size:var(--type-control);color:var(--color-text)}.queue-copy small{font-size:var(--type-meta);color:var(--color-text-tertiary)}.queue-item>svg{color:var(--color-text-tertiary)}.browser-stage{min-width:0;min-height:0}.browser-shell{height:100%;display:grid;grid-template-rows:42px minmax(0,1fr)}.browser-toolbar{display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--color-border);color:var(--color-text-tertiary);font-size:var(--type-meta)}.browser-toolbar>span:nth-of-type(2){min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.browser-toolbar small{padding:4px 7px;border-radius:6px;background:var(--color-surface-soft);color:var(--color-text-secondary)}.traffic{display:flex;gap:4px;margin-right:3px}.traffic i{width:6px;height:6px;border-radius:50%;background:#d8dce3}.browser-viewport{position:relative;min-height:0;background:#f2f4f7}.batch-webview{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}.browser-placeholder,.desktop-required{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;text-align:center;color:var(--color-text-tertiary)}.browser-placeholder strong,.desktop-required strong{color:var(--color-text)}.browser-placeholder span,.desktop-required span{font-size:var(--type-meta)}.automation-shield{position:absolute;left:50%;bottom:16px;z-index:3;transform:translateX(-50%);display:flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(45,95,202,.18);border-radius:99px;color:var(--color-primary);background:rgba(252,252,253,.94);box-shadow:var(--shadow-medium);font-size:var(--type-meta);pointer-events:none}.action-panel{padding-bottom:14px}.action-panel>header{margin-bottom:14px}.mobile-close{display:none;border:0;background:transparent;color:var(--color-text-secondary)}.status-hero{margin:0 14px;padding:17px;border-radius:13px;background:var(--color-surface-soft);display:grid;justify-items:start;gap:7px}.status-symbol{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;color:var(--color-text-secondary);background:#fff}.status-hero>span{font-size:var(--type-control);font-weight:800;color:var(--color-text)}.status-hero p{min-height:34px;margin:0;font-size:var(--type-meta);line-height:1.6;color:var(--color-text-secondary)}.status-hero.is-running{background:var(--color-primary-soft)}.status-hero.is-running .status-symbol{color:var(--color-primary)}.status-hero.is-waiting_user{background:#fff8eb}.status-hero.is-waiting_user .status-symbol{color:var(--color-warning)}.status-hero.is-completed{background:#edf8f4}.status-hero.is-completed .status-symbol{color:var(--color-success)}.status-hero.is-failed{background:#fff2f3}.status-hero.is-failed .status-symbol{color:var(--color-danger)}.business-stage{margin:18px 14px;display:grid;gap:8px}.business-stage>span{font-size:var(--type-meta);color:var(--color-text-tertiary)}.business-stage>div{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.business-stage i{height:3px;border-radius:9px;background:var(--color-border)}.business-stage i.done{background:var(--color-success)}.business-stage i.active{background:var(--color-primary)}.business-stage small{font-size:var(--type-meta);color:var(--color-text-tertiary);word-spacing:7px}.primary-action{width:calc(100% - 28px);height:40px;margin:0 14px;border:0;border-radius:10px;color:#fff;background:var(--color-primary);font-size:var(--type-control);font-weight:700;cursor:pointer}.primary-action.warning{background:var(--color-warning)}.security-note{margin:14px;display:flex;align-items:flex-start;gap:7px;padding:11px;border-radius:10px;color:var(--color-success);background:#edf8f4}.security-note span{font-size:var(--type-meta);line-height:1.55}.mobile-toolbar,.mobile-overlay{display:none}.spin{animation:spin 900ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes attention-pulse{50%{transform:scale(1.06);box-shadow:0 0 0 5px rgba(183,121,31,.09)}}
@media(max-width:1279px){.workspace-grid{grid-template-columns:230px minmax(0,1fr)}.action-panel{position:fixed;top:calc(var(--header-height) + 10px);right:10px;bottom:10px;z-index:1001;width:min(310px,88vw);transform:translateX(calc(100% + 20px));transition:transform var(--motion-normal) var(--ease-emphasized);box-shadow:var(--shadow-overlay)}.action-panel.mobile-open{transform:translateX(0)}.mobile-toolbar{height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 8px}.mobile-toolbar button{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--color-text-secondary);font-size:var(--type-micro)}.mobile-toolbar span{font-size:var(--type-micro);color:var(--color-text)}.browser-stage{display:grid;grid-template-rows:auto minmax(0,1fr)}.mobile-close{display:grid}.mobile-overlay{display:block;position:fixed;inset:0;z-index:1000;background:var(--color-overlay)}}
@media(max-width:899px){.workspace-ready-empty{min-height:100%;padding:34px 24px}.ready-flow{grid-template-columns:1fr}.ready-flow>i{width:1px;height:18px;justify-self:center}.ready-flow>i::after{right:-2px;top:auto;bottom:0;transform:rotate(90deg)}.workspace-header{grid-template-columns:1fr auto}.batch-counts{display:none}.sync-state{display:none}.workspace-grid{display:block;position:relative}.browser-stage{height:100%}.account-queue{position:fixed;top:calc(var(--header-height) + 10px);left:10px;bottom:10px;z-index:1001;width:min(280px,88vw);transform:translateX(calc(-100% - 20px));transition:transform var(--motion-normal) var(--ease-emphasized);box-shadow:var(--shadow-overlay)}.account-queue.mobile-open{transform:translateX(0)}.setup-header,.setup-footer{display:grid}.setup-section{grid-template-columns:32px 1fr;padding:20px}.setup-section>.section-copy{grid-column:2}.setup-section>.business-tools,.setup-section>.import-zone{grid-column:1/-1}.business-tools,.preview-list{grid-template-columns:1fr}.privacy-mark{width:max-content}.setup-footer button{width:100%;justify-content:center}}
@media(max-width:560px){.workspace-ready-empty{padding:30px 18px}.workspace-ready-empty h1{font-size:23px}.ready-actions{width:100%;display:grid}.ready-actions button,.ready-actions a{width:100%}}
.error-list button{width:max-content;margin-top:4px;padding:4px 7px;border:1px solid rgba(195,61,73,.18);border-radius:6px;color:var(--color-danger);background:#fff;font-size:var(--type-micro);cursor:pointer}
@media(prefers-reduced-motion:reduce){.spin{animation:none}.queue-item.is-waiting_user .queue-state{animation:none}.action-panel,.account-queue{transition:none}}
</style>
