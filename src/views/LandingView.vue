<template>
  <main ref="landingRoot" class="landing" :class="{ 'motion-ready': motionReady }" data-route-focus>
    <a class="skip-link" href="#main-content" @click.prevent="focusContent">跳至主要内容</a>
    <header class="landing-nav" @keydown.esc="closeNavigation(true)">
      <div class="landing-container nav-inner">
        <RouterLink class="nav-brand" to="/" aria-label="课赛通 KST 首页" @click="closeNavigation()"><BrandLockup audience="login" /></RouterLink>
        <nav id="landing-navigation" class="nav-links" :class="{ 'is-open': mobileNavOpen }" aria-label="主导航">
          <RouterLink :to="anchor('capabilities')" @click="closeNavigation()">产品能力</RouterLink>
          <RouterLink :to="anchor('for-teams')" @click="closeNavigation()">适用场景</RouterLink>
          <RouterLink :to="anchor('workflow')" @click="closeNavigation()">使用流程</RouterLink>
          <RouterLink :to="anchor('faq')" @click="closeNavigation()">常见问题</RouterLink>
        </nav>
        <div class="nav-actions">
          <RouterLink class="nav-login" to="/user/login">授权登录 <ArrowUpRight :size="14" /></RouterLink>
          <button class="nav-download" type="button" :disabled="isDownloading" :aria-busy="isDownloading" @click="downloadDesktop"><Download :size="15" />{{ isDownloading ? '获取中…' : '下载桌面端' }}</button>
          <button ref="navToggle" class="nav-toggle" type="button" :aria-expanded="mobileNavOpen" :aria-label="mobileNavOpen ? '关闭导航' : '打开导航'" aria-controls="landing-navigation" @click="mobileNavOpen = !mobileNavOpen"><X v-if="mobileNavOpen" :size="21" /><Menu v-else :size="21" /></button>
        </div>
      </div>
    </header>

    <section id="main-content" ref="mainContent" class="hero" tabindex="-1">
      <div class="landing-container hero-copy">
        <div class="hero-eyebrow"><span></span>课赛通 KST <i>/</i> 跨境电商赛训效率工具</div>
        <h1>把繁杂留给工具，<br><span>把节奏留给自己。</span></h1>
        <p class="hero-lead">从个人任务到团队批次，让工具、执行与复盘连在一起。<br class="desktop-break">专注亚马逊赛训，让每一步都清楚。</p>
        <div class="hero-actions">
          <button class="button button-primary" type="button" :disabled="isDownloading" :aria-busy="isDownloading" @click="downloadDesktop"><MonitorDown :size="18" />{{ downloadLabel }}<ArrowRight :size="16" /></button>
          <RouterLink class="button button-secondary" :to="anchor('capabilities')">看看产品如何工作 <ArrowDown :size="16" /></RouterLink>
        </div>
        <p class="hero-footnote">Windows 桌面端<span>·</span>使用需有效授权</p>
      </div>
      <div id="capabilities" class="landing-container product-stage"><LandingProductPreview /></div>
      <div class="landing-container hero-caption"><span>同一套工具，两种工作方式。</span><span>个人效率工具箱 <i>/</i> 专业批量工作台</span></div>
    </section>

    <section id="for-teams" class="section audience-section">
      <div class="landing-container">
        <div class="section-heading" data-reveal><span class="section-index">01 / 为你的工作方式而设计</span><h2>一个人的专注。<br><span>一群人的章法。</span></h2><p>任务规模不同，需要的掌控感相同。<br>从参赛学生到代打团队，各有清晰的工作空间。</p></div>
        <div class="audience-columns">
          <article class="audience-personal" data-reveal>
            <div class="audience-label"><UserRound :size="17" />参赛学生<span>PERSONAL</span></div>
            <h3>在有限的赛训时间里，<br>专注眼前这一步。</h3>
            <p>按授权找到可用工具，跟随任务状态操作。需要确认时保留现场，结束后回看记录，不必在零散入口之间反复寻找。</p>
            <ul class="feature-list"><li><Check :size="16" />工具、帮助与授权，集中查看</li><li><Check :size="16" />单任务执行，过程与结果分开呈现</li><li><Check :size="16" />人工介入时，选择继续或停止</li></ul>
            <RouterLink class="text-link" to="/user/login">已有个人授权，进入工具箱 <ArrowUpRight :size="17" /></RouterLink>
          </article>
          <article class="audience-team" data-reveal>
            <div class="audience-label"><UsersRound :size="17" />代打团队<span>BUSINESS</span></div>
            <h3>看得见整体进度，<br>也接得住每一个异常。</h3>
            <p>将 Excel / CSV 整理为批次，在同一张任务表里查看账号状态。按需打开详情，处理关键节点，再回到全局。</p>
            <ul class="feature-list"><li><Check :size="16" />导入校验、任务筛选与批次记录</li><li><Check :size="16" />总览与账号详情，在同一工作空间</li><li><Check :size="16" />演示与真实执行，模式明确区分</li></ul>
            <RouterLink class="text-link" to="/business/overview">已有团队授权，进入工作台 <ArrowUpRight :size="17" /></RouterLink>
          </article>
        </div>
        <div class="secondary-audience" data-reveal><GraduationCap :size="20" /><p><strong>指导教师、院校与培训机构</strong><span>课程实训与集中交付是扩展验证场景，需先确认适用任务、授权范围与交付方式。</span></p><RouterLink :to="anchor('workflow')" aria-label="了解教师与机构的使用流程"><ArrowRight :size="20" /></RouterLink></div>
      </div>
    </section>

    <section class="control-section">
      <div class="landing-container control-grid">
        <div class="control-copy" data-reveal><span class="section-index">02 / 自动化，也要留有掌控</span><h2>不是把任务交出去。<br><span>而是把过程看清楚。</span></h2><p>真正有用的执行体验，不止一个“开始”按钮。<br>遇到需要确认的节点，知道发生了什么，<br>也知道下一步可以做什么。</p><div class="control-principles"><span><ScanLine :size="16" />查看现场</span><span><MousePointer2 :size="16" />人工确认</span><span><History :size="16" />留存结果</span></div></div>
        <div class="process-illustration" data-reveal aria-label="执行流程说明：任务执行，需要确认时等待人工介入，确认后继续，最后保留结果">
          <div class="process-topline"><span>受控执行流程</span><span>流程示意</span></div>
          <div class="process-step"><span class="process-icon"><Play :size="17" /></span><div><strong>开始任务</strong><small>校验工具、模式与授权</small></div><Check :size="16" class="process-check" /></div>
          <div class="process-connector"><span></span></div>
          <div class="process-step process-attention"><span class="process-icon"><Hand :size="18" /></span><div><strong>需要你确认</strong><small>保留当前现场，等待人工处理</small></div><span class="process-status">待确认</span></div>
          <div class="process-choices"><span>确认后继续 <ArrowRight :size="13" /></span><span>或停止任务</span></div>
          <div class="process-connector"><span></span></div>
          <div class="process-step"><span class="process-icon"><ClipboardCheck :size="18" /></span><div><strong>结果留档</strong><small>以实际执行结果为准</small></div></div>
          <p class="process-note">Live 真实任务仅在桌面端受控试运行；演示不代表真实执行结果。</p>
        </div>
      </div>
    </section>

    <section id="workflow" class="section workflow-section">
      <div class="landing-container">
        <div class="workflow-heading" data-reveal><div><span class="section-index">03 / 从了解，到真正用起来</span><h2>好的工具，<br><span>也需要清晰的开始。</span></h2></div><p>先了解适用场景，再确认授权与安装。<br>从一次演示开始，逐步进入真实任务。</p></div>
        <ol class="workflow-steps"><li v-for="(step, index) in workflowSteps" :key="step.title" data-reveal :style="{ '--reveal-delay': index * 65 + 'ms' }"><div class="step-track"><span>0{{ index + 1 }}</span><ArrowRight v-if="index < workflowSteps.length - 1" :size="16" /></div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></li></ol>
      </div>
    </section>

    <section id="faq" class="section faq-section">
      <div class="landing-container faq-grid">
        <div data-reveal><span class="section-index">开始之前</span><h2>你可能还想知道。</h2><p>把适用范围说清楚，<br>再决定是否适合你。</p></div>
        <div class="faq-list" data-reveal><details v-for="question in questions" :key="question.title"><summary>{{ question.title }}<Plus :size="18" /></summary><div class="faq-answer"><p>{{ question.answer }}</p></div></details></div>
      </div>
    </section>

    <section class="final-cta">
      <div class="landing-container final-inner" data-reveal><BrandMark :size="46" decorative /><span class="section-index">课赛通 KST</span><h2>让下一次赛训，<br>从容一点。</h2><p>从了解工具开始，把自己的工作节奏找回来。</p><div class="hero-actions"><button class="button button-primary" type="button" :disabled="isDownloading" :aria-busy="isDownloading" @click="downloadDesktop"><MonitorDown :size="18" />{{ downloadLabel }}<ArrowRight :size="16" /></button><RouterLink class="text-link" to="/user/login">已有授权，登录 <ArrowUpRight :size="16" /></RouterLink></div><small>Windows 桌面端 · 使用需有效授权</small></div>
    </section>

    <footer class="landing-footer"><div class="landing-container"><div class="footer-top"><BrandLockup audience="login" /><div class="footer-links"><RouterLink :to="anchor('capabilities')">产品能力</RouterLink><RouterLink :to="anchor('faq')">常见问题</RouterLink><RouterLink to="/user/terms">服务条款</RouterLink><RouterLink to="/admin/login">内部运营</RouterLink></div></div><div class="footer-bottom"><span>© {{ currentYear }} 课赛通 KST</span><span>以亚马逊赛训为主 · 速卖通扩展验证中</span><span>DESIGNED FOR A CLEARER WORKFLOW</span></div></div></footer>
    <Transition name="download-notice"><div v-if="downloadState !== 'idle'" class="download-notice" :class="{ 'is-error': downloadState === 'error' }"><div><span v-if="isDownloading" class="download-spinner" aria-hidden="true"></span><CircleAlert v-else-if="downloadState === 'error'" :size="19" /><Check v-else :size="19" /><p id="desktop-download-feedback" :role="downloadState === 'error' ? 'alert' : 'status'" aria-atomic="true">{{ downloadFeedback }}</p></div><button v-if="downloadState === 'error'" type="button" @click="downloadDesktop">重试</button><button v-if="!isDownloading" class="notice-close" type="button" aria-label="关闭下载提示" @click="downloadState = 'idle'"><X :size="17" /></button></div></Transition>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleAlert, ClipboardCheck, Download, GraduationCap, Hand, History, Menu, MonitorDown, MousePointer2, Play, Plus, ScanLine, UserRound, UsersRound, X } from '@lucide/vue'
