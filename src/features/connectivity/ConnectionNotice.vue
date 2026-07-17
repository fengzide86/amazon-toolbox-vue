<template>
  <div v-if="connection.shouldWarn" class="connection-notice" role="status" aria-live="polite">
    <WifiOff :size="17" aria-hidden="true" />
    <div>
      <strong>{{ isBusiness ? '连接不稳定，本地处理继续' : '连接不稳定，正在自动恢复' }}</strong>
      <span>{{ isBusiness ? '恢复连接后，执行状态会自动同步。' : '无需重复操作，恢复后提示会自动消失。' }}</span>
    </div>
    <button type="button" @click="retry"><RefreshCw :size="15" />重新连接</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw, WifiOff } from '@lucide/vue'
import { useConnectionStore } from '@/stores/connection'

const route = useRoute()
const connection = useConnectionStore()
const isBusiness = computed(() => route.path.startsWith('/business'))

function retry(): void {
  void connection.probe()
}
</script>

<style scoped>
.connection-notice{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;margin:0 0 16px;padding:12px 14px;border:1px solid rgba(183,121,31,.22);border-radius:12px;color:var(--color-warning);background:#fff8eb}.connection-notice>div{min-width:0;display:grid;gap:2px}.connection-notice strong{font-size:var(--type-control);color:var(--color-text)}.connection-notice span{font-size:var(--type-meta);line-height:1.5;color:var(--color-text-secondary)}.connection-notice button{height:36px;display:flex;align-items:center;gap:6px;padding:0 11px;border:1px solid rgba(183,121,31,.24);border-radius:9px;color:var(--color-warning);background:#fff;font-size:var(--type-control);cursor:pointer}
@media(max-width:640px){.connection-notice{grid-template-columns:auto 1fr}.connection-notice button{grid-column:2;justify-self:start}}
</style>
