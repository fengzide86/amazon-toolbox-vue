<template>
  <main ref="landingRoot" class="landing" :class="{ 'motion-ready': motionReady, 'motion-paused': motionPaused }" data-route-focus>
    <a class="skip-link" href="#main-content" @click.prevent="focusContent">跳至主要内容</a>
    <header class="landing-nav" @keydown.esc="closeNavigation(true)">
      <div class="landing-container nav-inner">
        <RouterLink class="nav-brand" to="/" aria-label="课赛通 KST 首页" @click="closeNavigation()"><BrandLockup audience="login" decorative /></RouterLink>
        <nav id="landing-navigation" class="nav-links" :class="{ 'is-open': mobileNavOpen }" aria-label="主导航">
          <RouterLink :to="anchor('capabilities')" @click="closeNavigation()">产品价值</RouterLink>
          <RouterLink :to="anchor('audiences')" @click="closeNavigation()">适用人群</RouterLink>
          <RouterLink :to="anchor('workflow')" @click="closeNavigation()">开始使用</RouterLink>
          <RouterLink :to="anchor('faq')" @click="closeNavigation()">常见问题</RouterLink>
        </nav>
        <div class="nav-actions">
          <RouterLink class="nav-login" to="/user/login">授权登录 <ArrowUpRight :size="14" aria-hidden="true" /></RouterLink>
          <button class="nav-download" type="button" :disabled="isDownloading" :aria-busy="isDownloading" @click="downloadDesktop">{{ isDownloading ? '获取中…' : '下载桌面端' }}<ArrowDown :size="14" aria-hidden="true" /></button>
          <button ref="navToggle" class="nav-toggle" type="button" :aria-expanded="mobileNavOpen" :aria-label="mobileNavOpen ? '关闭导航' : '打开导航'" aria-controls="landing-navigation" @click="mobileNavOpen = !mobileNavOpen"><X v-if="mobileNavOpen" :size="22" aria-hidden="true" /><Menu v-else :size="22" aria-hidden="true" /></button>
        </div>
      </div>
    </header>
    <section id="main-content" ref="mainContent" class="hero" tabindex="-1">
      <div class="landing-container">
        <div class="hero-copy">
          <p class="eyebrow hero-eyebrow"><span class="brand-dot" aria-hidden="true"></span>为亚马逊赛训而设计</p>
          <h1>少一点重复，<br>多一点<span>赛训的专注。</span></h1>
          <p class="hero-lead">物流模板有工具，多账号任务有章法。<br>为<span class="audience-term">参赛学生</span>与<span class="audience-term">代打团队</span>，把精力留给更重要的判断。</p>
          <div class="hero-actions"><button class="button button-primary" type="button" :disabled="isDownloading" :aria-busy="isDownloading" @click="downloadDesktop">{{ downloadLabel }}<ArrowDown :size="17" aria-hidden="true" /></button><RouterLink class="button button-secondary" :to="anchor('capabilities')">探索产品 <ArrowRight :size="17" aria-hidden="true" /></RouterLink></div>
          <p class="hero-footnote">Windows 桌面端 <span>·</span> 使用需有效授权 <button class="hero-consultation" type="button" aria-haspopup="dialog" @click="consultationOpen = true">咨询授权 <ArrowUpRight :size="12" aria-hidden="true" /></button></p>
        </div>
        <div class="hero-story">
          <div class="story-toolbar">
            <div class="scenario-switch" role="group" aria-label="查看产品场景"><button type="button" :aria-pressed="activeScenario === 'personal'" aria-controls="product-scenario" @click="selectScenario('personal')"><UserRound :size="15" aria-hidden="true" />个人工具</button><button type="button" :aria-pressed="activeScenario === 'team'" aria-controls="product-scenario" @click="selectScenario('team')"><UsersRound :size="15" aria-hidden="true" />团队批次</button></div>
            <button class="motion-toggle" type="button" :aria-label="motionControlLabel" :aria-pressed="motionPaused" :disabled="reducedMotion" @click="controlBrandMotion"><Play v-if="motionPaused || reducedMotion || artFinished" :size="12" aria-hidden="true" /><Pause v-else :size="12" aria-hidden="true" />{{ reducedMotion ? '已减少动态效果' : artFinished ? '重播动效' : motionPaused ? '播放动效' : '暂停动效' }}</button>
          </div>
          <div id="product-scenario" data-testid="product-scenario" aria-live="polite" aria-atomic="true"><LandingStoryScene :key="artReplay" :scenario="activeScenario" :paused="motionPaused" :reduced="reducedMotion" @finished="artFinished = true" /></div>
          <p class="story-boundary">从一项任务，到一组账号。准备、执行、记录，一路有据可循。<RouterLink :to="anchor('faq')">了解演示与真实执行 <ArrowUpRight :size="13" aria-hidden="true" /></RouterLink></p>
        </div>
      </div>
    </section>
    <section id="capabilities" class="section capabilities-section">
      <div class="landing-container">
        <div class="section-heading" data-reveal><div><p class="eyebrow">把重复工作，交给合适的工具</p><h2>物流模板，<br>从填写到方案比较。</h2></div><p class="section-description">同样一份包裹资料，服务不同的任务。<br>按规则填写模板，或把运费方案放在一起比较。</p></div>
        <div class="tool-grid">
          <article class="tool-card tool-card-primary" data-reveal><div class="tool-card-top"><span class="tool-icon"><FileSpreadsheet :size="25" :stroke-width="1.5" aria-hidden="true" /></span><span class="availability">支持演示</span></div><p class="tool-purpose">按规则填写模板</p><h3>物流模板标准版</h3><p class="tool-description">整理模板名称、配送国家与固定运费，体验从资料准备到模板填写的完整流程。</p><div class="tool-sample" aria-hidden="true"><div class="sample-label">一份资料，连接后续操作</div><div class="input-example"><span>模板名称</span><span>配送国家</span><span>固定运费</span></div><div class="sample-output"><CornerDownRight :size="16" /><span>物流模板填写</span></div></div><RouterLink :to="anchor('workflow')" class="text-link">了解使用方式 <ArrowUpRight :size="16" aria-hidden="true" /></RouterLink></article>
          <article class="tool-card" data-reveal><div class="tool-card-top"><span class="tool-icon"><SlidersHorizontal :size="25" :stroke-width="1.5" aria-hidden="true" /></span><span class="availability">支持演示</span></div><p class="tool-purpose">比较不同运费方案</p><h3>物流模板成本优选版</h3><p class="tool-description">按配送国家与包裹条件计算运费，比较可用物流方案，让选择有依据。</p><div class="tool-sample" aria-hidden="true"><div class="sample-label">把影响选择的条件放在一起</div><div class="comparison-example"><div><span>配送范围</span><i></i></div><div><span>包裹条件</span><i></i></div><div><span>运费方案</span><i></i></div></div></div><RouterLink :to="anchor('workflow')" class="text-link">了解使用方式 <ArrowUpRight :size="16" aria-hidden="true" /></RouterLink></article>
        </div>
        <p class="section-note">当前工具支持演示体验；具体工具与使用权限，以开通的授权为准。</p>
      </div>
    </section>
    <section id="audiences" class="section audiences-section">
      <div class="landing-container">
        <div class="section-heading" data-reveal><div><p class="eyebrow">个人提效，团队掌控</p><h2>专注自己的任务，<br>也能掌握整批进展。</h2></div></div>
        <div class="audience-grid">
          <article class="audience-card" data-reveal><div class="audience-label"><UserRound :size="17" aria-hidden="true" />参赛学生</div><h3>把自己的任务，<br>一步步处理清楚。</h3><p class="audience-intro">从找到工具，到处理反馈，再到回看记录。<br>你始终知道该从哪里开始。</p><ul><li><BookOpen :size="18" aria-hidden="true" /><div><strong>先知道怎么用</strong><p>查看授权内的工具与使用帮助。</p></div></li><li><MousePointer2 :size="18" aria-hidden="true" /><div><strong>关键环节自己掌握</strong><p>需要登录、验证或确认时，保留现场并由你接手。</p></div></li><li><History :size="18" aria-hidden="true" /><div><strong>问题有迹可循</strong><p>回看执行记录，带着具体问题获得支持。</p></div></li></ul><RouterLink :to="anchor('workflow')" class="text-link">了解个人授权 <ArrowRight :size="16" aria-hidden="true" /></RouterLink></article>
          <article class="audience-card team-section" data-reveal><div class="audience-label"><UsersRound :size="17" aria-hidden="true" />代打团队</div><h3>把多个账号，<br>放进同一个工作节奏。</h3><p class="audience-intro">资料集中导入，批次统一查看。<br>把注意力留给需要处理的事项。</p><ul><li><FileSpreadsheet :size="18" aria-hidden="true" /><div><strong>从导入校验开始</strong><p>支持 Excel / CSV，检查字段与问题行后创建批次。</p></div></li><li><ListFilter :size="18" aria-hidden="true" /><div><strong>总览中找到重点</strong><p>查看账号状态，筛选需要关注的任务。</p></div></li><li><MousePointer2 :size="18" aria-hidden="true" /><div><strong>进入详情继续处理</strong><p>查看账号详情，需要时人工接手或重试，保留批次与执行记录。</p></div></li></ul><RouterLink :to="anchor('workflow')" class="text-link">了解团队席位 <ArrowRight :size="16" aria-hidden="true" /></RouterLink></article>
        </div>
        <p class="section-note">用于课程实训、院校或机构教学？请先与交付方确认课程任务、工具适用范围与授权方式。</p>
      </div>
    </section>
    <section id="workflow" class="section workflow-section">
      <div class="landing-container workflow-grid">
        <div data-reveal><p class="eyebrow">让第一次使用更顺畅</p><h2>三步，进入赛训节奏。</h2><p class="section-description">选对工具，确认授权，开始体验。<br>个人与团队，都有自己的起点。</p><dl class="authorization-paths"><div><dt>个人使用</dt><dd>确认所需工具、使用期限与设备范围。</dd></div><div><dt>团队使用</dt><dd>另行确认成员席位、批量任务与支持范围。</dd></div></dl><div class="workflow-entry"><button class="button button-primary" type="button" data-testid="consultation-trigger" aria-haspopup="dialog" @click="consultationOpen = true">咨询授权 <ArrowUpRight :size="16" aria-hidden="true" /></button><RouterLink class="text-link" to="/user/login">已有授权，前往登录 <ArrowUpRight :size="16" aria-hidden="true" /></RouterLink></div></div>
        <div><ol class="workflow-steps"><li v-for="(step, index) in workflowSteps" :key="step.title" data-reveal><span class="step-number">0{{ index + 1 }}</span><div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></div></li></ol><div class="authorization-note" data-reveal><Info :size="17" aria-hidden="true" /><p><strong>还没有授权？</strong>可先查看咨询说明，或联系向你介绍课赛通的交付方。当前咨询入口为预览演示，本站暂不提供在线购买，下载不代表已开通授权。</p></div></div>
      </div>
    </section>
    <section id="faq" class="section faq-section"><div class="landing-container faq-grid"><div data-reveal><p class="eyebrow">常见问题</p><h2>把你关心的，<br>说清楚。</h2></div><div class="faq-list" data-reveal><details v-for="question in questions" :key="question.title"><summary>{{ question.title }}<Plus :size="18" aria-hidden="true" /></summary><div class="faq-answer"><p>{{ question.answer }}</p></div></details></div></div></section>
    <section class="final-cta"><div class="landing-container final-inner" data-reveal><div><p class="eyebrow">课赛通 KST</p><h2>下一次赛训，<br class="mobile-only">从容一点。</h2><p>从一个合适的工具开始。</p></div><div class="final-actions"><button class="button button-primary" type="button" :disabled="isDownloading" :aria-busy="isDownloading" @click="downloadDesktop">{{ downloadLabel }}<ArrowDown :size="17" aria-hidden="true" /></button><span>Windows 桌面端 · 使用需有效授权</span></div></div></section>
    <footer class="landing-footer"><div class="landing-container"><div class="footer-top"><BrandLockup audience="login" /><div class="footer-links"><RouterLink :to="anchor('workflow')">授权说明</RouterLink><RouterLink :to="anchor('faq')">常见问题</RouterLink><RouterLink to="/user/terms">服务条款</RouterLink><RouterLink to="/admin/login">内部运营</RouterLink></div></div><div class="footer-bottom"><span>© {{ currentYear }} 课赛通 KST</span><span>以亚马逊赛训为主 · 速卖通扩展验证中</span><RouterLink to="/">回到顶部 <ArrowUp :size="14" aria-hidden="true" /></RouterLink></div></div></footer>
    <Transition name="download-notice"><div v-if="downloadState !== 'idle'" class="download-notice" :class="{ 'is-error': downloadState === 'error' }"><div><span v-if="isDownloading" class="download-spinner" aria-hidden="true"></span><CircleAlert v-else-if="downloadState === 'error'" :size="19" aria-hidden="true" /><Check v-else :size="19" aria-hidden="true" /><p id="desktop-download-feedback" :role="downloadState === 'error' ? 'alert' : 'status'" aria-atomic="true">{{ downloadFeedback }}</p></div><button v-if="downloadState === 'error'" type="button" @click="downloadDesktop">重试</button><button v-if="!isDownloading" class="notice-close" type="button" aria-label="关闭下载提示" @click="downloadState = 'idle'"><X :size="17" aria-hidden="true" /></button></div></Transition>
    <LandingConsultationDialog :open="consultationOpen" @close="consultationOpen = false" />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowRight, BookOpen, CornerDownRight, FileSpreadsheet, History, ListFilter, MousePointer2, SlidersHorizontal, UserRound, UsersRound, ArrowUp, ArrowUpRight, Check, CircleAlert, Info, Menu, Pause, Play, Plus, X } from '@lucide/vue'
