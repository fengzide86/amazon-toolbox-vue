<template>
  <div class="release-page">
    <PageHeader title="应用更新" subtitle="先完整校验发布文件，再由你确认把版本开放给桌面客户端">
      <template #actions>
        <el-button type="primary" @click="drawerOpen = true">暂存新版本</el-button>
      </template>
    </PageHeader>

    <section class="release-guide" aria-label="发布流程">
      <article><span>01</span><div><strong>选择发布文件</strong><p>系统会自动识别版本并核对安装文件。</p></div></article>
      <article><span>02</span><div><strong>人工确认</strong><p>暂存不会触达客户，可先核对文件和版本信息。</p></div></article>
      <article><span>03</span><div><strong>原子发布</strong><p>清单最后切换，客户端不会读到半发布状态。</p></div></article>
    </section>
    <AsyncStateNotice :state="loadState" :message="loadError" loading-text="正在加载更新版本…" @retry="load" />

    <AppSurface class="release-list">
      <DataToolbar label="桌面版本">
        <template #info><span>{{ releases.length }} 个版本</span></template>
        <template #actions><el-button :loading="loading" @click="load">刷新</el-button></template>
      </DataToolbar>

      <el-table v-if="loadState !== 'loading' && loadState !== 'error'" v-loading="loading" :data="releases" row-key="version">
        <el-table-column label="版本" min-width="150">
          <template #default="{ row }"><div class="version-cell"><strong>v{{ row.version }}</strong><small>{{ row.files.length }} 个发布文件</small></div></template>
        </el-table-column>
        <el-table-column v-if="!compact" label="文件" min-width="320">
          <template #default="{ row }"><div class="file-list"><span v-for="file in row.files" :key="file.name">{{ file.name }} · {{ formatBytes(file.size) }}</span></div></template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><StatusBadge :status="row.status === 'published' ? 'completed' : 'warning'">{{ row.status === 'published' ? '已发布' : '待发布' }}</StatusBadge></template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button v-if="row.status === 'staged'" size="small" type="primary" :loading="publishingVersion === row.version" :disabled="Boolean(publishingVersion || deletingVersion)" @click="publish(row)">确认发布</el-button>
              <el-dropdown v-if="row.status === 'staged'" trigger="click" @command="remove(row)">
                <el-button size="small" :loading="deletingVersion === row.version" :disabled="Boolean(publishingVersion || deletingVersion)">更多</el-button>
                <template #dropdown><el-dropdown-menu><el-dropdown-item command="remove">删除暂存</el-dropdown-item></el-dropdown-menu></template>
              </el-dropdown>
              <span v-else class="published-note">客户端可检查到</span>
            </div>
          </template>
        </el-table-column>
        <template #empty><EmptyState :icon="PackageCheck" title="还没有桌面版本" description="上传完整的 electron-builder 发布文件后再确认发布" /></template>
      </el-table>
    </AppSurface>

    <el-drawer v-model="drawerOpen" size="min(560px, 94vw)" :close-on-click-modal="!uploading" :close-on-press-escape="!uploading">
      <template #header><div class="drawer-title"><p>SECURE RELEASE</p><h2>暂存桌面更新</h2></div></template>
      <el-form label-position="top">
        <el-form-item label="发布文件">
          <el-upload v-model:file-list="fileList" drag multiple :auto-upload="false" :disabled="uploading" accept=".exe,.blockmap,.yml">
            <div class="upload-copy"><UploadCloud :size="24" /><strong>一次选择生成的发布文件</strong><small>至少包含安装文件和版本清单，差分文件会自动识别</small></div>
          </el-upload>
        </el-form-item>
        <div class="security-note"><ShieldCheck :size="18" /><p><strong>发布前硬校验</strong><span>版本、文件名、大小、SHA-512 及 YAML 引用必须全部一致。</span></p></div>
      </el-form>
      <template #footer><div class="drawer-actions"><el-button :disabled="uploading" @click="drawerOpen = false">取消</el-button><el-button type="primary" :loading="uploading" @click="stage">上传并校验</el-button></div></template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { UploadUserFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PackageCheck, ShieldCheck, UploadCloud } from '@lucide/vue'

import AppSurface from '@/components/AppSurface.vue'
import DataToolbar from '@/components/DataToolbar.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import AsyncStateNotice from '@/components/AsyncStateNotice.vue'
import { useCompactLayout } from '@/composables/useCompactLayout'
import { listUpdateReleases, publishUpdateRelease, removeStagedUpdateRelease, stageUpdateRelease, type UpdateRelease } from '@/features/updates/release-api'
import { failedDataState, settledDataState, type AsyncDataState } from '@/features/async/state'

const compact = useCompactLayout()
const loading = ref(false)
const uploading = ref(false)
const publishingVersion = ref('')
const deletingVersion = ref('')
const drawerOpen = ref(false)
const releases = ref<UpdateRelease[]>([])
const loadState = ref<AsyncDataState>('loading')
const loadError = ref('')
const fileList = ref<UploadUserFile[]>([])

