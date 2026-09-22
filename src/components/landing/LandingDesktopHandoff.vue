<template>
  <dialog ref="dialog" class="desktop-handoff" aria-labelledby="handoff-title" @cancel.prevent="close" @close="onClose" @click="onBackdrop">
    <header><h2 id="handoff-title">在 Windows 电脑上继续</h2><button type="button" aria-label="关闭安装说明" @click="close">×</button></header>
    <p>你现在使用的是手机或平板。课赛通桌面端需要 Windows 电脑，手机不能运行安装包。</p>
    <ol><li>复制下面的安装包链接，发送到自己的电脑。</li><li>在电脑浏览器打开链接，下载并安装。</li><li>使用已有授权登录；没有授权请先联系交付方。</li></ol>
    <label for="desktop-installer-link">电脑安装包链接</label>
    <input id="desktop-installer-link" ref="linkInput" :value="url" readonly @focus="linkInput?.select()" />
    <button class="copy-link" type="button" @click="copy">{{ copied ? '链接已复制' : '复制电脑下载链接' }}</button>
    <p role="status" class="copy-status">{{ message }}</p>
  </dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps<{ open: boolean; url: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const linkInput = ref<HTMLInputElement | null>(null)
const copied = ref(false)
const closingFromOwner = ref(false)
const message = ref('链接只用于下载安装，不会自动开通授权。')
watch(() => props.open, open => {
  if (open && dialog.value && !dialog.value.open) {
    copied.value = false
    message.value = '链接只用于下载安装，不会自动开通授权。'
    dialog.value.showModal()
  } else if (!open) dialog.value?.close()
}, { flush: 'post' })
function close(): void { closingFromOwner.value = true; emit('close'); dialog.value?.close() }
function onClose(): void {
  if (closingFromOwner.value) { closingFromOwner.value = false; return }
  if (!dialog.value?.open) emit('close')
}
function onBackdrop(event: MouseEvent): void {
  if (event.target !== dialog.value || !dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    message.value = '已复制。发送到自己的电脑后，在电脑浏览器打开。'
  } catch {
    linkInput.value?.focus()
    linkInput.value?.select()
    message.value = '浏览器未允许自动复制，请长按上方链接手动复制。'
  }
}
onBeforeUnmount(() => dialog.value?.close())
</script>

<style scoped>
.desktop-handoff { width: min(500px, calc(100vw - 32px)); max-height: calc(100dvh - 40px); overflow-y: auto; margin: auto; padding: 26px; border: 1px solid #e2e9f3; border-radius: 20px; background: white; color: #18263f; box-shadow: 0 24px 80px #13274b26; font-family: inherit; }
.desktop-handoff::backdrop { background: #172b4657; backdrop-filter: blur(5px); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { margin: 0; font-size: 22px; } header button { border: 0; background: #f3f6fb; color: #506584; width: 36px; height: 36px; border-radius: 50%; font-size: 25px; cursor: pointer; }
p, ol { color: #64738b; font-size: 13px; line-height: 1.85; } ol { padding-left: 20px; margin: 18px 0; } li + li { margin-top: 8px; }
label { display: block; margin-bottom: 8px; color: #405978; font-size: 12px; }
input { box-sizing: border-box; width: 100%; min-width: 0; padding: 12px; border: 1px solid #dce6f5; border-radius: 8px; color: #405978; background: #f7faff; font-size: 12px; }
.copy-link { width: 100%; min-height: 44px; margin-top: 14px; border: 0; border-radius: 8px; color: white; background: #1565ff; cursor: pointer; font: inherit; font-size: 13px; }
.copy-status { min-height: 44px; margin: 12px 0 0; font-size: 11px; }
button:focus-visible, input:focus-visible { outline: 3px solid #7ba8ff; outline-offset: 3px; }
</style>