import BrandLockup from '@/components/brand/BrandLockup.vue'
import LandingStoryScene from '@/components/landing/LandingStoryScene.vue'
import LandingConsultationDialog from '@/components/landing/LandingConsultationDialog.vue'
import { useLandingMotion } from '@/composables/useLandingMotion'
import { downloadDesktopInstaller } from '@/runtime/desktop-download'

const currentYear = new Date().getFullYear()
const landingRoot = ref<HTMLElement | null>(null)
const mainContent = ref<HTMLElement | null>(null)
const navToggle = ref<HTMLButtonElement | null>(null)
const mobileNavOpen = ref(false)
const consultationOpen = ref(false)
const { motionReady, motionPaused, reducedMotion, toggleMotion } = useLandingMotion(landingRoot)
const activeScenario = ref<'personal' | 'team'>('personal')
const artReplay = ref(0)
const artFinished = ref(false)
watch(reducedMotion, () => { artFinished.value = false })
const motionControlLabel = computed(() => reducedMotion.value ? '已减少动态效果' : artFinished.value ? '重播品牌动效' : motionPaused.value ? '播放品牌动效' : '暂停品牌动效')
function controlBrandMotion(): void {
  if (reducedMotion.value) return
  if (artFinished.value) {
    if (motionPaused.value) toggleMotion()
    artFinished.value = false
    artReplay.value += 1
    return
  }
  toggleMotion()
}
function selectScenario(scenario: 'personal' | 'team'): void {
  if (activeScenario.value === scenario) return
  activeScenario.value = scenario
  artFinished.value = false
  artReplay.value += 1
}
const downloadState = ref<'idle' | 'loading' | 'requested' | 'error'>('idle')
const isDownloading = computed(() => downloadState.value === 'loading')
const downloadLabel = computed(() => isDownloading.value ? '正在获取安装包…' : downloadState.value === 'error' ? '重试下载桌面端' : '下载 Windows 桌面端')
const downloadFeedback = computed(() => downloadState.value === 'loading' ? '正在获取当前发布的安装包…' : downloadState.value === 'error' ? '暂时无法获取安装包，请重试下载。' : '已请求下载，请查看浏览器下载列表。')
const anchor = (id: string) => ({ name: 'Landing', hash: '#' + id })
function closeNavigation(restoreFocus = false): void {
  if (!mobileNavOpen.value) return
  mobileNavOpen.value = false
  if (restoreFocus) navToggle.value?.focus()
}
function focusContent(): void {
  mainContent.value?.focus()
  mainContent.value?.scrollIntoView({ behavior: 'auto' })
}
async function downloadDesktop(): Promise<void> {
  if (isDownloading.value) return
  downloadState.value = 'loading'
  try {
    await downloadDesktopInstaller()
    downloadState.value = 'requested'
  } catch { downloadState.value = 'error' }
}
function handleOutsidePointer(event: PointerEvent): void {
  if (event.target instanceof Element && !event.target.closest('.landing-nav')) closeNavigation()
}
let desktopNavigation: MediaQueryList | undefined
function handleNavigationResize(): void { if (desktopNavigation?.matches) closeNavigation() }
onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer)
  desktopNavigation = window.matchMedia('(min-width: 901px)')
  desktopNavigation.addEventListener('change', handleNavigationResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer)
  desktopNavigation?.removeEventListener('change', handleNavigationResize)
})
const workflowSteps = [
  { title: '找到要用的工具', description: '从物流模板或团队批次出发，确认工具是否覆盖本次赛训任务。' },
  { title: '确认并开通授权', description: '联系交付方确认工具权限、使用期限、设备数量；团队另行确认成员席位。' },
  { title: '安装，开始体验', description: '安装 Windows 桌面端并登录，先用演示熟悉操作，再按工具开放范围使用。' },
]
const questions = [
  { title: '课赛通适合谁？', answer: '主要面向参赛学生与代打团队：学生使用个人工具箱，团队使用专业批量工作台。课程学员、指导教师、院校与培训机构可先与交付方确认具体任务与授权方式。当前以亚马逊赛训为主，速卖通作为扩展验证方向。' },
  { title: '官网和桌面端有什么区别？', answer: '官网用于了解产品与下载，手机和电脑都能浏览。已有授权可登录使用浏览器支持的管理与演示功能。真实自动执行需要 Windows 桌面端；当前工具以演示体验为主，真实场景仍需验证，须确认工具已开放并安排受控试运行。' },
  { title: '批量演示等于真实账号并发执行吗？', answer: '不等于。批量演示最多可展示 50 个账号一起推进，不会同时创建 50 个真实浏览器。真实任务仅在 Windows 桌面端按账号顺序执行，目前不支持多个真实账号同时自动运行。演示状态不代表真实账号已经完成任务。' },
  { title: '下载后可以直接使用吗？套餐如何确定？', answer: '下载不代表已获得授权。使用需有效授权，工具、期限、设备与席位范围以有效套餐配置为准。请先通过向你介绍课赛通的交付渠道确认适用范围和授权，本站暂不提供免费注册或在线购买。' },
  { title: '遇到登录验证或任务异常怎么办？', answer: '需要人工介入时，在保留的任务现场完成确认，再选择继续或停止。结果以实际执行反馈为准，不以动画判断成功。可通过工具帮助、执行记录和问题反馈进一步排查。' },
]
</script>

