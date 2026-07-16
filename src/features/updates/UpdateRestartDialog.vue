<template>
  <Transition name="restart-fade">
    <div v-if="visible" class="restart-overlay" role="dialog" aria-modal="true" aria-labelledby="restart-title">
      <section class="restart-card">
        <div class="restart-icon"><CircleCheck :size="24" /></div>
        <p>UPDATE READY</p>
        <h2 id="restart-title">更新已经准备好了</h2>
        <span>重启后将使用 v{{ store.state.availableVersion }}，不会影响已经完成的工作。</span>
        <div>
          <button type="button" class="secondary" @click="defer">退出时安装</button>
          <button type="button" class="primary" autofocus @click="store.install">立即重启</button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { CircleCheck } from '@lucide/vue'
import { useUpdateStore } from './store'

const store = useUpdateStore()
const route = useRoute()
const visible = computed(() => !['UserLogin', 'AdminLogin'].includes(String(route.name)) && store.shouldPromptRestart)
async function defer(): Promise<void> { await store.deferInstall() }
</script>

<style scoped>
.restart-overlay{position:fixed;inset:0;z-index:var(--z-dialog);display:grid;place-items:center;padding:20px;background:rgba(24,32,51,.28);backdrop-filter:blur(5px)}.restart-card{width:min(440px,100%);padding:28px;border:1px solid var(--color-border);border-radius:18px;background:var(--color-surface);box-shadow:var(--shadow-overlay);text-align:center}.restart-icon{width:48px;height:48px;display:grid;place-items:center;margin:0 auto 14px;border-radius:14px;color:var(--color-success);background:var(--color-success-soft)}.restart-card>p{margin:0;color:var(--color-premium);font-size:var(--type-micro);font-weight:800;letter-spacing:.14em}.restart-card h2{margin:7px 0 9px;color:var(--color-text);font-size:22px}.restart-card>span{display:block;color:var(--color-text-secondary);font-size:var(--type-control);line-height:1.65}.restart-card>div:last-child{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.restart-card button{min-height:40px;padding:0 16px;border-radius:10px;font:700 var(--type-control)/1 var(--font-family);cursor:pointer}.restart-card .secondary{border:1px solid var(--color-border);color:var(--color-text-secondary);background:var(--color-surface)}.restart-card .primary{border:1px solid var(--color-primary);color:#fff;background:var(--color-primary)}.restart-fade-enter-active,.restart-fade-leave-active{transition:opacity var(--motion-fast)}.restart-fade-enter-from,.restart-fade-leave-to{opacity:0}@media(prefers-reduced-motion:reduce){.restart-fade-enter-active,.restart-fade-leave-active{transition:none}}
</style>
