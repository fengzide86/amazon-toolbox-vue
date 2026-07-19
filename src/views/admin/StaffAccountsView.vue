<template>
  <div class="staff-accounts-page">
    <PageHeader title="后台账号管理" description="仅超级管理员可创建账号、调整固定角色、停用账号或重置密码">
      <template #actions>
        <el-button type="primary" @click="openCreate">新建后台账号</el-button>
      </template>
    </PageHeader>

    <div class="role-guide" role="note">
      <span><strong>超级管理员</strong> 全部配置与账号管理</span>
      <span><strong>运营</strong> 商务、授权与客服规则运营</span>
      <span><strong>客服</strong> 工单、知识与公告维护</span>
    </div>

    <AsyncStateNotice :state="loadState" :message="loadError" loading-text="正在加载后台账号…" @retry="loadAccounts" />
    <el-card class="table-card" shadow="never">
      <el-table v-if="loadState !== 'loading' && loadState !== 'error'" v-loading="loading" :data="accounts" stripe>
        <el-table-column prop="username" label="登录账号" min-width="150" />
        <el-table-column prop="display_name" label="显示名称" min-width="150" />
        <el-table-column label="角色" width="130">
          <template #default="{ row }"><el-tag :type="roleTag(row.role)">{{ staffRoleLabel(row.role) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '已停用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="密码状态" width="130">
          <template #default="{ row }">{{ row.force_password_reset ? '待首次修改' : '正常' }}</template>
        </el-table-column>
        <el-table-column label="最近登录" min-width="170">
          <template #default="{ row }">{{ formatTime(row.last_login_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" :disabled="isSelf(row)" @click="openReset(row)">重置密码</el-button>
          </template>
        </el-table-column>
        <template #empty><div class="empty-state">暂无后台账号</div></template>
      </el-table>
    </el-card>

    <el-dialog v-model="createVisible" title="新建后台账号" width="520px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="登录账号"><el-input v-model="createForm.username" maxlength="50" autocomplete="off" placeholder="字母开头，可含数字、点、横线或下划线" /></el-form-item>
        <el-form-item label="显示名称"><el-input v-model="createForm.display_name" maxlength="100" /></el-form-item>
        <el-form-item label="固定角色"><el-select v-model="createForm.role" style="width:100%"><el-option v-for="role in staffRoles" :key="role" :value="role" :label="staffRoleLabel(role)" /></el-select></el-form-item>
        <el-form-item label="临时密码"><el-input v-model="createForm.password" type="password" show-password minlength="10" maxlength="128" autocomplete="new-password" /><small>至少 10 位；账号首次登录后必须修改。</small></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" :loading="submitting" @click="submitCreate">创建账号</el-button></template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑后台账号" width="500px" :close-on-click-modal="false">
      <el-form v-if="editing" label-position="top">
        <el-form-item label="登录账号"><el-input :model-value="editing.username" disabled /></el-form-item>
        <el-form-item label="显示名称"><el-input v-model="editForm.display_name" maxlength="100" /></el-form-item>
        <el-form-item label="固定角色"><el-select v-model="editForm.role" :disabled="isSelf(editing)" style="width:100%"><el-option v-for="role in staffRoles" :key="role" :value="role" :label="staffRoleLabel(role)" /></el-select></el-form-item>
        <el-form-item label="账号状态"><el-radio-group v-model="editForm.status" :disabled="isSelf(editing)"><el-radio value="active">启用</el-radio><el-radio value="disabled">停用</el-radio></el-radio-group><small v-if="isSelf(editing)">不能停用自己或修改自己的角色。</small></el-form-item>
      </el-form>
      <template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" :loading="submitting" @click="submitEdit">保存修改</el-button></template>
    </el-dialog>

    <el-dialog v-model="resetVisible" title="重置后台密码" width="480px" :close-on-click-modal="false">
      <p>为「{{ resetting?.display_name }}（{{ resetting?.username }}）」设置临时密码。保存后旧凭证立即失效，对方首次登录必须修改密码。</p>
      <el-form label-position="top"><el-form-item label="新临时密码"><el-input v-model="resetPassword" type="password" show-password minlength="10" maxlength="128" autocomplete="new-password" /></el-form-item></el-form>
      <template #footer><el-button @click="resetVisible=false">取消</el-button><el-button type="danger" :loading="submitting" @click="submitReset">确认重置</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import AsyncStateNotice from '@/components/AsyncStateNotice.vue'
import { createStaffAccount, getStaffAccounts, resetStaffPassword, updateStaffAccount } from '@/utils/api'
import { showToast } from '@/utils'
import { authService } from '@/utils/auth'
import { staffRoleLabel } from '@/features/auth/permissions'
import { backofficeRoleSchema, type BackofficeRole } from '@/features/auth/model'
import { staffAccountSchema, type StaffAccount } from '@/features/auth/staffModel'
import { z } from 'zod'
import { failedDataState, settledDataState, type AsyncDataState } from '@/features/async/state'

