# 赛训工具箱 v6 — 全量 UI 精细化升级方案

> **用途**：本文档是一份完整的、可直接交给 AI 执行的前端优化方案。
> 涵盖设计系统底座修复、顶栏升级、Dashboard 统一、图表 Tooltip、图标规范化、前沿交互动效。
> 每个 Phase 独立可验证，按顺序执行。

---

## 项目技术栈

- Vue 3 + Composition API (`<script setup>`)
- Element Plus（UI 组件库）
- @lucide/vue（**唯一图标源**，`DESIGN_SYSTEM.md` 铁律）
- Chart.js + vue-chartjs
- CSS Variables 设计系统（`src/assets/css/base/variables.css`）

---

## 设计系统核心变量速查

| 变量 | 色值 | 用途 |
|------|------|------|
| `--studio-bg` | `#F5F6F9` | 页面底色（牛奶复合白） |
| `--studio-surface` | `#FFFFFF` | 卡片/弹窗背景 |
| `--studio-frame` | `#0F172A` | 侧边栏/深色骨架 |
| `--studio-text-main` | `#1E293B` | 正文 |
| `--studio-text-muted` | `#64748B` | 辅助文字 |
| `--studio-accent` | `#0EA5E9` | 冰川蓝品牌色 |
| `--studio-accent-hover` | `#0284C7` | 悬浮态 |
| `--studio-accent-light` | `#7DD3FC` | 浅色辅助 |
| `--studio-accent-bg` | `#E0F2FE` | 极淡冰蓝背景 |
| `--studio-border` | `#E2E8F0` | 边框 |
| `--studio-bg-hover` | `#F1F5F9` | 悬停背景 |
| `--studio-warning` | `#FF9900` | 亚马逊橙（仅 VIP/付费） |
| `--studio-danger` | `#EF4444` | 危险操作 |
| `--studio-success` | `#10B981` | 成功/正常 |
| `--transition` | `300ms cubic-bezier(0.16, 1, 0.3, 1)` | 标准阻尼曲线 |

---

## Phase 1 — 设计系统底座修复

### Step 1.1：variables.css 补齐幽灵变量

**文件**：`src/assets/css/base/variables.css`

**问题**：`UserSidebar.vue` 和 `AdminSidebar.vue` 引用了 `--studio-text-on-dark`、`--studio-text-on-dark-muted`、`--studio-icon-on-dark` 三个变量，但 `variables.css` 从未定义，靠 fallback 硬编码值工作。同时缺少半透明激活色变量。

**操作**：在第 8 行 `--studio-text-muted: #64748B;` 之后插入以下 5 行：

```css
--studio-text-on-dark: #F8FAFC;                              /* 深色背景主文字 */
--studio-text-on-dark-muted: #94A3B8;                        /* 深色背景辅助文字 */
--studio-icon-on-dark: #94A3B8;                              /* 深色背景图标默认色 */
--studio-accent-active: rgba(14, 165, 233, 0.15);            /* 侧边栏/组件激活半透明色 */
--studio-accent-hover-bg: rgba(255, 255, 255, 0.04);         /* 深色侧边栏 hover 半透明色 */
```

**验证**：补完后不改变任何视觉效果（fallback 值与新定义值完全一致）。

---

### Step 1.2：修复全局 sidebar.css 残留旧版靛蓝色

**文件**：`src/assets/css/layouts/sidebar.css`

**问题**：`.sidebar-nav a.active` 使用了旧版靛蓝色 `rgba(99, 102, 241, 0.1)`（对应 `#6366F1`），与品牌冰川蓝 `#0EA5E9` 不符。

**操作**：将 `rgba(99, 102, 241, 0.1)` 替换为 `var(--studio-accent-active)`。

---

### Step 1.3：UserSidebar.vue 硬编码 rgba → 变量引用

**文件**：`src/components/UserSidebar.vue`

**问题**：`<style scoped>` 中有多处硬编码 `rgba(14, 165, 233, 0.15)` 和 `rgba(255, 255, 255, 0.04)`。

