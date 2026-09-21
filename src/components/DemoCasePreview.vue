<template>
  <section
    class="demo-case"
    aria-label="工具流程示例"
  >
    <header><span class="demo-label">流程示例 · 非真实数据</span><span>{{ platform }}</span></header>
    <div class="demo-body">
      <small>{{ stageLabel || '准备演示' }}</small>
      <h2>{{ preview.heading }}</h2>
      <p>这里展示输入、处理和结果之间的关系，不连接外部平台。</p>
      <dl>
        <div
          v-for="field in preview.fields"
          :key="field.label"
        >
          <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
        </div>
      </dl>
      <div
        class="demo-output"
        :class="{ complete: completed }"
      >
        <strong>{{ completed ? '示例流程已结束' : '预期输出说明' }}</strong><p>{{ preview.output }}</p>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { demoPreviewFor } from '@/features/automation/demoPreview'
const props = defineProps<{ toolName: string; platform: string; stageLabel?: string; completed: boolean }>()
const preview = computed(() => demoPreviewFor(props.toolName))
</script>
<style scoped>
.demo-case { width: 100%; height: 100%; overflow: auto; background: var(--color-surface-soft); }
.demo-case header { display: flex; justify-content: space-between; gap: 12px; padding: 16px 24px; background: white; border-bottom: 1px solid var(--color-border); font-size: 12px; color: var(--color-text-secondary); }
.demo-label { color: var(--color-primary); font-weight: 700; }
.demo-body { max-width: 680px; padding: clamp(20px, 4vw, 48px); margin: auto; }
.demo-body small { color: var(--color-primary); font-size: 12px; }
.demo-body h2 { margin: 12px 0; font-size: clamp(18px, 2vw, 26px); }
.demo-body p { color: var(--color-text-secondary); font-size: 13px; line-height: 1.8; }
dl { margin: 24px 0; padding: 8px 20px; background: white; border: 1px solid var(--color-border); border-radius: 12px; }
dl div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 12px; padding: 16px 0; font-size: 13px; }
dl div + div { border-top: 1px solid var(--color-border); }
dt { color: var(--color-text-secondary); } dd { margin: 0; overflow-wrap: anywhere; }
.demo-output { padding: 18px 20px; border-radius: 12px; background: var(--color-primary-soft); border-left: 3px solid var(--color-primary); }
.demo-output strong { font-size: 13px; } .demo-output p { margin: 7px 0 0; }
.complete { background: var(--color-success-soft); border-left-color: var(--color-success); }
</style>