async function load(): Promise<void> {
  loading.value = true
  loadState.value = releases.value.length ? 'data' : 'loading'
  loadError.value = ''
  try {
    releases.value = await listUpdateReleases()
    loadState.value = settledDataState(releases.value.length)
  }
  catch (error) {
    loadError.value = error instanceof Error ? error.message : '更新版本加载失败'
    loadState.value = failedDataState(releases.value.length > 0)
  }
  finally { loading.value = false }
}

async function validateSelection(): Promise<{ files: File[]; version: string } | null> {
  const files = fileList.value.flatMap(item => item.raw ? [item.raw as File] : [])
  const manifest = files.find(file => file.name.toLowerCase() === 'latest.yml')
  if (!manifest || !files.some(file => file.name.toLowerCase().endsWith('.exe'))) { ElMessage.warning('请同时选择版本清单和 Windows 安装文件'); return null }
  const version = (await manifest.text()).match(/^version:\s*["']?([^\s"']+)/m)?.[1]
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) { ElMessage.warning('版本清单中没有有效的版本号'); return null }
  return { files, version }
}

async function stage(): Promise<void> {
  const selection = await validateSelection()
  if (!selection) return
  uploading.value = true
  try {
    await stageUpdateRelease(selection.files, selection.version)
    ElMessage.success(`v${selection.version} 已暂存并完成一致性校验`)
    drawerOpen.value = false
    fileList.value = []
    await load()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '暂存失败') }
  finally { uploading.value = false }
}

async function publish(raw: unknown): Promise<void> {
  const row = raw as UpdateRelease
  try {
    await ElMessageBox.confirm(`发布 v${row.version} 后，桌面客户端即可检查到该版本。`, '确认发布更新', { confirmButtonText: '确认发布', cancelButtonText: '继续核对', type: 'warning' })
    publishingVersion.value = row.version
    await publishUpdateRelease(row.version)
    ElMessage.success(`v${row.version} 已发布`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '发布失败，请刷新后核对版本状态')
  } finally {
    publishingVersion.value = ''
    await load()
  }
}

async function remove(raw: unknown): Promise<void> {
  const row = raw as UpdateRelease
  try {
    await ElMessageBox.confirm(`只删除 v${row.version} 的暂存文件，不影响已发布版本。`, '删除暂存版本', { confirmButtonText: '删除暂存', cancelButtonText: '取消', type: 'warning' })
    deletingVersion.value = row.version
    await removeStagedUpdateRelease(row.version)
    ElMessage.success('暂存版本已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '删除失败，请刷新后重试')
  } finally {
    deletingVersion.value = ''
    await load()
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

onMounted(load)
</script>

<style scoped>
.release-page{display:grid;gap:18px}.release-guide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.release-guide article{display:flex;gap:13px;min-height:90px;padding:17px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface)}.release-guide article>span{color:var(--color-primary);font-size:var(--type-meta);font-weight:800;letter-spacing:.08em}.release-guide div{display:grid;align-content:start;gap:5px}.release-guide strong{color:var(--color-text);font-size:var(--type-control)}.release-guide p{margin:0;color:var(--color-text-secondary);font-size:var(--type-meta);line-height:1.6}.release-list{padding:0;overflow:hidden}.release-list :deep(.data-toolbar){margin:0;padding:14px 16px;border-bottom:1px solid var(--color-border)}.version-cell{display:grid;gap:4px}.version-cell strong{font-size:14px}.version-cell small,.published-note{color:var(--color-text-secondary);font-size:var(--type-meta)}.file-list{display:grid;gap:4px;color:var(--color-text-secondary);font-size:var(--type-meta)}.row-actions{display:flex;align-items:center;gap:7px}.drawer-title p{margin:0;color:var(--color-primary);font-size:var(--type-micro);font-weight:800;letter-spacing:.15em}.drawer-title h2{margin:4px 0 0;font-size:21px}.upload-copy{display:grid;justify-items:center;gap:7px;padding:15px;color:var(--color-text-secondary)}.upload-copy strong{color:var(--color-text);font-size:var(--type-control)}.upload-copy small{font-size:var(--type-meta)}.security-note{display:flex;gap:11px;padding:14px;border:1px solid rgba(45,95,202,.18);border-radius:12px;background:var(--color-primary-soft);color:var(--color-primary)}.security-note p{display:grid;gap:3px;margin:0}.security-note strong{font-size:var(--type-meta)}.security-note span{color:var(--color-text-secondary);font-size:var(--type-meta);line-height:1.5}.drawer-actions{display:flex;justify-content:flex-end;gap:8px}@media(max-width:900px){.release-guide{grid-template-columns:1fr}.release-guide article{min-height:auto}}@media(max-width:760px){.release-list :deep(.el-table__fixed-right){position:static!important}}
</style>
