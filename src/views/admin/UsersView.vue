<template>
  <div>
    <h2 class="page-title">用户管理</h2>

    <div class="filter-bar">
      <input v-model="searchText" class="form-input" placeholder="搜索用户/设备..." style="min-width:200px;">
      <span style="font-size:0.85rem;color:var(--color-muted);">共 {{ filteredUsers.length }} 个用户</span>
    </div>

    <section class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>手机号</th>
            <th>设备名</th>
            <th>设备ID</th>
            <th>席位数</th>
            <th>额外设备</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filteredUsers" :key="user.id">
            <td>{{ user.id }}</td>
            <td>
              <input v-if="editingUser?.id === user.id" v-model="editingUser.name" class="form-input" style="width:100px;">
              <span v-else>{{ user.name || '-' }}</span>
            </td>
            <td>
              <input v-if="editingUser?.id === user.id" v-model="editingUser.phone" class="form-input" style="width:120px;">
              <span v-else>{{ user.phone || '-' }}</span>
            </td>
            <td style="font-size:0.85rem;">{{ user.device_name || '-' }}</td>
            <td style="font-family:monospace;font-size:0.8rem;">{{ user.device_id || '-' }}</td>
            <td>
              <input v-if="editingUser?.id === user.id" v-model.number="editingUser.total_seats" type="number" class="form-input" style="width:60px;">
              <span v-else>{{ user.total_seats }}</span>
            </td>
            <td>
              <input v-if="editingUser?.id === user.id" v-model.number="editingUser.extra_devices" type="number" class="form-input" style="width:60px;">
              <span v-else>{{ user.extra_devices }}</span>
            </td>
            <td>{{ formatTime(user.created_at) }}</td>
            <td>
              <template v-if="editingUser?.id === user.id">
                <button class="btn btn-primary" style="padding:0.3rem 0.6rem;font-size:0.75rem;margin-right:0.3rem;" @click="saveUser(user)">保存</button>
                <button class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" @click="editingUser = null">取消</button>
              </template>
              <template v-else>
                <button class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" @click="startEdit(user)">编辑</button>
              </template>
            </td>
          </tr>
          <tr v-if="!filteredUsers.length">
            <td colspan="9" style="text-align:center;color:var(--color-muted);padding:2rem;">暂无用户数据</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getUsers, updateUser } from '@/utils/api'
import { showToast } from '@/utils'

const users = ref([])
const searchText = ref('')
const editingUser = ref(null)

const filteredUsers = computed(() => {
  if (!searchText.value) return users.value
  const q = searchText.value.toLowerCase()
  return users.value.filter(u =>
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.device_name && u.device_name.toLowerCase().includes(q)) ||
    (u.device_id && u.device_id.toLowerCase().includes(q)) ||
    (u.phone && u.phone.includes(q))
  )
})

function formatTime(timeStr) {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function startEdit(user) {
  editingUser.value = { ...user }
}

async function saveUser(user) {
  try {
    await updateUser(user.id, {
      name: editingUser.value.name,
      phone: editingUser.value.phone,
      total_seats: editingUser.value.total_seats,
      extra_devices: editingUser.value.extra_devices
    })
    showToast('用户信息已更新', 'success')
    editingUser.value = null
    await loadData()
  } catch (err) {
    showToast('更新失败', 'error')
  }
}

async function loadData() {
  try {
    users.value = (await getUsers() || []).filter(u => u !== null)
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

onMounted(loadData)
</script>