import BrandLockup from '@/components/brand/BrandLockup.vue'
import BrandMark from '@/components/brand/BrandMark.vue'
import LandingProductPreview from '@/components/landing/LandingProductPreview.vue'
import { downloadDesktopInstaller } from '@/runtime/desktop-download'

const currentYear = new Date().getFullYear()
const landingRoot = ref<HTMLElement | null>(null)
const mainContent = ref<HTMLElement | null>(null)
const navToggle = ref<HTMLButtonElement | null>(null)
const mobileNavOpen = ref(false)
const motionReady = ref(false)
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
  } catch {
    downloadState.value = 'error'
  }
}

let revealObserver: IntersectionObserver | undefined
let motionPreference: MediaQueryList | undefined
function configureMotion(): void {
  revealObserver?.disconnect()
  const elements = landingRoot.value?.querySelectorAll<HTMLElement>('[data-reveal]')
  if (!elements) return
  if (motionPreference?.matches || !('IntersectionObserver' in window)) {
    motionReady.value = false
    elements.forEach(element => element.classList.add('is-visible'))
    return
  }
  motionReady.value = true
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-visible')
      revealObserver?.unobserve(entry.target)
    }
  }, { threshold: 0.12 })
  elements.forEach(element => revealObserver?.observe(element))
}
onMounted(async () => {
  await nextTick()
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  configureMotion()
  motionPreference.addEventListener('change', configureMotion)
})
onBeforeUnmount(() => {
  revealObserver?.disconnect()
  motionPreference?.removeEventListener('change', configureMotion)
})