**操作**：
- 所有 `rgba(14, 165, 233, 0.15)` → `var(--studio-accent-active)`
- 所有 `rgba(255, 255, 255, 0.04)` → `var(--studio-accent-hover-bg)`
- 所有 fallback 硬编码如 `#94A3B8`、`#F8FAFC` → 对应的 `var(--studio-text-on-dark-muted)`、`var(--studio-text-on-dark)` 等（去掉 fallback，直接用变量）

---

### Step 1.4：AdminSidebar.vue 同上

**文件**：`src/components/AdminSidebar.vue`

**操作**：与 Step 1.3 完全相同的替换规则。

---

## Phase 2 — 顶栏 AppHeader 升级

**文件**：`src/components/AppHeader.vue`

### Step 2.1：import 补充

在现有 import 语句中添加 `User`：
```javascript
import { Menu, Zap, User } from '@lucide/vue'
```

### Step 2.2：平台切换器去表单化

**模板改动**：

在 `<div class="platform-switcher">` 内部，`<el-select>` 之前插入分隔符：
```html
<span class="switcher-divider">/</span>
```

给 `<el-select>` 添加 `:teleported="true"` 属性（防止下拉菜单被父容器裁剪）。

**CSS 改动**：

新增分隔符样式：
```css
.switcher-divider {
  color: var(--studio-border);
  font-weight: 300;
  margin-right: 4px;
  user-select: none;
}
```

修改现有 `.platform-select` 的 `:deep()` 样式：
```css
/* 原来是：background: var(--color-border-light); */
:deep(.platform-select .el-input__wrapper) {
  box-shadow: none !important;
  background: transparent !important;
  border-radius: 6px;
  padding: 0 4px;
  transition: background var(--transition);
}

/* 新增 hover 反馈 */
:deep(.platform-select .el-input__wrapper:hover) {
  background: var(--studio-bg-hover) !important;
}

:deep(.platform-select .el-input__inner) {
  font-size: 13px;
  font-weight: 600;  /* 原来是 500 */
  color: var(--studio-text-main);
}
```

### Step 2.3：头像升级为 Lucide 图标

**模板改动**：

将 `.avatar-circle` 内部的 `{{ isAdmin ? 'A' : 'U' }}` 替换为：
```html
<User :size="14" />
```

### Step 2.4：Owner 改中文 + 下拉菜单身份信息

**模板改动**：

1. `<span v-if="isAdmin" class="admin-badge">Owner</span>` → `<span v-if="isAdmin" class="admin-badge">系统管理员</span>`

2. 在 `<template #dropdown>` 内部、`<template v-if="!isAdmin">` 之前插入：
```html
<div class="user-info-header">
  <span class="user-role-text">{{ isAdmin ? '系统管理员 (Owner)' : '赛训学员' }}</span>
</div>
```

**CSS 新增**：
```css
.user-info-header {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--studio-text-muted);
  border-bottom: 1px solid var(--studio-border);
  margin-bottom: 4px;
}

/* 修改头像 hover 效果 — 品牌色过渡 */
.avatar-circle:hover {
  background: var(--studio-accent-bg);
  color: var(--studio-accent);
}
```

---

## Phase 3 — Admin Dashboard 统一

**文件**：`src/views/admin/DashboardView.vue`

### Step 3.1：内联 SVG → Lucide 图标

**问题**：4 个统计卡片使用了内联 SVG，违反 `DESIGN_SYSTEM.md` "严禁使用内联 SVG" 铁律。

**操作**：

1. 在 `<script setup>` 中添加 Lucide 图标导入：
```javascript
import { CircleDollarSign, ShieldCheck, ClipboardList, TrendingUp } from '@lucide/vue'
```

2. 逐个替换 4 个统计卡片中的内联 SVG：

| 卡片 | 内联 SVG | 替换为 |
|------|---------|--------|
| 总收入 | `<svg>...美元符号...</svg>` | `<CircleDollarSign :size="24" />` |
| 活跃授权码 | `<svg>...盾牌✓...</svg>` | `<ShieldCheck :size="24" />` |
| 待处理工单 | `<svg>...剪贴板...</svg>` | `<ClipboardList :size="24" />` |
| 7天趋势 | `<svg>...上升箭头...</svg>` | `<TrendingUp :size="24" />` |

