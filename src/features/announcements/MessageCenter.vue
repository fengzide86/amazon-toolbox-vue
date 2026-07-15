<template>
  <div class="message-center">
    <button class="message-trigger" type="button" :aria-label="`消息中心，${store.unreadCount} 条未读`" @click="openDrawer">
      <Bell :size="17" />
      <span v-if="store.unreadCount" class="message-count">{{ store.unreadCount > 99 ? '99+' : store.unreadCount }}</span>
    </button>

    <Transition name="drawer-fade">
      <div v-if="open" class="drawer-layer" @mousedown.self="open = false">
        <aside class="message-drawer" role="dialog" aria-modal="true" aria-labelledby="message-center-title">
          <header>
            <div><p>MESSAGE CENTER</p><h2 id="message-center-title">消息中心</h2></div>
            <button type="button" aria-label="关闭消息中心" @click="open = false"><X :size="18" /></button>
          </header>
          <nav aria-label="消息分类">
            <button v-for="option in filters" :key="option.value" type="button" :class="{ active: filter === option.value }" @click="filter = option.value">{{ option.label }}</button>
          </nav>
          <div v-if="store.loading" class="message-empty">正在读取消息…</div>
          <div v-else-if="!filteredItems.length" class="message-empty">这里暂时没有消息</div>
          <div v-else class="message-list">
            <article v-for="item in filteredItems" :key="`${item.id}-${item.revision}`" :class="{ unread: !item.is_read }" @click="store.read(item)">
              <div class="message-meta"><span>{{ categoryLabel(item.category) }}</span><time>{{ formatDate(item.published_at || item.created_at) }}</time></div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.content }}</p>
              <button v-if="!item.is_dismissed" type="button" @click.stop="store.dismiss(item)">不再提示</button>
            </article>
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bell, X } from '@lucide/vue'

import { useAnnouncementStore } from './store'
import type { Announcement } from './model'

type Filter = 'all' | Announcement['category']

const store = useAnnouncementStore()
const open = ref(false)
const filter = ref<Filter>('all')
const filters: Array<{ label: string; value: Filter }> = [
  { label: '全部', value: 'all' }, { label: '系统', value: 'system' },
  { label: '更新', value: 'update' }, { label: '维护', value: 'maintenance' },
]
const filteredItems = computed(() => filter.value === 'all' ? store.items : store.items.filter(item => item.category === filter.value))

async function openDrawer(): Promise<void> {
  open.value = true
  await store.load(true)
}
function categoryLabel(category: Announcement['category']): string {
  return ({ system: '系统', update: '版本', activity: '活动', maintenance: '维护' })[category]
}
function formatDate(value?: string | null): string {
  return value ? new Date(value).toLocaleDateString('zh-CN') : ''
}

onMounted(() => store.load().catch(() => undefined))
</script>

<style scoped>
.message-trigger{position:relative;display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--color-border);border-radius:10px;color:var(--studio-text-muted);background:var(--color-surface);cursor:pointer}.message-trigger:hover{color:var(--color-primary);background:var(--color-primary-soft)}
.message-count{position:absolute;top:-5px;right:-6px;min-width:18px;height:18px;padding:0 4px;border:2px solid var(--color-surface);border-radius:9px;color:#fff;background:var(--color-danger);font-size:9px;font-weight:800;line-height:14px;text-align:center}
.drawer-layer{position:fixed;inset:0;z-index:3000;background:rgba(24,32,51,.22)}.message-drawer{position:absolute;top:0;right:0;width:min(430px,100vw);height:100vh;padding:24px;background:var(--color-surface);box-shadow:-22px 0 60px rgba(24,32,51,.14);overflow:auto}.message-drawer>header{display:flex;align-items:flex-start;justify-content:space-between}.message-drawer header p{margin:0;color:var(--color-accent);font-size:10px;font-weight:800;letter-spacing:.15em}.message-drawer h2{margin:4px 0 0;font-size:22px}.message-drawer header button{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:9px;color:var(--studio-text-muted);background:transparent;cursor:pointer}.message-drawer nav{display:flex;gap:6px;margin:24px 0 16px;padding-bottom:14px;border-bottom:1px solid var(--color-border)}.message-drawer nav button{padding:7px 12px;border:0;border-radius:8px;color:var(--studio-text-muted);background:transparent;font-size:12px;cursor:pointer}.message-drawer nav button.active{color:var(--color-primary);background:var(--color-primary-soft);font-weight:700}.message-list{display:grid;gap:10px}.message-list article{position:relative;padding:15px;border:1px solid var(--color-border);border-radius:13px;background:var(--color-surface);cursor:pointer}.message-list article.unread{border-left:3px solid var(--color-primary);background:linear-gradient(90deg,var(--color-primary-soft),var(--color-surface) 24%)}.message-meta{display:flex;justify-content:space-between;color:var(--studio-text-muted);font-size:10px}.message-meta span{color:var(--color-accent);font-weight:800}.message-list h3{margin:8px 0 5px;font-size:14px}.message-list p{display:-webkit-box;margin:0;color:var(--studio-text-muted);font-size:12px;line-height:1.6;overflow:hidden;-webkit-line-clamp:3;-webkit-box-orient:vertical;white-space:pre-wrap}.message-list article>button{margin-top:10px;padding:0;border:0;color:var(--color-primary);background:transparent;font-size:11px;cursor:pointer}.message-empty{padding:54px 0;color:var(--studio-text-muted);font-size:13px;text-align:center}.drawer-fade-enter-active,.drawer-fade-leave-active{transition:opacity .18s ease}.drawer-fade-enter-active .message-drawer,.drawer-fade-leave-active .message-drawer{transition:transform .22s ease}.drawer-fade-enter-from,.drawer-fade-leave-to{opacity:0}.drawer-fade-enter-from .message-drawer,.drawer-fade-leave-to .message-drawer{transform:translateX(24px)}@media(prefers-reduced-motion:reduce){.drawer-fade-enter-active,.drawer-fade-leave-active,.drawer-fade-enter-active .message-drawer,.drawer-fade-leave-active .message-drawer{transition:none}}
</style>