<style scoped>
.landing:focus { outline: none; }
.landing { --ink:#18263f; --muted:#64738b; --blue:#1565ff; --line:#e5eaf2; color:var(--ink); background:#fff; min-height:100vh; overflow:clip; font-family:'Inter','Segoe UI','PingFang SC','Microsoft YaHei UI','Microsoft YaHei',sans-serif; -webkit-font-smoothing:antialiased; }
.landing *, .landing *::before, .landing *::after { box-sizing:border-box; }.landing a { color:inherit; text-decoration:none; }.landing button { font-family:inherit; cursor:pointer; }.landing svg { flex-shrink:0; }.landing h1, .landing h2, .landing h3, .landing p { margin:0; }.landing a:focus-visible, .landing button:focus-visible, .landing summary:focus-visible { outline:3px solid #7ba8ff; outline-offset:5px; }.landing button:disabled { opacity:.6; cursor:wait; }.hero:focus { outline:none; }.landing-container { width:min(1152px,calc(100% - 96px)); margin-inline:auto; }.skip-link { position:fixed; top:10px; left:16px; z-index:100; padding:12px 18px; color:#fff !important; background:var(--ink); border-radius:8px; transform:translateY(-160%); }.skip-link:focus { transform:translateY(0); }
.landing-nav { position:sticky; top:0; z-index:40; height:80px; background:#ffffffed; backdrop-filter:blur(18px); border-bottom:1px solid #e9edf4a6; }.nav-inner,.nav-links,.nav-actions { display:flex; align-items:center; }.nav-inner { height:100%; gap:34px; }.nav-brand { display:inline-flex; flex-shrink:0; }.nav-brand :deep(.kst-lockup-logo) { width:138px; height:46px; }.nav-brand :deep(.kst-lockup-subtitle) { display:none; }.nav-links { margin-left:auto; gap:28px; font-size:13px; color:#617087; }.nav-links a,.nav-login { transition:color .18s; }.nav-links a:hover,.nav-login:hover { color:var(--blue); }.nav-actions { gap:22px; }.nav-login { display:flex; align-items:center; gap:5px; font-size:12px; }.nav-download { display:flex; align-items:center; gap:12px; background:#f3f6fb; color:#294264; border:1px solid #e2e9f4; padding:10px 14px; border-radius:8px; font-size:12px; transition:background .2s; }.nav-download:hover { background:#e8effc; }.nav-toggle { display:none; border:0; padding:7px; background:transparent; color:var(--ink); }
.hero { background:linear-gradient(180deg,#fbfcff 0%,#fff 78%); padding:48px 0 40px; }.hero-copy { text-align:center; }.eyebrow { color:var(--blue); font-size:13px; line-height:1.7; font-weight:600; letter-spacing:.045em; }.hero-eyebrow { display:flex; align-items:center; justify-content:center; gap:8px; font-size:12px; }.brand-dot { width:6px; height:6px; background:var(--blue); border-radius:50%; box-shadow:0 0 0 4px #eaf1ff; }.hero h1 { margin-top:25px; font-size:clamp(48px,5vw,70px); font-weight:600; line-height:1.2; letter-spacing:-.035em; }.hero h1 span { color:var(--blue); }.hero-lead { margin-top:25px !important; font-size:16px; line-height:1.95; color:var(--muted); }.hero-actions { display:flex; justify-content:center; align-items:center; gap:12px; margin-top:30px; }.button { min-height:48px; display:inline-flex; align-items:center; justify-content:center; gap:18px; padding:13px 21px; border-radius:9px; font-size:13px; font-weight:550; border:1px solid transparent; transition:transform .2s,background .2s,box-shadow .2s; }.button-primary { color:#fff !important; background:var(--blue); box-shadow:0 3px 8px #1565ff18; }.button-primary:hover:not(:disabled) { background:#0c55e0; box-shadow:0 6px 16px #1565ff22; transform:translateY(-1px); }.button-secondary { background:#fff; border-color:#e0e6f0; color:#455772 !important; }.button-secondary:hover { background:#f6f8fc; }.hero-footnote { font-size:11px; color:#5b6e88; margin-top:15px !important; }.hero-footnote span { margin-inline:8px; }
.hero-story { margin-top:34px; }.story-toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:17px; }.scenario-switch { display:flex; gap:3px; background:#f3f6fb; padding:4px; border-radius:10px; border:1px solid #e9edf4; }.scenario-switch button { display:flex; align-items:center; gap:8px; padding:8px 17px; font-size:12px; color:#5b6e88; background:transparent; border:1px solid transparent; border-radius:7px; transition:background .2s,color .2s; }.scenario-switch button[aria-pressed='true'] { color:#265cae; background:#fff; border-color:#e4eaf4; box-shadow:0 2px 4px #16365605; }.motion-toggle { display:flex; align-items:center; gap:6px; border:0; background:transparent; color:#5b6e88; font-size:11px; padding:8px 0 8px 10px; }.motion-toggle:disabled { cursor:default; }.story-boundary { display:flex; justify-content:center; align-items:center; flex-wrap:wrap; gap:6px 15px; margin-top:20px !important; color:#5b6e88; font-size:11px; line-height:1.8; }.story-boundary a { display:inline-flex; align-items:center; gap:4px; color:#587092; }
.section { padding-block:88px; scroll-margin-top:105px; }.section-heading { display:flex; align-items:end; justify-content:space-between; gap:50px; margin-bottom:38px; }.landing h2 { font-size:40px; line-height:1.4; font-weight:600; letter-spacing:-.035em; margin-top:16px; }.section-description { font-size:15px; line-height:1.95; color:var(--muted); }.tool-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }.tool-card { padding:32px; border:1px solid var(--line); border-radius:18px; background:#fff; }.tool-card-top { display:flex; align-items:center; justify-content:space-between; }.tool-icon { width:45px; height:45px; display:grid; place-items:center; color:#4774bf; background:#f0f5ff; border-radius:11px; }.availability { color:#5b6e88; font-size:11px; border:1px solid #e3eaf3; border-radius:20px; padding:4px 9px; }.tool-card h3 { font-size:24px; font-weight:600; letter-spacing:-.025em; margin-top:23px; }.tool-card > p { margin-top:12px; font-size:14px; line-height:1.85; color:var(--muted); max-width:390px; }.tool-sample { background:#f7f9fd; border-radius:10px; min-height:130px; padding:19px 22px; margin-block:24px; }.sample-label { font-size:10px; color:#7b8ba3; }.input-example { display:flex; gap:8px; margin-top:15px; }.input-example span { font-size:11px; background:#fff; padding:6px 11px; color:#556d8d; border:1px solid #e4eaf3; border-radius:5px; }.sample-output { display:flex; align-items:center; gap:7px; color:#6d83a2; margin-top:13px; font-size:11px; }.comparison-example { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-top:20px; }.comparison-example > div { display:flex; flex-direction:column; gap:16px; color:#617695; font-size:11px; }.comparison-example i { height:4px; background:#dbe6f8; width:100%; border-radius:4px; }.comparison-example > div:nth-child(2) i { width:75%; }.comparison-example > div:nth-child(3) i { width:60%; }.text-link { display:inline-flex; align-items:center; gap:11px; color:#3267b5 !important; font-size:13px; font-weight:500; }.text-link svg { transition:transform .2s; }.text-link:hover svg { transform:translateX(3px); }.section-note { color:#5b6e88; font-size:12px; line-height:1.9; margin-top:24px !important; }
.audiences-section { background:#f9fbfe; border-top:1px solid #edf1f7; border-bottom:1px solid #edf1f7; }.audience-grid { display:grid; grid-template-columns:1fr 1fr; }.audience-card { padding:0 60px 0 0; }.audience-card + .audience-card { padding:0 0 0 60px; border-left:1px solid #e0e7f1; }.audience-label { display:flex; align-items:center; gap:8px; color:#6280ac; font-size:12px; }.audience-card h3 { font-size:28px; font-weight:550; line-height:1.5; letter-spacing:-.02em; margin-top:17px; }.audience-intro { font-size:14px; color:var(--muted); line-height:1.9; margin-top:16px !important; }.audience-card ul { padding:0; list-style:none; margin:31px 0; display:grid; gap:23px; }.audience-card li { display:flex; gap:13px; align-items:start; }.audience-card li > svg { margin-top:3px; color:#5b6e88; }.audience-card li strong { font-size:14px; font-weight:550; }.audience-card li p { font-size:13px; color:var(--muted); line-height:1.8; margin-top:5px; }.audiences-section .section-note { margin-top:42px !important; }
.workflow-grid,.faq-grid { display:grid; grid-template-columns:.85fr 1.15fr; gap:88px; }.workflow-grid .section-description { margin-top:20px; }.workflow-login { margin-top:28px; }.workflow-steps { list-style:none; padding:0; margin:0; }.workflow-steps li { display:flex; gap:24px; padding:26px 0; border-bottom:1px solid var(--line); }.workflow-steps li:first-child { padding-top:0; }.step-number { color:#a2b6d3; font-size:18px; line-height:1.6; font-weight:400; font-variant-numeric:tabular-nums; }.workflow-steps h3 { font-size:17px; font-weight:550; line-height:1.6; }.workflow-steps p { font-size:13px; color:var(--muted); line-height:1.9; margin-top:9px; }.authorization-note { display:flex; align-items:start; gap:10px; margin-top:24px; color:#5b6e88; font-size:12px; line-height:1.9; }.authorization-note > svg { margin-top:4px; }.authorization-note strong { color:#4e6381; font-weight:550; margin-right:4px; }
.faq-section { padding-top:30px; }.faq-list details { border-bottom:1px solid var(--line); }.faq-list details:first-child { border-top:1px solid var(--line); }.faq-list summary { display:flex; align-items:center; justify-content:space-between; gap:20px; list-style:none; padding:23px 0; font-size:14px; cursor:pointer; }.faq-list summary::-webkit-details-marker { display:none; }.faq-list summary svg { color:#8d9bb0; transition:transform .2s; }.faq-list details[open] summary svg { transform:rotate(45deg); }.faq-answer { padding:0 30px 23px 0; font-size:13px; line-height:1.95; color:var(--muted); }
.final-cta { background:#f4f8ff; border-top:1px solid #e8eff9; padding:64px 0; }.final-inner { display:flex; align-items:center; justify-content:space-between; gap:40px; }.final-inner h2 { margin-top:12px; font-size:37px; }.final-inner p:last-child { font-size:14px; color:#5b6e88; margin-top:16px; }.final-actions { display:flex; flex-direction:column; gap:14px; }.final-actions > span { text-align:center; color:#5b6e88; font-size:11px; }.landing-footer { padding:44px 0 24px; }.footer-top { display:flex; align-items:center; justify-content:space-between; gap:30px; }.footer-top :deep(.kst-lockup-logo) { width:130px; height:42px; }.footer-top :deep(.kst-lockup-subtitle) { max-width:130px; font-size:10px; color:#5b6e88; font-weight:400; }.footer-links { display:flex; gap:25px; font-size:12px; color:#5b6e88; }.footer-bottom { display:flex; gap:35px; border-top:1px solid var(--line); padding-top:23px; margin-top:32px; font-size:10px; color:#5b6e88; }.footer-bottom a { margin-left:auto; display:flex; align-items:center; gap:7px; }.mobile-only { display:none; }
.download-notice { position:fixed; z-index:80; bottom:26px; left:50%; transform:translateX(-50%); max-width:calc(100% - 32px); width:max-content; display:flex; align-items:center; gap:16px; padding:15px 18px; background:#fff; border:1px solid #dce6f5; box-shadow:0 8px 35px #1a3f7420; border-radius:12px; }.download-notice > div { display:flex; align-items:center; gap:10px; }.download-notice p { font-size:13px; line-height:1.65; }.download-notice > button { background:transparent; border:0; padding:4px; color:#2a65c4; font-size:12px; flex-shrink:0; }.download-notice.is-error { border-color:#e9cbcb; }.notice-close { display:flex; color:#7a889f !important; }.download-spinner { width:16px; height:16px; border:2px solid #dce7fb; border-top-color:var(--blue); border-radius:50%; animation:download-spin .8s linear infinite; flex-shrink:0; }.download-notice-enter-active,.download-notice-leave-active { transition:opacity .2s,margin-bottom .2s; }.download-notice-enter-from,.download-notice-leave-to { opacity:0; margin-bottom:-8px; }@keyframes download-spin { to { transform:rotate(360deg); } }
.motion-ready [data-reveal] { opacity:.82; transform:translateY(12px); transition:opacity .5s ease,transform .5s cubic-bezier(.2,.7,.2,1); }.motion-ready [data-reveal].is-visible { opacity:1; transform:none; }.motion-paused [data-reveal] { opacity:1; transform:none; transition:none; }
/* Editorial rhythm: a readable wide-screen composition, not a stretched app shell. */
.hero-lead { text-wrap: balance; }
.audience-term { white-space: nowrap; }
.hero-consultation { display: inline-flex; align-items: center; gap: 3px; padding: 4px 0 4px 12px; border: 0; background: none; color: #3267b5; font-size: inherit; }
.workflow-entry { display: flex; align-items: center; flex-wrap: wrap; gap: 16px 22px; margin-top: 27px; }
.workflow-entry .button { font-size: 13px; }
@media (min-width: 1101px) {
  .landing-container { width: min(1200px, calc(100% - 96px)); }
}
.tool-card-primary { border-color: #d8e4f7; background: linear-gradient(155deg, #f8fbff, #fff 58%); }
.tool-card .tool-purpose { margin-top: 22px; color: #3666af; font-size: 12px; font-weight: 500; }
.tool-card h3 { margin-top: 7px; }
.tool-card .tool-description { max-width: 32em; }
.authorization-paths { display: grid; gap: 17px; margin: 27px 0 0; padding-left: 17px; border-left: 2px solid #dce7fa; }
.authorization-paths dt { color: #344f76; font-size: 13px; font-weight: 600; }
.authorization-paths dd { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.8; }
@media (min-width: 901px) {
  .hero { padding-top: 38px; }
  .hero h1 { font-size: clamp(48px, 4.7vw, 66px); margin-top: 20px; }
  .hero-lead { margin-top: 20px !important; font-size: 17px; line-height: 1.85; }
  .hero-actions { margin-top: 25px; }
  .hero-story { margin-top: 28px; }
  .nav-links { font-size: 14px; }
  .tool-grid { gap: 28px; }
  .tool-card { padding: 36px; }
  .section-heading { margin-bottom: 42px; }
}
@media (max-width:1100px) { .landing-container { width:calc(100% - 72px); }.nav-inner { gap:24px; }.nav-links { gap:18px; font-size:12px; }.nav-actions { gap:16px; }.nav-brand :deep(.kst-lockup-logo) { width:116px; }.audience-card { padding-right:40px; }.audience-card + .audience-card { padding-left:40px; }.workflow-grid,.faq-grid { gap:50px; } }
@media (max-width:900px) { .landing-container { width:calc(100% - 56px); }.landing-nav { height:72px; }.nav-actions { margin-left:auto; }.nav-toggle { display:inline-flex; }.nav-links { display:none; position:absolute; top:72px; left:0; width:100%; padding:16px 28px 23px; background:#fff; border-bottom:1px solid var(--line); box-shadow:0 15px 22px #23385806; }.nav-links.is-open { display:grid; gap:0; }.nav-links a { padding:13px 0; font-size:14px; }.hero { padding-top:55px; }.hero h1 { font-size:58px; }.hero-lead { font-size:14px; }.hero-story { margin-top:40px; }.section { padding-block:65px; scroll-margin-top:92px; }.section-heading { gap:30px; }.landing h2 { font-size:32px; }.section-description { font-size:13px; }.tool-card { padding:25px; }.tool-card h3 { font-size:20px; }.tool-card > p { font-size:13px; }.tool-sample { padding:17px; }.input-example { gap:5px; }.input-example span { padding:6px; font-size:10px; }.audience-card { padding-right:27px; }.audience-card + .audience-card { padding-left:27px; }.audience-card h3 { font-size:24px; }.audience-intro { font-size:13px; }.audience-card li p { font-size:12px; }.workflow-grid,.faq-grid { gap:36px; }.faq-section { padding-top:10px; }.final-inner h2 { font-size:30px; }.footer-links { gap:18px; font-size:11px; }.footer-top :deep(.kst-lockup-subtitle) { display:none; } }
@media (max-width:640px) { .landing-container { width:calc(100% - 40px); }.landing-nav { height:66px; }.nav-links { top:66px; padding-inline:20px; }.nav-brand :deep(.kst-lockup-logo) { width:112px; height:38px; }.nav-inner { gap:8px; }.nav-actions { gap:13px; }.nav-login { font-size:11px; gap:2px; }.nav-download { display:none; }.hero { padding-top:44px; padding-bottom:24px; }.hero-eyebrow { font-size:11px; }.hero h1 { font-size:clamp(34px,9.1vw,48px); line-height:1.32; letter-spacing:-.055em; margin-top:22px; }.hero-lead { font-size:13px; max-width:340px; margin-inline:auto; margin-top:22px !important; line-height:1.9; }.hero-lead br { display:none; }.hero-actions { gap:9px; margin-top:25px; }.button { padding:12px 14px; gap:10px; min-height:46px; font-size:11px; }.hero-footnote { font-size:10px; }.hero-story { margin-top:33px; }.story-toolbar { gap:5px; margin-bottom:13px; }.scenario-switch button { font-size:11px; padding:7px 11px; gap:6px; }.scenario-switch button svg { width:13px; }.motion-toggle { font-size:10px; gap:3px; }.story-boundary { font-size:10px; text-align:center; gap:4px; margin-top:15px !important; }.section { padding-block:50px; }.section-heading { display:block; margin-bottom:26px; }.eyebrow { font-size:11px; }.landing h2 { font-size:29px; margin-top:13px; line-height:1.4; }.section-description { font-size:14px; margin-top:18px; }.tool-grid { grid-template-columns:1fr; gap:18px; }.tool-card { padding:25px; border-radius:16px; }.tool-card h3 { font-size:22px; }.tool-card > p { font-size:14px; }.tool-sample { margin-block:20px; }.tool-icon { width:40px; height:40px; }.availability { font-size:10px; }.section-note { font-size:11px; line-height:1.9; margin-top:18px !important; }.audience-grid { grid-template-columns:1fr; }.audience-card { padding:0 0 34px; }.audience-card + .audience-card { border-left:0; border-top:1px solid #e0e7f1; padding:34px 0 0; }.audience-label { font-size:12px; }.audience-card h3 { font-size:25px; }.audience-intro { font-size:14px; }.audience-card ul { gap:20px; margin-block:27px; }.audience-card li p { font-size:13px; }.audiences-section .section-note { margin-top:30px !important; }.workflow-grid,.faq-grid { grid-template-columns:1fr; gap:32px; }.workflow-login { margin-top:18px; }.workflow-steps li { gap:20px; padding-block:21px; }.workflow-steps p { font-size:14px; }.workflow-steps h3 { font-size:16px; }.authorization-note { font-size:12px; }.faq-section { padding-top:0; }.faq-list summary { font-size:14px; padding-block:20px; }.faq-answer { font-size:13px; padding-right:10px; }.final-cta { padding-block:43px; }.final-inner { flex-direction:column; align-items:flex-start; gap:26px; }.final-inner h2 { font-size:32px; }.final-inner p:last-child { font-size:13px; margin-top:11px; }.final-actions { gap:12px; }.final-actions .button { font-size:13px; padding-inline:20px; }.final-actions > span { font-size:10px; text-align:left; }.landing-footer { padding-top:31px; }.footer-top { align-items:flex-start; flex-direction:column; gap:23px; }.footer-links { font-size:11px; gap:23px; }.footer-bottom { display:grid; grid-template-columns:1fr auto; gap:14px; font-size:9px; margin-top:25px; }.footer-bottom > span:nth-child(2) { grid-row:2; grid-column:1/-1; }.mobile-only { display:initial; }.download-notice { gap:10px; padding:12px; bottom:15px; }.download-notice p { font-size:12px; }.download-notice > div { gap:7px; } }
@media (prefers-reduced-motion:reduce) { .landing *, .landing *::before, .landing *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; }.landing [data-reveal] { opacity:1 !important; transform:none !important; } }
</style>
