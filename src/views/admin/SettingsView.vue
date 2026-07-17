<template>
  <div>
    <h2 class="page-title">系统设置</h2>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>基本设置</span>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">管理员密码</div>
              <div class="setting-desc">用于管理后台登录</div>
            </div>
            <div class="setting-control">
              <el-input 
                v-model="adminPassword" 
                type="password" 
                placeholder="新密码" 
                style="width: 200px;"
                show-password
              />
              <el-button type="primary" @click="savePassword">更新密码</el-button>
            </div>
          </div>
        </el-form-item>

        <el-form-item>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">客服微信</div>
              <div class="setting-desc">显示在登录页和帮助页面</div>
            </div>
            <div class="setting-control">
              <el-input 
                v-model="wechatId" 
                placeholder="客服微信号" 
                style="width: 250px;"
              />
              <el-button type="primary" @click="saveWechat">保存</el-button>
            </div>
          </div>
        </el-form-item>

        <el-form-item>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">分润比例</div>
              <div class="setting-desc">{{ profitRatiosText }}</div>
            </div>
            <div class="setting-control">
              <el-button @click="openProfitEdit">编辑</el-button>
            </div>
          </div>
        </el-form-item>

      </el-form>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>套餐管理</span>
          <el-button type="primary" size="small" @click="showAddPlan = true">+ 新增套餐</el-button>
        </div>
      </template>

      <el-table :data="plans" style="width: 100%">
        <el-table-column label="套餐名称" min-width="140">
          <template #default="{ row }">
            <el-input 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan!.name"
              size="small"
            />
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>

        <el-table-column label="价格" width="120">
          <template #default="{ row }">
            <el-input-number 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan!.price"
              size="small"
              :min="0"
              style="width: 100px;"
            />
            <span v-else>¥{{ row.price }}</span>
          </template>
        </el-table-column>

        <el-table-column label="有效期" width="120">
          <template #default="{ row }">
            <el-input-number 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan!.duration_days"
              size="small"
              :min="1"
              style="width: 100px;"
            />
            <span v-else>{{ row.duration_days }} 天</span>
          </template>
        </el-table-column>

        <el-table-column label="功能" min-width="180">
          <template #default="{ row }">
            <el-input 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan!.features"
              size="small"
            />
            <span v-else style="font-size: 0.85rem;">{{ row.features }}</span>
          </template>
        </el-table-column>

        <el-table-column label="产品类型" width="130">
          <template #default="{ row }">
            <el-tag :type="row.product_type === 'business' ? 'warning' : 'info'" size="small">
              {{ row.product_type === 'business' ? '专业 B 端' : '普通 C 端' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="255" fixed="right">
          <template #default="{ row }">
            <template v-if="editingPlan?.id === row.id">
              <el-button type="primary" size="small" @click="savePlan(row)">保存</el-button>
              <el-button size="small" @click="editingPlan = null">取消</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="startEdit(row)">编辑</el-button>
              <el-button size="small" @click="openPlanPermissions(row)">产品权限</el-button>
              <el-button 
                size="small" 
                :type="row.status === 'active' ? 'danger' : 'success'"
                @click="togglePlanStatus(row)"
              >
                {{ row.status === 'active' ? '禁用' : '启用' }}
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>工具配置</span>
          <el-button type="primary" size="small" @click="addTool">+ 添加工具</el-button>
        </div>
      </template>

      <el-table v-if="tools.length" :data="tools" style="width: 100%">
        <el-table-column label="工具" min-width="220" fixed="left">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-input v-model="row.name" size="small" placeholder="工具名称" />
              <el-input v-model="row.id" size="small" placeholder="工具 ID，如 tool_reg_newbie" class="tool-sub-input" />
            </template>
            <template v-else>
              <div class="tool-name">{{ row.name }}</div>
              <div class="tool-meta">{{ row.id }}</div>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="平台/分类" width="170">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-select v-model="row.platform_key" size="small" style="width: 100%;">
                <el-option label="亚马逊" value="amazon" />
                <el-option label="速卖通" value="aliexpress" />
              </el-select>
              <el-select v-model="row.category" size="small" class="tool-sub-input" style="width: 100%;">
                <el-option label="数据分析" value="data" />
                <el-option label="运营工具" value="operation" />
                <el-option label="自动化工具" value="automation" />
                <el-option label="其他工具" value="other" />
              </el-select>
            </template>
            <template v-else>
              <div>{{ platformLabel(row.platform_key) }}</div>
              <div class="tool-meta">{{ categoryLabel(row.category) }}</div>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="模块/能力" min-width="200">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-input v-model="row.module" size="small" placeholder="用户看到的模块名" />
              <el-input v-model="row.capability_key" size="small" placeholder="能力 key，如 register" class="tool-sub-input" />
            </template>
            <template v-else>
              <div>{{ row.module }}</div>
              <div class="tool-meta">{{ row.capability_key || '未配置 capability_key' }}</div>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="自动化入口" min-width="260">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-input v-model="row.script_key" size="small" placeholder="脚本 Key，如 amazon.register.v1" />
              <el-input v-model="row.target_url" size="small" placeholder="目标网址 https://..." class="tool-sub-input" />
            </template>
            <template v-else>
              <div class="tool-code">{{ row.script_key || '未配置 script_key' }}</div>
              <div class="tool-url">{{ row.target_url || '未配置 target_url' }}</div>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="版本" width="150">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-input v-model="row.tool_version" size="small" placeholder="1.0.0" />
              <el-input-number v-model="row.runner_api_version" size="small" :min="1" :max="9" class="tool-sub-input" style="width: 100%;" />
            </template>
            <template v-else>
              <div>{{ row.tool_version || '1.0.0' }}</div>
              <div class="tool-meta">Runner API v{{ row.runner_api_version || 1 }}</div>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="展示/发布状态" width="170">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-select v-model="row.status" size="small" style="width: 100%;">
                <el-option label="用户端在线" value="online" />
                <el-option label="用户端维护" value="maintenance" />
                <el-option label="用户端下线" value="offline" />
              </el-select>
              <el-select v-model="row.release_status" size="small" class="tool-sub-input" style="width: 100%;">
                <el-option label="可启动" value="available" />
                <el-option label="Beta 可启动" value="beta" />
                <el-option label="维护，不可启动" value="maintenance" />
                <el-option label="禁用，不可启动" value="disabled" />
              </el-select>
            </template>
            <template v-else>
              <el-tag :type="row.status === 'online' ? 'success' : 'danger'" size="small">
                {{ toolStatusLabel(row.status) }}
              </el-tag>
              <el-tag :type="row.release_status === 'available' || row.release_status === 'beta' ? 'success' : 'warning'" size="small" class="tool-sub-tag">
                {{ releaseStatusLabel(row.release_status) }}
              </el-tag>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="套餐/排序" width="180">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-input v-model="row.available_plans_text" size="small" placeholder="Y49,Y199；空=全部" />
              <el-input-number v-model="row.sort_order" size="small" :min="1" class="tool-sub-input" style="width: 100%;" />
            </template>
            <template v-else>
              <div class="tool-meta">{{ row.available_plans?.join(', ') || '全部套餐' }}</div>
              <div class="tool-meta">排序 {{ row.sort_order || 0 }}</div>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="能力展示 / B端" min-width="270">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-input v-model="row.capability_tags_text" size="small" placeholder="能力标签，最多3个，逗号分隔" />
              <el-input v-model="row.preparation_notes_text" size="small" class="tool-sub-input" placeholder="准备事项，逗号分隔" />
              <el-input v-model="row.intervention_scenarios_text" size="small" class="tool-sub-input" placeholder="需要操作的情形，逗号分隔" />
              <div class="batch-switch"><el-switch v-model="row.supports_batch" size="small" /><span>开放 B 端批量</span></div>
              <el-input v-if="row.supports_batch" v-model="row.business_description" size="small" class="tool-sub-input" placeholder="B 端工具说明" />
              <el-input v-if="row.supports_batch" v-model="row.batch_schema_text" type="textarea" :rows="2" class="tool-sub-input" placeholder="account_label|客户简称|text|required" />
            </template>
            <template v-else>
              <div class="capability-preview"><el-tag v-for="tag in (row.capability_tags || []).slice(0,3)" :key="tag" size="small" effect="plain">{{ tag }}</el-tag></div>
              <div class="tool-meta">{{ row.supports_batch ? '已开放 B 端批量' : '仅单工具使用' }}</div>
            </template>
          </template>
        </el-table-column>

        <el-table-column label="说明" min-width="220">
          <template #default="{ row, $index }">
            <el-input
              v-if="editingToolIndex === $index"
              v-model="row.description"
              type="textarea"
              :rows="2"
              size="small"
              placeholder="用户端工具说明"
            />
            <span v-else class="tool-desc-admin">{{ row.description || '未填写' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-button type="primary" size="small" @click="saveTool($index)">保存</el-button>
              <el-button size="small" @click="cancelToolEdit">取消</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="startToolEdit(row, $index)">编辑</el-button>
              <el-button size="small" type="danger" @click="removeTool($index)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无工具配置" />
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <div>
            <span>自动化版本发布</span>
            <small class="header-hint">Ed25519 签名 · 稳定哈希灰度 · 一键回滚</small>
          </div>
          <el-button type="primary" size="small" @click="showReleaseModal = true">+ 创建签名版本</el-button>
        </div>
      </template>

      <el-table v-if="toolReleases.length" :data="toolReleases" style="width: 100%">
        <el-table-column prop="tool_id" label="工具" min-width="150" />
        <el-table-column prop="version" label="版本" width="90" />
        <el-table-column prop="script_key" label="脚本" min-width="180" />
        <el-table-column label="发布状态" width="130">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : row.status === 'retired' ? 'info' : 'warning'" size="small">
              {{ row.channel || 'draft' }} · {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="灰度" width="90">
          <template #default="{ row }">{{ row.rollout_percentage || 0 }}%</template>
        </el-table-column>
        <el-table-column prop="signing_key_id" label="签名密钥" width="140" />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="publishRelease(row, 'canary')">灰度</el-button>
            <el-button size="small" type="success" @click="publishRelease(row, 'stable')">全量</el-button>
            <el-button size="small" type="warning" @click="rollbackRelease(row)">回滚到此版</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="尚未创建签名工具版本" />
    </el-card>

    <!-- 新增套餐弹窗 -->
    <el-dialog v-model="showAddPlan" title="新增套餐" width="500px">
      <el-form label-width="80px">
        <el-form-item label="套餐名称">
          <el-input v-model="newPlan.name" placeholder="请输入套餐名称" />
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model="newPlan.price" :min="0" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-input-number v-model="newPlan.duration_days" :min="1" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="功能描述">
          <el-input v-model="newPlan.features" type="textarea" :rows="3" placeholder="请输入功能描述" />
        </el-form-item>
        <el-form-item label="产品类型">
          <el-select v-model="newPlan.product_type" style="width:100%">
            <el-option label="普通 C 端" value="consumer" />
            <el-option label="专业 B 端" value="business" />
          </el-select>
        </el-form-item>
        <template v-if="newPlan.product_type === 'business'">
          <el-form-item label="单批上限"><el-input-number v-model="newPlan.entitlements.max_batch_rows" :min="1" :max="1000" style="width:100%" /></el-form-item>
          <el-form-item label="浏览器现场"><el-input-number v-model="newPlan.entitlements.max_open_sessions" :min="2" :max="10" style="width:100%" /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showAddPlan = false">取消</el-button>
        <el-button type="primary" @click="addPlan">确认添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPlanPermissions" title="产品与专业权限" width="520px">
      <el-form v-if="planPermissionDraft" label-position="top">
        <el-form-item label="产品类型">
          <el-radio-group v-model="planPermissionDraft.product_type">
            <el-radio-button value="consumer">普通 C 端</el-radio-button>
            <el-radio-button value="business">专业 B 端</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="planPermissionDraft.product_type === 'business'">
          <div class="permission-assurance">B 端固定只有 1 个活动脚本；等待验证的浏览器现场会保留，后续账号继续。</div>
          <el-form-item label="批量工作台"><el-switch v-model="planPermissionDraft.batchEnabled" active-text="开放批量执行与多账号工作台" /></el-form-item>
          <div class="permission-grid">
            <el-form-item label="单批最大行数"><el-input-number v-model="planPermissionDraft.maxBatchRows" :min="1" :max="1000" /></el-form-item>
            <el-form-item label="最多浏览器现场"><el-input-number v-model="planPermissionDraft.maxOpenSessions" :min="2" :max="10" /></el-form-item>
          </div>
          <el-form-item label="桌面通知"><el-switch v-model="planPermissionDraft.desktopNotification" active-text="登录或验证时提醒" /></el-form-item>
        </template>
        <div v-else class="permission-assurance neutral">普通套餐不会因为席位数量增加而获得批量能力。</div>
      </el-form>
      <template #footer><el-button @click="showPlanPermissions=false">取消</el-button><el-button type="primary" @click="savePlanPermissions">保存权限</el-button></template>
    </el-dialog>

    <el-dialog v-model="showReleaseModal" title="创建签名工具版本" width="560px">
      <el-form label-width="100px">
        <el-form-item label="工具">
          <el-select v-model="newRelease.tool_id" style="width: 100%;" @change="syncReleaseScriptKey">
            <el-option v-for="tool in tools" :key="tool.id" :label="tool.name" :value="tool.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="newRelease.version" placeholder="例如 1.1.0" />
        </el-form-item>
        <el-form-item label="脚本 Key">
          <el-input v-model="newRelease.script_key" placeholder="amazon.register.v1" />
        </el-form-item>
        <el-form-item label="产物 SHA256">
          <el-input v-model="newRelease.artifact_sha256" placeholder="内嵌脚本填写 embedded" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReleaseModal = false">取消</el-button>
        <el-button type="primary" :loading="releaseSaving" @click="saveRelease">签名并创建</el-button>
      </template>
    </el-dialog>

    <!-- 分润比例编辑弹窗 -->
    <el-dialog v-model="showProfitModal" title="编辑分润比例" width="500px">
      <div class="profit-info">
        当前总和: {{ profitTotal }}% {{ profitTotal !== 100 ? '(应为100%)' : '✓' }}
      </div>
      
      <el-form label-width="60px">
        <el-form-item label="技术">
          <el-input-number v-model="profitRatios.tech" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="市场">
          <el-input-number v-model="profitRatios.market" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="产品">
          <el-input-number v-model="profitRatios.product" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="客服">
          <el-input-number v-model="profitRatios.service" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="统筹">
          <el-input-number v-model="profitRatios.coordination" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="记录">
          <el-input-number v-model="profitRatios.record" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showProfitModal = false">取消</el-button>
        <el-button type="primary" @click="saveProfitRatios" :disabled="profitTotal !== 100">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { useAdminSettings } from '@/features/admin/useAdminSettings'

const {
  plans, settings, tools, toolReleases, editingPlan, editingToolIndex, showAddPlan,
  showPlanPermissions, planPermissionDraft, showReleaseModal, releaseSaving, newRelease,
  adminPassword, wechatId, newPlan, categoryOptions,
  showProfitModal, profitRatios, profitTotal, profitRatiosText,
  savePassword, saveWechat, startEdit, savePlan,
  openPlanPermissions, savePlanPermissions, togglePlanStatus, addPlan, addTool,
  startToolEdit, cancelToolEdit, saveTool, removeTool, platformLabel, categoryLabel,
  toolStatusLabel, releaseStatusLabel, syncReleaseScriptKey, saveRelease,
  publishRelease, rollbackRelease, openProfitEdit, saveProfitRatios,
} = useAdminSettings()
</script>

<style scoped>
.page-title {
  font-family: var(--font-family);
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 1.5rem;
}

.settings-card {
  margin-bottom: 1.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
}

.settings-card :deep(.el-card__header) {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.header-hint {
  display: block;
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: var(--type-meta);
  font-weight: 400;
}

.tool-name {
  font-weight: 600;
  color: var(--color-text);
}

.tool-meta {
  margin-top: 0.2rem;
  font-size: var(--type-meta);
  color: var(--color-text-secondary);
  word-break: break-all;
}

.tool-code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: var(--type-meta);
  color: var(--color-text);
  word-break: break-all;
}

.tool-url {
  margin-top: 0.25rem;
  font-size: var(--type-meta);
  color: var(--color-primary);
  word-break: break-all;
}

.tool-sub-input {
  margin-top: 0.4rem;
}

.tool-sub-tag {
  display: block;
  width: fit-content;
  margin-top: 0.35rem;
}

.batch-switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.45rem;
  color: var(--color-text-secondary);
  font-size: var(--type-meta);
}

.capability-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.permission-assurance {
  margin-bottom: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: 10px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-size: var(--type-meta);
  line-height: 1.6;
}

.permission-assurance.neutral {
  color: var(--color-text-secondary);
  background: var(--color-canvas);
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.permission-grid :deep(.el-input-number) { width: 100%; }

.tool-desc-admin {
  display: inline-block;
  color: var(--color-text-secondary);
  font-size: var(--type-meta);
  line-height: 1.45;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid var(--color-border);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-title {
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.setting-desc {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.setting-control {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.profit-info {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--color-canvas);
  border-radius: var(--radius-sm);
}

:deep(.el-form-item) {
  margin-bottom: 0;
  padding: 1rem 0;
  border-bottom: 1px solid var(--color-border);
}

:deep(.el-form-item:last-child) {
  border-bottom: none;
}

:deep(.el-table) {
  --el-table-border-color: var(--color-border);
  --el-table-header-bg-color: var(--color-canvas);
  --el-table-row-hover-bg-color: var(--color-surface-soft);
}

:deep(.el-dialog) {
  border-radius: var(--radius-lg);
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 1rem;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
}
</style>