### Step 3.2：统计卡片样式统一

**问题**：Admin Dashboard 统计卡片的图标背景是 flat `rgba(...)` 纯色，而 User Dashboard 使用渐变 `linear-gradient`。数值字号也不统一（Admin 1.75rem vs User 1.5rem）。

**操作**：

1. 将每个 `.stat-icon` 的背景从 flat rgba 改为渐变。例如：
   - 收入图标：`background: rgba(14, 165, 233, 0.1)` → `background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(14, 165, 233, 0.05))`
   - 其他 3 个卡片同理，保留各自主色调，改为渐变

2. 将 `.stat-value` 的 `font-size` 从 `1.75rem` 改为 `1.5rem`（与 User Dashboard 统一）

---

## Phase 4 — 图表 Tooltip 统一配置

### Step 4.1：User Dashboard 图表 Tooltip

**文件**：`src/views/user/DashboardView.vue`

**问题**：柱状图和环形图的 Chart.js options 中完全没有自定义 tooltip 配置，使用 Chart.js 默认白底黑字样式。

**操作**：在 `barChartOptions` 和 `doughnutChartOptions` 的 computed 中添加以下配置：

**柱状图** `barChartOptions`：
```javascript
interaction: {
  mode: 'index',
  intersect: false
},
plugins: {
  legend: { display: false },  // 已有
  tooltip: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    titleFont: { size: 11, weight: '600' },
    bodyFont: { size: 11 },
    padding: 8,
    cornerRadius: 6,
    displayColors: false
  }
},
scales: {
  y: {
    beginAtZero: true,
    grace: '10%',  // 新增：防止最大数据点贴卡片顶部
    grid: { color: 'rgba(0,0,0,0.05)' }  // 已有
  },
  x: {
    grid: { display: false }  // 已有
  }
}
```

**环形图** `doughnutChartOptions`：
```javascript
plugins: {
  legend: { ... },  // 已有
  tooltip: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    titleFont: { size: 11, weight: '600' },
    bodyFont: { size: 11 },
    padding: 8,
    cornerRadius: 6,
    displayColors: false
  }
}
```

### Step 4.2：Admin Dashboard 图表 Tooltip

**文件**：`src/views/admin/DashboardView.vue`

**操作**：折线图、柱状图、环形图统一添加相同 tooltip 配置。Y 轴加 `grace: '10%'`。

---

## Phase 5 — 图标源统一 + 清理

### Step 5.1：管理员页面 Element Plus 图标 → Lucide

**问题**：多个管理员页面使用了 `@element-plus/icons-vue`，违反设计系统规范。

**涉及文件及操作**：

| 文件 | 当前图标 | 替换为 Lucide |
|------|---------|--------------|
| `admin/UsersView.vue` | `Search` from `@element-plus/icons-vue` | `Search` from `@lucide/vue` |
| `admin/OrdersView.vue` | 内联 SVG（下载图标） | `Download` from `@lucide/vue` |
| `admin/SettingsView.vue` | 检查是否有 Element Plus 图标 | 替换为 Lucide |
| `admin/ProfitView.vue` | 检查是否有 Element Plus 图标 | 替换为 Lucide |
| `user/LogsView.vue` | 检查是否有 Element Plus 图标 | 替换为 Lucide |

**替换规则**：
1. 修改 import 语句：`import { Search } from '@element-plus/icons-vue'` → `import { Search } from '@lucide/vue'`
2. 模板中 `<el-icon><Search /></el-icon>` → `<Search :size="14" />`
3. 内联 SVG 块 → 对应 Lucide 组件 `<Download :size="14" />`

### Step 5.2：DevicesView 按钮改用全局系统

**文件**：`src/views/user/DevicesView.vue`

**问题**：`.unbind-btn` 是自定义原生 `<button>` 样式，没有使用全局 `buttons.css` 里的 `.btn` / `.btn-danger` 系统。hover 效果用了硬编码 `rgba(239, 68, 68, 0.08/0.3)`。