const staffRoles = backofficeRoleSchema.options
const accounts = ref<StaffAccount[]>([])
const loading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const loadState = ref<AsyncDataState>('loading')
const createVisible = ref(false)
const editVisible = ref(false)
const resetVisible = ref(false)
const editing = ref<StaffAccount | null>(null)
const resetting = ref<StaffAccount | null>(null)
const resetPassword = ref('')
const createForm = reactive({ username: '', display_name: '', role: 'support' as BackofficeRole, password: '' })
const editForm = reactive({ display_name: '', role: 'support' as BackofficeRole, status: 'active' as 'active' | 'disabled' })

function errorText(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback }
function roleTag(role: BackofficeRole): 'danger' | 'warning' | 'info' { return role === 'super_admin' ? 'danger' : role === 'operator' ? 'warning' : 'info' }
function formatTime(value: string | null | undefined): string { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '从未登录' }
function isSelf(rawAccount: unknown): boolean {
  const account = staffAccountSchema.parse(rawAccount)
  return String(account.id) === String(authService.getUser()?.staff_id || '')
}

async function loadAccounts() {
  loading.value = true
  loadState.value = accounts.value.length ? 'data' : 'loading'
  loadError.value = ''
  try {
    accounts.value = z.array(staffAccountSchema).parse(await getStaffAccounts({ page_size: 100 }))
    loadState.value = settledDataState(accounts.value.length)
  }
  catch (error) {
    loadError.value = errorText(error, '后台账号列表暂时无法加载')
    loadState.value = failedDataState(accounts.value.length > 0)
  }
  finally { loading.value = false }
}

function openCreate() {
  Object.assign(createForm, { username: '', display_name: '', role: 'support', password: '' })
  createVisible.value = true
}
function openEdit(rawAccount: unknown) {
  const account = staffAccountSchema.parse(rawAccount)
  editing.value = account
  Object.assign(editForm, { display_name: account.display_name, role: account.role, status: account.status })
  editVisible.value = true
}
function openReset(rawAccount: unknown) {
  resetting.value = staffAccountSchema.parse(rawAccount)
  resetPassword.value = ''
  resetVisible.value = true
}

async function submitCreate() {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{2,49}$/.test(createForm.username.trim())) return showToast('登录账号格式不正确', 'warning')
  if (!createForm.display_name.trim()) return showToast('请输入显示名称', 'warning')
  if (createForm.password.length < 10) return showToast('临时密码至少 10 位', 'warning')
  submitting.value = true
  try {
    await createStaffAccount({ ...createForm, username: createForm.username.trim(), display_name: createForm.display_name.trim() })
    showToast('后台账号已创建', 'success'); createVisible.value = false; await loadAccounts()
  } catch (error) { showToast(errorText(error, '账号创建失败'), 'error') }
  finally { submitting.value = false }
}

async function submitEdit() {
  if (!editing.value) return
  if (!editForm.display_name.trim()) return showToast('请输入显示名称', 'warning')
  submitting.value = true
  try {
    await updateStaffAccount(editing.value.id, { ...editForm, display_name: editForm.display_name.trim() })
    showToast('账号已更新', 'success'); editVisible.value = false; await loadAccounts()
  } catch (error) { showToast(errorText(error, '账号更新失败'), 'error') }
  finally { submitting.value = false }
}

async function submitReset() {
  if (!resetting.value) return
  if (resetPassword.value.length < 10) return showToast('临时密码至少 10 位', 'warning')
  submitting.value = true
  try {
    await resetStaffPassword(resetting.value.id, resetPassword.value)
    showToast('密码已重置，旧凭证已经失效', 'success'); resetVisible.value = false; await loadAccounts()
  } catch (error) { showToast(errorText(error, '密码重置失败'), 'error') }
  finally { submitting.value = false }
}

onMounted(loadAccounts)
</script>

<style scoped>
.staff-accounts-page{width:min(1240px,100%);margin:0 auto}.role-guide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}.role-guide span{display:grid;gap:4px;padding:13px;border:1px solid var(--color-border);border-radius:10px;color:var(--color-text-secondary);background:var(--color-surface-soft);font-size:var(--type-meta)}.role-guide strong{color:var(--color-text)}.load-error{min-height:220px;display:grid;place-content:center;justify-items:center;gap:12px;color:var(--color-danger)}.empty-state{padding:36px;color:var(--color-text-secondary)}small{display:block;margin-top:5px;color:var(--color-text-tertiary);line-height:1.5}.el-dialog p{color:var(--color-text-secondary);line-height:1.65}@media(max-width:720px){.role-guide{grid-template-columns:1fr}}
</style>