const workflowSteps = [
  { title: '了解适用场景', description: '确认要完成的任务，了解工具与演示的能力范围。' },
  { title: '确认并开通授权', description: '确认套餐权益、使用期限，以及设备或团队席位。' },
  { title: '安装与体验', description: '下载桌面端，通过演示熟悉流程，再安排受控试运行。' },
  { title: '执行、支持与复盘', description: '查看任务记录，通过工具帮助与问题反馈处理异常。' },
]
const questions = [
  { title: '课赛通适合谁？', answer: '当前主要服务参赛学生与代打团队。参赛学生使用个人工具箱，代打团队使用专业批量工作台。课程学员、指导教师、院校与培训机构属于次级验证场景；当前以亚马逊赛训为主，速卖通作为扩展验证方向。' },
  { title: '官网和桌面端有什么区别？', answer: '官网用于了解产品、查看适用场景和下载桌面端。已有授权可进入相应工作台使用可用的浏览器能力与演示；真实 Live 自动化需要 Windows 桌面端，不会在宣传页面启动。' },
  { title: '批量演示等于真实账号并发执行吗？', answer: '不等于。Demo 最多支持 50 个账号的逻辑并发演示，不会同时创建 50 个真实浏览器。Live 仍使用桌面端单 Runner 顺序执行，真实任务需要受控试运行；页面上的演示数据不是实际业务成果。' },
  { title: '下载后可以直接使用吗？套餐如何确定？', answer: '下载不代表已获得授权。使用时需有效授权，具体可用工具、期限、设备与席位范围以有效套餐配置为准。首次使用请先通过原有交付渠道确认适用范围和授权，本站不提供免费注册或在线支付。' },
  { title: '遇到登录验证或任务异常怎么办？', answer: '需要人工介入时，在任务现场完成确认，再选择继续或停止。真实执行结果以 Runner 上报为准，不以演示动画判断成功。可通过工作台的记录、工具帮助与问题反馈继续排查。' },
]
</script>

