<template>
  <div>
    <h2 class="page-title">用户管理</h2>

    <div class="filter-bar">
      <el-input 
        v-model="searchText" 
        placeholder="搜索用户/设备..." 
        clearable
        style="min-width: 240px;"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span class="filter-count">共 {{ filteredUsers.length }} 个用户</span>
    </div>

    <el-card class="table-card" shadow="never">
      <el-table :data="filteredUsers" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="用户名" min-width="140">
          <template #default="{ row }">
            <el-input 
              v-if="editingUser?.id === row.id" 
              v-model="editingUser.name" 
              size="small"
              style="width: 120px;"
            />
            <span v-else>{{ row.name || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="140">
          <template #default="{ row }">
            <el-input 
              v-if="editingUser?.id === row.id" 
              v-model="editingUser.phone" 
              size="small"
              style="width: 120px;"
            />
            <span v-else>{{ row.phone || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="device_name" label="设备名" min-width="140" show-overflow-tooltip />
        <el-table-column label="设备ID" min-width="160">
          <template #default="{ row }">
            <span class="mono-text">{{ row.device_id || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="席位数" width="100">
          <template #default="{ row }">
            <el-input-number 
              v-if="editingUser?.id === row.id" 
              v-model="editingUser.total_seats" 
              size="small"
              :min="1"
              style="width: 80px;"
            />
            <span v-else>{{ row.total_seats }}</span>
          </template>
        </el-table-column>
        <el-table-column label="额外设备" width="100">
          <template #default="{ row }">
            <el-input-number 
              v-if="editingUser?.id === row.id" 
              v-model="editingUser.extra_devices" 
              size="small"
              :min="0"
              style="width: 80px;"
            />
            <span v-else>{{ row.extra_devices }}</span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="160">
          <template #default="{ row }">
            <span class="time-text">{{ formatTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <template v-if="editingUser?.id === row.id">
              <el-button type="primary" size="small" @click="saveUser(row)">保存</el-button>
              <el-button size="small" @click="editingUser = null">取消</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="startEdit(row)">编辑</el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">暂无用户数据</div>
        </template>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getUsers, updateUser } from '@/utils/api'
import { showToast } from '@/utils'
import { Search } from '@element-plus/icons-vue'

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

<style scoped>
.page-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--studio-text-main);
  margin-bottom: 1.5rem;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.filter-count {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
}

.table-card {
  background: var(--studio-surface);
  border-radius: var(--radius-lg);
}

.mono-text {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 0.8rem;
  color: var(--studio-text-secondary);
}

.time-text {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--studio-text-muted);
}

:deep(.el-table) {
  --el-table-border-color: var(--studio-border);
  --el-table-header-bg-color: var(--studio-bg);
  --el-table-row-hover-bg-color: var(--studio-bg-hover);
}

:deep(.el-input-number) {
  width: 100%;
}
</style>