**操作**：
1. 将 `<button class="unbind-btn">` 改为 `<button class="btn btn-danger btn-sm">`
2. 删除 `<style scoped>` 中的 `.unbind-btn` 相关样式
3. 如需微调，在全局 `buttons.css` 中添加 `.btn-danger` 的 hover 样式：
```css
.btn-danger:hover {
  background: var(--studio-danger);
  border-color: var(--studio-danger);
  color: white;
}
```

---

## Phase 6 — 前沿交互动效

### Step 6A：卡片交错入场动画

**文件**：`src/assets/css/components/cards.css`

**问题**：Dashboard 统计卡片一次性全部刷出，缺少精致感。

**操作**：在 `cards.css` 末尾添加：

```css
/* ===== 卡片交错入场动画（Linear 风格） ===== */
@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stats-row .stat-card {
  animation: card-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.stats-row .stat-card:nth-child(1) { animation-delay: 0ms; }
.stats-row .stat-card:nth-child(2) { animation-delay: 50ms; }
.stats-row .stat-card:nth-child(3) { animation-delay: 100ms; }
.stats-row .stat-card:nth-child(4) { animation-delay: 150ms; }

/* 图表卡片也适用 */
.charts-grid .chart-card {
  animation: card-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.charts-grid .chart-card:nth-child(1) { animation-delay: 0ms; }
.charts-grid .chart-card:nth-child(2) { animation-delay: 50ms; }

/* 尊重无障碍偏好 */
@media (prefers-reduced-motion: reduce) {
  .stats-row .stat-card,
  .charts-grid .chart-card {
    animation: none;
  }
}
```

---

### Step 6B：表格行 hover 品牌色指示条

**文件**：`src/assets/css/components/tables.css`

**问题**：表格行 hover 只改了背景色，缺少 Linear/Notion 风格的左侧品牌色指示条。

**操作**：在 `tables.css` 中添加：

```css
/* ===== 表格行 hover 品牌色指示条（Linear 风格） ===== */
.data-table tbody tr {
  position: relative;
}

.data-table tbody tr td:first-child {
  position: relative;
}

.data-table tbody tr:hover td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--studio-accent);
  border-radius: 0 2px 2px 0;
  opacity: 1;
  transition: opacity var(--transition);
}

.data-table tbody tr td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--studio-accent);
  border-radius: 0 2px 2px 0;
  opacity: 0;
  transition: opacity var(--transition);
}
```

---

### Step 6C：EmptyState 通用组件

**新建文件**：`src/components/EmptyState.vue`

**问题**：各页面空状态不统一（DevicesView 有 icon+文字，UsersView 只有文字，其他页面各有各的处理）。

**操作**：创建通用 EmptyState 组件：

```vue
<template>
  <div class="empty-state-container">
    <div class="empty-state-icon">
      <component :is="icon" :size="48" />
    </div>
    <h3 class="empty-state-title">{{ title }}</h3>
    <p v-if="description" class="empty-state-description">{{ description }}</p>
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  icon: {
    type: [Object, Function],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.empty-state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-state-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--studio-bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--studio-text-muted);
  margin-bottom: 1rem;
}

.empty-state-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--studio-text-main);
  margin: 0 0 0.5rem;
}

.empty-state-description {
  font-size: 0.875rem;
  color: var(--studio-text-muted);
  margin: 0;
  max-width: 300px;
}
</style>
```

**使用示例**：
```vue
<EmptyState
  :icon="Inbox"
  title="暂无数据"
  description="这里还没有任何内容"
/>
```

---

### Step 6D：按钮 :active scale 反馈

**文件**：`src/assets/css/components/buttons.css`

**问题**：`DESIGN_SYSTEM.md` 第 107 行写了"按钮点击 `scale(0.96)` 物理收缩反馈"，但 `buttons.css` 里实际没有实现。

**操作**：在 `.btn` 基础样式后添加：

```css
.btn:active {
  transform: scale(0.96);
  transition-duration: 100ms;
}
```

---

### Step 6E：侧边栏图标 hover 微缩放

**文件**：`src/components/UserSidebar.vue` + `src/components/AdminSidebar.vue`

**问题**：侧边栏菜单项 hover 只改了背景和文字色，图标无动效。

**操作**：在两个 Sidebar 的 `<style scoped>` 中添加：