<style scoped>
.landing {
  --ink: #1b2940; --muted: #637086; --blue: #1565ff; --line: #e4e8ef;
  min-height: 100vh; overflow: clip; color: var(--ink); background: #fff;
  font-family: "Inter", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.landing *, .landing *::before, .landing *::after { box-sizing: border-box; }
.landing button, .landing a { -webkit-tap-highlight-color: transparent; }
.landing button { font-family: inherit; cursor: pointer; }
.landing a { text-decoration: none; }
.landing:focus, .landing .hero:focus { outline: none; }
.landing svg { flex-shrink: 0; }
.landing a:focus-visible, .landing button:focus-visible, .landing summary:focus-visible { outline: 3px solid #9bbdff; outline-offset: 5px; }
.landing button:disabled { opacity: .65; cursor: wait; }
.landing-container { width: min(1120px, calc(100% - 64px)); margin-inline: auto; }
.skip-link { position: fixed; top: -60px; left: 20px; z-index: 100; padding: 12px 18px; border-radius: 8px; color: #fff; background: var(--ink); }
.skip-link:focus { top: 12px; }
.landing-nav { position: sticky; top: 0; z-index: 30; height: 76px; border-bottom: 1px solid #edf0f4; background: rgb(255 255 255 / 94%); backdrop-filter: blur(16px); }
.nav-inner, .nav-links, .nav-actions { display: flex; align-items: center; }
.nav-inner { height: 100%; gap: 40px; }
.nav-brand { display: flex; }
.nav-brand :deep(.kst-lockup-logo) { width: 120px; height: 34px; }
.nav-brand :deep(.kst-lockup-subtitle) { display: none; }
.nav-links { gap: 26px; margin-inline: auto; }
.nav-links a, .nav-login { color: #566174; font-size: 13px; font-weight: 500; transition: color 160ms; }
.nav-links a:hover, .nav-login:hover { color: var(--blue); }
.nav-actions { gap: 25px; }
.nav-login { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.nav-download { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 15px; border: 1px solid #dce2eb; border-radius: 7px; background: #fff; color: var(--ink); font-size: 12px; font-weight: 600; transition: border-color 180ms, background 180ms; white-space: nowrap; }
.nav-download:hover { border-color: #b6c8e5; background: #f8faff; }
.nav-toggle { display: none; align-items: center; justify-content: center; width: 40px; height: 40px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); }
.hero { padding: 88px 0 0; background: linear-gradient(180deg, #fff 42%, #f5f8fc 100%); }
.hero-copy { text-align: center; }
.hero-eyebrow { display: inline-flex; align-items: center; gap: 10px; color: #66758a; font-size: 12px; letter-spacing: .06em; }
.hero-eyebrow > span { width: 6px; height: 6px; border-radius: 50%; background: var(--blue); }
.hero-eyebrow i { font-style: normal; color: #c1cad8; }
.hero h1 { margin: 25px 0 23px; font-size: clamp(42px, 5vw, 66px); font-weight: 600; letter-spacing: -.055em; line-height: 1.25; }
.hero h1 span { color: #5478b8; }
.hero-lead { color: var(--muted); font-size: 16px; line-height: 1.9; margin: 0; }
.hero-actions { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 14px; margin-top: 30px; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 46px; padding: 0 20px; border-radius: 8px; font-size: 13px; font-weight: 550; transition: transform 180ms ease, background 180ms ease, box-shadow 180ms ease; }
.button:hover { transform: translateY(-2px); }
.button:active { transform: translateY(0); }
.button-primary { border: 1px solid #125cea; color: #fff; background: var(--blue); box-shadow: 0 2px 3px #17376112, inset 0 1px #ffffff24; }
.button-primary:hover { background: #0d56dd; box-shadow: 0 5px 14px #1565ff20; }
.button-secondary { border: 1px solid var(--line); background: #fff; color: #4b596f; }
.button-secondary:hover { background: #f8faff; }
.hero-footnote { margin: 16px 0 0; color: #7b889a; font-size: 11px; }
.hero-footnote span { margin: 0 8px; }
.product-stage { position: relative; margin-top: 56px; scroll-margin-top: 95px; }
.hero-caption { display: flex; align-items: center; justify-content: space-between; padding-block: 23px 32px; font-size: 12px; color: #708199; }
.hero-caption i { margin-inline: 14px; color: #b9c5d6; font-style: normal; }
.section { padding-block: 106px; scroll-margin-top: 76px; }
.section-index { display: block; color: #748198; font-size: 11px; font-weight: 550; letter-spacing: .1em; }
.section-heading { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 64px; align-items: end; }
.section-heading .section-index { grid-column: 1 / -1; }
.landing h2 { margin: 17px 0 0; font-size: clamp(30px, 3.2vw, 42px); line-height: 1.35; font-weight: 550; letter-spacing: -.04em; }
.landing h2 span { color: #8390a3; }
.section-heading h2 { margin: 0; }
.section-heading > p, .workflow-heading > p, .faq-grid > div > p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.9; }
.section-heading > p { padding-bottom: 4px; }
.audience-columns { display: grid; grid-template-columns: 1fr 1fr; margin-top: 53px; border-top: 1px solid var(--line); }
.audience-columns article { padding-top: 36px; }
.audience-personal { padding-right: 64px; }
.audience-team { padding-left: 64px; border-left: 1px solid var(--line); }
.audience-label { display: flex; align-items: center; gap: 9px; font-size: 13px; color: #37547f; }
.audience-label span { margin-left: auto; font-size: 10px; letter-spacing: .12em; color: #98a4b6; }
.audience-columns h3 { margin: 29px 0 16px; font-size: 24px; font-weight: 550; letter-spacing: -.025em; line-height: 1.55; }
.audience-columns article > p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.9; }
.feature-list { display: grid; gap: 14px; list-style: none; padding: 0; margin: 29px 0 31px; }
.feature-list li { display: flex; align-items: center; gap: 10px; color: #4c5d76; font-size: 13px; }
.feature-list svg { color: #839fc9; }
.text-link { display: inline-flex; align-items: center; gap: 8px; color: #375985; font-size: 13px; font-weight: 550; }
.text-link svg { transition: transform 180ms; }
.text-link:hover svg { transform: translate(2px, -2px); }
.secondary-audience { display: flex; align-items: center; gap: 17px; margin-top: 47px; padding: 23px 26px; border-radius: 8px; background: #f6f8fb; color: #6981a4; }
.secondary-audience p { display: grid; gap: 6px; margin: 0; }
.secondary-audience strong { color: #425875; font-size: 13px; font-weight: 550; }
.secondary-audience p span { color: #77859a; font-size: 12px; line-height: 1.65; }
.secondary-audience a { margin-left: auto; color: #526e94; padding: 8px; }
.control-section { padding: 84px 0; background: #15243b; color: #fff; }
.control-grid { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 88px; }
.control-section .section-index { color: #9aabc3; }
.control-section h2 { font-size: 35px; line-height: 1.5; }
.control-section h2 span { color: #8daddb; }
.control-copy > p { margin: 24px 0 0; color: #b2bfd1; font-size: 14px; line-height: 1.95; }
.control-principles { display: flex; flex-wrap: wrap; gap: 23px; margin-top: 31px; color: #bdcde3; font-size: 12px; }
.control-principles span { display: inline-flex; align-items: center; gap: 7px; }
.process-illustration { border: 1px solid #36465d; border-radius: 14px; padding: 25px 28px 20px; background: #1a2b44; box-shadow: 0 18px 50px #09152630; }
.process-topline { display: flex; justify-content: space-between; gap: 12px; color: #a4b7d1; font-size: 11px; margin-bottom: 23px; }
.process-topline span:last-child { color: #8298b4; }
.process-step { display: flex; gap: 13px; align-items: center; min-height: 66px; }
.process-icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border: 1px solid #425571; border-radius: 9px; background: #203650; color: #a0b8d9; }
.process-step strong { display: block; font-size: 13px; font-weight: 550; color: #e2ebf7; }
.process-step small { display: block; margin-top: 5px; font-size: 11px; color: #91a6c2; }
.process-check { margin-left: auto; color: #83bfae; }
.process-connector { height: 22px; margin-left: 19px; border-left: 1px solid #415778; position: relative; overflow: hidden; }
.process-connector span { position: absolute; width: 1px; height: 10px; left: 0; top: 0; opacity: 0; background: #8aaedf; }
.process-illustration.is-visible .process-connector span { animation: trace-flow 2.2s ease-in-out 2; }
.process-attention { padding: 10px 12px; margin: 0 -12px; border: 1px solid #726049; background: #3a342f; border-radius: 9px; }
.process-attention .process-icon { color: #d7bc94; background: #4a4035; border-color: #6c5b45; }
.process-status { margin-left: auto; color: #dcc19a; font-size: 10px; white-space: nowrap; }
.process-choices { display: flex; gap: 20px; padding: 12px 0 0 52px; font-size: 10px; color: #9aacbf; }
.process-choices span:first-child { display: flex; align-items: center; gap: 5px; color: #c7d7ee; }
.process-note { margin: 22px 0 0; border-top: 1px solid #34455d; padding-top: 15px; font-size: 11px; color: #98acc6; line-height: 1.7; }
.workflow-heading { display: flex; align-items: end; justify-content: space-between; gap: 40px; }
.workflow-steps { list-style: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 36px; margin: 55px 0 0; padding: 0; }
.step-track { display: flex; align-items: center; gap: 20px; color: #9caec6; padding-top: 22px; border-top: 1px solid #d9e1ec; }
.step-track span { color: #7287a8; font-size: 12px; font-variant-numeric: tabular-nums; }
.step-track svg { margin-left: auto; }
.workflow-steps h3 { margin: 22px 0 12px; font-size: 17px; font-weight: 550; }
.workflow-steps p { color: var(--muted); font-size: 13px; line-height: 1.9; margin: 0; }
.faq-section { background: #f8f9fb; border-top: 1px solid #edf0f4; border-bottom: 1px solid #edf0f4; padding-block: 82px; }
.faq-grid { display: grid; grid-template-columns: .8fr 1.2fr; gap: 80px; align-items: start; }
.faq-grid h2 { font-size: 29px; margin-bottom: 18px; }
.faq-list details { border-bottom: 1px solid #dfe5ed; }
.faq-list details:first-child { border-top: 1px solid #dfe5ed; }
.faq-list summary { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 23px 0; color: #374a64; font-size: 14px; font-weight: 500; list-style: none; cursor: pointer; }
.faq-list summary::-webkit-details-marker { display: none; }
.faq-list summary svg { color: #8192a9; transition: transform 220ms ease; }
.faq-list details[open] summary svg { transform: rotate(45deg); }
.faq-list details[open] .faq-answer { animation: answer-in 200ms ease-out; }
.faq-answer p { margin: 0; padding-bottom: 22px; color: #6b7c93; font-size: 13px; line-height: 1.95; }
.final-cta { padding: 90px 0 85px; background: #fff; text-align: center; }
.final-inner > .section-index { margin-top: 22px; }
.final-inner h2 { font-size: 43px; margin-top: 19px; }
.final-inner > p { margin-top: 21px; font-size: 14px; color: var(--muted); }
.final-inner .hero-actions { gap: 28px; }
.final-inner > small { display: block; margin-top: 18px; color: #8492a6; font-size: 11px; }
.landing-footer { border-top: 1px solid var(--line); background: #fff; padding: 35px 0 26px; }
.footer-top, .footer-bottom, .footer-links { display: flex; align-items: center; justify-content: space-between; gap: 22px; }
.footer-top :deep(.kst-lockup-logo) { width: 115px; height: 35px; }
.footer-top :deep(.kst-lockup-subtitle) { max-width: 126px; font-size: 10px; font-weight: 500; }
.footer-links { gap: 24px; }
.footer-links a { color: #6c7c92; font-size: 12px; }
.footer-links a:hover { color: var(--blue); }
.footer-bottom { margin-top: 29px; padding-top: 23px; border-top: 1px solid #edf0f4; color: #8391a5; font-size: 10px; }
.footer-bottom span:last-child { font-size: 8px; letter-spacing: .08em; }
.download-notice { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 50; width: max-content; max-width: calc(100% - 32px); display: flex; align-items: center; gap: 20px; padding: 15px 18px; border: 1px solid #d9e3f1; border-radius: 10px; color: #334f76; background: #fff; box-shadow: 0 8px 36px #15356c20; }
.download-notice > div { display: flex; gap: 11px; align-items: center; }
.download-notice p { margin: 0; font-size: 13px; line-height: 1.6; }
.download-notice button { border: 0; background: transparent; color: var(--blue); font-size: 12px; padding: 6px; white-space: nowrap; }
.download-notice .notice-close { color: #7d8ba0; display: grid; place-items: center; }
.download-notice.is-error { border-color: #e6d9ca; }
.download-notice.is-error > div > svg { color: #a27a42; }
.download-spinner { width: 16px; height: 16px; border: 2px solid #dae6fc; border-top-color: var(--blue); border-radius: 50%; animation: spinner .8s linear infinite; }
.download-notice-enter-active, .download-notice-leave-active { transition: opacity 180ms, transform 180ms; }
.download-notice-enter-from, .download-notice-leave-to { opacity: 0; transform: translate(-50%, 8px); }
.motion-ready [data-reveal] { opacity: 0; transform: translateY(20px); transition: opacity 600ms ease, transform 600ms cubic-bezier(.2,.65,.3,1); transition-delay: var(--reveal-delay, 0ms); }
.motion-ready [data-reveal].is-visible { opacity: 1; transform: translateY(0); }
@keyframes trace-flow { 0%,15% { transform: translateY(-12px); opacity: 0; } 35%,70% { opacity: 1; } 100% { transform: translateY(32px); opacity: 0; } }
@keyframes answer-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
@keyframes spinner { to { transform: rotate(360deg); } }
@media (max-width: 1060px) {
  .nav-inner { gap: 25px; }.nav-links { gap: 18px; }.nav-actions { gap: 18px; }.nav-login { display: none; }
  .audience-personal { padding-right: 40px; }.audience-team { padding-left: 40px; }.control-grid { gap: 45px; }.control-section h2 { font-size: 30px; }
  .faq-grid { gap: 45px; }.workflow-steps { gap: 24px; }
}
@media (max-width: 760px) {
  .landing-container { width: calc(100% - 40px); }.landing-nav { height: 66px; }.nav-inner { gap: 18px; }.nav-brand :deep(.kst-lockup-logo) { width: 109px; }
  .nav-actions { margin-left: auto; gap: 8px; }.nav-download { height: 37px; padding: 0 11px; font-size: 11px; }.nav-toggle { display: flex; }
  .nav-links { display: none; position: absolute; top: 65px; left: 0; right: 0; margin: 0; padding: 12px 20px 20px; gap: 0; border-bottom: 1px solid var(--line); background: #fff; box-shadow: 0 14px 18px #25354d09; }
  .nav-links.is-open { display: flex; flex-direction: column; align-items: stretch; animation: answer-in 180ms ease-out; }.nav-links a { padding: 14px; font-size: 14px; }
  .hero { padding-top: 57px; }.hero-eyebrow { font-size: 10px; gap: 7px; letter-spacing: 0; }.hero h1 { margin-top: 23px; font-size: clamp(34px, 6.8vw, 49px); letter-spacing: -.055em; line-height: 1.32; }
  .hero-lead { max-width: 480px; margin-inline: auto; font-size: 14px; line-height: 1.9; }.desktop-break { display: none; }.hero-actions { gap: 11px; margin-top: 26px; }.button { padding: 0 17px; font-size: 12px; min-height: 44px; }
  .product-stage { margin-top: 39px; scroll-margin-top: 84px; }.hero-caption { font-size: 10px; gap: 10px; padding-block: 20px 25px; }.hero-caption i { margin-inline: 6px; }
  .section { padding-block: 67px; scroll-margin-top: 66px; }.section-heading { grid-template-columns: 1fr; gap: 18px; }.section-heading > p { font-size: 14px; }.landing h2 { font-size: 31px; }
  .audience-columns { grid-template-columns: 1fr; margin-top: 34px; }.audience-personal { padding-right: 0; padding-bottom: 33px; }.audience-team { border-left: 0; border-top: 1px solid var(--line); padding-left: 0; }
  .audience-columns article { padding-top: 28px; }.audience-columns h3 { font-size: 22px; margin-top: 23px; }.feature-list { margin-block: 23px; gap: 12px; }.secondary-audience { margin-top: 34px; gap: 12px; padding: 20px 17px; }.secondary-audience > svg { display: none; }.secondary-audience a { padding-right: 0; }
  .control-section { padding-block: 65px; }.control-grid { grid-template-columns: 1fr; gap: 35px; }.control-section h2 { font-size: 30px; }.control-copy > p { font-size: 14px; }.process-illustration { max-width: 500px; width: 100%; margin-inline: auto; padding: 21px 23px; }
  .workflow-heading { flex-direction: column; align-items: flex-start; gap: 20px; }.workflow-heading > p { font-size: 14px; }.workflow-steps { grid-template-columns: 1fr 1fr; gap: 30px 25px; margin-top: 34px; }.workflow-steps h3 { font-size: 16px; margin-top: 18px; }.workflow-steps p { font-size: 13px; }
  .faq-grid { grid-template-columns: 1fr; gap: 30px; }.faq-grid > div > p { font-size: 14px; }.faq-list summary { font-size: 13px; gap: 14px; padding-block: 21px; }.faq-answer p { font-size: 13px; }
  .final-cta { padding-block: 65px; }.final-inner h2 { font-size: 36px; }.final-inner .hero-actions { gap: 23px; }.final-inner > p { font-size: 13px; }
  .footer-top { align-items: flex-start; flex-direction: column; gap: 22px; }.footer-links { flex-wrap: wrap; gap: 23px; }.footer-bottom { align-items: flex-start; flex-direction: column; gap: 10px; padding-top: 20px; margin-top: 22px; }.footer-bottom span:last-child { display: none; }
  .download-notice { gap: 9px; padding: 13px; bottom: 16px; }.download-notice > div { gap: 8px; }.download-notice p { font-size: 12px; }
}
@media (max-width: 400px) {
  .hero-actions { flex-direction: column; }.hero-actions .button { width: 100%; max-width: 290px; }.hero-caption { flex-direction: column; align-items: flex-start; gap: 6px; }.hero h1 { font-size: 34px; }
  .nav-download { padding-inline: 9px; }.nav-download svg { display: none; }.nav-brand :deep(.kst-lockup-logo) { width: 101px; }
}
@media (prefers-reduced-motion: reduce) {
  .landing *, .landing *::before, .landing *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  .motion-ready [data-reveal] { opacity: 1; transform: none; }.button:hover, .text-link:hover svg { transform: none; }
}
</style>