```css
.menu-nav-item:hover .menu-icon {
  transform: scale(1.1);
  color: var(--studio-text-on-dark);
  transition: all var(--transition);
}

.menu-icon {
  transition: all var(--transition);
}
```

---

### Step 6F：卡片 hover 品牌色边框过渡

**文件**：`src/assets/css/components/cards.css`

**问题**：卡片 hover 有 `translateY(-2px)` + `--studio-shadow-hover`，但缺少品牌色边框过渡。

**操作**：修改 `.stat-card:hover` 和 `.chart-card:hover` 样式：

```css
.stat-card:hover,
.chart-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--studio-shadow-hover);
  border-color: rgba(14, 165, 233, 0.15);  /* 新增：极微弱品牌色边框 */
}
```

---

## 实施顺序与依赖关系

```
Phase 1（底座）── Step 1.1 → 1.2 → 1.3 → 1.4
    ↓
Phase 2（顶栏）── Step 2.1 → 2.2 → 2.3 → 2.4
    ↓
Phase 3（统一）── Step 3.1 → 3.2
    ↓
Phase 4（交互）── Step 4.1 → 4.2
    ↓
Phase 5（清理）── Step 5.1 → 5.2
    ↓
Phase 6（动效）── Step 6A → 6B → 6C → 6D → 6E → 6F
```

每个 Phase 独立可验证，做完一个阶段就可以看效果。

---

## 涉及文件清单

| 文件 | Phase | 改动类型 |
|------|-------|---------|
| `src/assets/css/base/variables.css` | 1.1 | 新增 5 个变量 |
| `src/assets/css/layouts/sidebar.css` | 1.2 | 修复旧靛蓝色 |
| `src/components/UserSidebar.vue` | 1.3, 6E | 替换硬编码 rgba + 图标微缩放 |
| `src/components/AdminSidebar.vue` | 1.4, 6E | 替换硬编码 rgba + 图标微缩放 |
| `src/components/AppHeader.vue` | 2.1-2.4 | 模板 + CSS + import |
| `src/views/admin/DashboardView.vue` | 3.1-3.2, 4.2 | SVG→Lucide + 样式 + tooltip |
| `src/views/user/DashboardView.vue` | 4.1 | tooltip 配置 |
| `src/views/admin/UsersView.vue` | 5.1 | Element Plus 图标 → Lucide |
| `src/views/admin/OrdersView.vue` | 5.1 | 内联 SVG → Lucide |
| `src/views/user/DevicesView.vue` | 5.2 | 按钮改用全局系统 |
| `src/assets/css/components/cards.css` | 6A, 6F | 交错动画 + hover 边框 |
| `src/assets/css/components/tables.css` | 6B | hover 指示条 |
| `src/assets/css/components/buttons.css` | 6D | :active scale |
| `src/components/EmptyState.vue` | 6C | 新建组件 |

---

## 验证清单

完成所有 Phase 后，逐项检查：

- [ ] 侧边栏激活状态颜色为冰川蓝（非靛蓝）
- [ ] 顶栏平台切换器无灰色背景，hover 有微弱反馈
- [ ] 顶栏头像为 Lucide User 图标（非字母 A/U）
- [ ] 管理员徽章显示"系统管理员"（非 Owner）
- [ ] 下拉菜单顶部显示角色信息
- [ ] Admin Dashboard 统计卡片使用 Lucide 图标（非内联 SVG）
- [ ] Admin Dashboard 统计卡片图标背景为渐变（非 flat rgba）
- [ ] 图表 tooltip 为深色背景（非白底黑字）
- [ ] 图表 tooltip 无需精准 hover 到数据点即可触发
- [ ] 管理员页面图标全部来自 Lucide（非 Element Plus）
- [ ] 统计卡片入场有交错动画
- [ ] 表格行 hover 左侧有品牌色指示条
- [ ] 按钮点击有 scale(0.96) 收缩反馈
- [ ] 侧边栏图标 hover 有微缩放
- [ ] 卡片 hover 有品牌色边框过渡
- [ ] 所有页面空状态使用 EmptyState 组件（统一风格）
- [ ] 运行 `npm run build` 无报错
- [ ] 运行 `npm run test` 无报错