# 🎨 赛训工具箱设计系统 v6 — Glacier Cyan (冰川云基流)

> 极光冷晶蓝 × 邃蓝黑骨架 × 克制的亚马逊橙点缀 — 赛博朋克控制台级工业质感

---

## 1. 色彩系统

### 1.1 基础骨架色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--studio-bg` | `#F5F6F9` | 牛奶复合白：带微弱冷灰调底色 |
| `--studio-surface` | `#FFFFFF` | 纯白：卡片、弹窗背景 |
| `--studio-frame` | `#0F172A` | 邃蓝黑：侧边栏全高贴边、顶栏压阵 |

### 1.2 文字色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--studio-text-main` | `#1E293B` | 碳晶深灰：正文、大标题 |
| `--studio-text-muted` | `#64748B` | 燕麦灰：辅助文字、描述 |
| `--studio-text-on-dark` | `#F8FAFC` | 深色背景上的主文字 |
| `--studio-text-on-dark-muted` | `#94A3B8` | 深色背景上的辅助文字 |

### 1.3 品牌色（核心主色）

| 变量 | 色值 | 用途 |
|------|------|------|
| `--studio-accent` | `#0EA5E9` | **冰川蓝**：主按钮、聚焦边框、选中激活、图表激光线 |
| `--studio-accent-hover` | `#0284C7` | 悬浮态深冰蓝 |
| `--studio-accent-light` | `#7DD3FC` | 浅色辅助、渐变终点 |
| `--studio-accent-bg` | `#E0F2FE` | 极淡冰蓝背景：激活项半透明衬底 |

### 1.4 商业变现特权色（全站限制使用）

| 变量 | 色值 | 用途 |
|------|------|------|
| `--studio-warning` | `#FF9900` | 亚马逊橙：**仅用于** VIP 标签、锁卡升级、付费特权按钮 |
| `--studio-amazon` | `#FF9900` | 登录页品牌装饰专用 |
| `--studio-amazon-light` | `#FBBF24` | 渐变终点 |

> ⚠️ **设计原则**：亚马逊橙属于"视觉稀缺色"——平常不露，露出来就是为了引导充值/升级。

### 1.5 状态色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--studio-success` | `#10B981` | 新茶绿：脚本正常执行、就绪状态 |
| `--studio-danger` | `#EF4444` | 警示红：强行终止、设备解绑、报错 |
| `--studio-danger-hover` | `#DC2626` | 危险操作悬停 |
| `--studio-info` | `#06B6D4` | 信息提示 |
| `--studio-purple` | `#8B5CF6` | 管理员标识 |

### 1.6 中性色（边框/背景/分隔）

| 变量 | 色值 | 用途 |
|------|------|------|
| `--studio-border` | `#E2E8F0` | 边框、分隔线 |
| `--studio-bg-hover` | `#F1F5F9` | 悬停背景 |

---

## 2. 阴影系统

### 2.1 弥散悬浮阴影

```css
/* 默认阴影 — 卡片静止时 */
--studio-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.03), 0 4px 12px 0 rgba(15, 23, 42, 0.03);

/* 悬停阴影 — 跟随主色调（冰川蓝） */
--studio-shadow-hover: 0 10px 25px -5px rgba(14, 165, 233, 0.08), 0 8px 16px -6px rgba(14, 165, 233, 0.04);
```

### 2.2 卡片样式规范

- **无边框**：所有卡片使用 `border: none` + `box-shadow` 代替 `border: 1px solid`
- **圆角**：`border-radius: 10px`
- **悬停**：`transform: translateY(-2px)` + 阴影加深

---

## 3. 动效系统

### 3.1 全局缓动曲线

```css
/* 标准过渡 — 超跑级阻尼曲线 */
--transition: 300ms cubic-bezier(0.16, 1, 0.3, 1);

/* 慢速过渡 */
--transition-slow: 400ms cubic-bezier(0.16, 1, 0.3, 1);

/* 物理阻尼 */
--transition-physics: 400ms cubic-bezier(0.16, 1, 0.3, 1);
```

**物理特性**：前 10% 的时间瞬间爆发出 80% 的位移，后 90% 的时间优雅地减速靠墙。

### 3.2 微交互

| 交互 | 效果 |
|------|------|
| 卡片悬停 | `translateY(-2px)` + 冰川蓝阴影加深 |
| 按钮点击 | `scale(0.96)` 物理收缩反馈 |
| 页面切换 | `opacity` 淡入 + `translateY(12px)` 上移 |
| 侧边栏激活 | 3px 左侧冰川蓝高亮条 + 背景微亮 |

### 3.3 Chart.js 动画规范

```javascript
// 所有图表统一 250ms 瞬发，严禁默认 1000ms 弹性动画
animation: {
  duration: 250,
  easing: 'easeOutQuart'
}
```

---

## 4. 图标规范

### 4.1 图标库

使用 `@lucide/vue` 作为唯一图标源，**严禁使用内联 SVG 或 Element Plus 图标**。

### 4.2 图标尺寸

| 场景 | 尺寸 | 线宽 |
|------|------|------|
| 侧边栏菜单 | 14px | 1.75px |
| 按钮图标 | 16px | 2px |
| 统计卡片图标 | 24px | 2px |

### 4.3 图标颜色

```css
/* 深色侧边栏默认：燕麦灰 */
.menu-icon { color: var(--studio-icon-on-dark, #94A3B8); }

/* 悬停：亮起 */
.menu-nav-item:hover .menu-icon { color: var(--studio-text-on-dark, #F8FAFC); }

/* 激活：白色 */
.menu-nav-item.is-active .menu-icon { color: var(--studio-text-on-dark, #FFFFFF); }
```

---

## 5. 布局规范

### 5.1 侧边栏

- **全高贴边**：`height: 100vh`，无圆角，无间距
- **宽度**：`var(--sidebar-width, 200px)`
- **背景**：`var(--studio-frame, #0F172A)` 邃蓝黑
- **品牌区高度**：与 Header 对齐（48px）

### 5.2 顶栏

- **高度**：`var(--header-height, 48px)`
- **背景**：`var(--studio-surface)` 纯白
- **底部分割**：`box-shadow: 0 1px 0 rgba(0,0,0,0.06)`（与侧边栏咬合）

### 5.3 内容区

- **背景**：`var(--studio-bg, #F5F6F9)` 牛奶复合白
- **内边距**：`var(--spacing-lg, 1.5rem)`
- **卡片间距**：`1.5rem`

---

## 6. 侧边栏菜单项规范

| 属性 | 值 |
|------|-----|
| 高度 | 34px |
| 内边距 | `0 12px` |
| 间距 | 2px |
| 圆角 | 6px |
| 激活背景 | `rgba(14, 165, 233, 0.15)` |
| 激活指示条 | 3px 宽，左侧，`var(--studio-accent)` |
| Hover 背景 | `rgba(255, 255, 255, 0.04)` |

---

## 7. 图表配色

### 7.1 柱状图（工具成功率）

```javascript
// 低饱和色系，收窄柱子
barPercentage: 0.5
maxBarThickness: 28
borderRadius: 8

// 颜色
d.rate >= 95 ? 'rgba(52,211,153,0.6)' :  // 新茶绿
d.rate >= 80 ? 'rgba(251,191,36,0.6)'  :  // 琥珀金
                 'rgba(248,113,113,0.6)'     // 柔红
```

### 7.2 环形图（套餐分布）

```javascript
// 低饱和统一色系
const colors = ['#7DD3FC', '#FBBF24', '#34D399', '#F87171', '#A78BFA', '#67E8F9']

// 图例在右侧
legend: { position: 'right', labels: { pointStyle: 'circle', pointStyleWidth: 8 } }
```

### 7.3 折线图（收入趋势）

```javascript
borderWidth: 2.5
pointRadius: 3
pointBorderColor: '#fff'
pointBorderWidth: 2
```

---

## 8. Element Plus 主题覆盖

```css
:root {
  --el-color-primary: #0EA5E9;
  --el-color-primary-light-3: #7DD3FC;
  --el-color-primary-light-5: #38BDF8;
  --el-color-primary-light-7: #BAE6FD;
  --el-color-primary-light-8: #E0F2FE;
  --el-color-primary-light-9: #F0F9FF;
  --el-color-primary-dark-2: #0284C7;
}
```

---

## 9. 代码审查检查清单

在 PR 提交前，请确认：

- [ ] 已检查页面配色是否正确（牛奶白底 + 纯白卡片 + 弥散阴影）
- [ ] 已检查主色调是否为冰川蓝 `#0EA5E9`（非旧版靛蓝 `#4F46E5`）
- [ ] 已检查图标是否使用 Lucide（非内联 SVG）
- [ ] 已检查动效是否使用阻尼曲线（非默认 ease）
- [ ] 已检查图表动画是否在 300ms 以内
- [ ] 已检查无硬编码颜色值（全部使用 CSS 变量）
- [ ] 已检查亚马逊橙 `#FF9900` 仅用于 VIP/变现场景
- [ ] 已运行视觉回归测试
- [ ] 已更新截图（如有视觉变化）

---

## 10. 色彩功能映射速查

```
主操作（按钮/聚焦/激活）  →  --studio-accent (#0EA5E9)
VIP/锁卡/升级按钮        →  --studio-warning (#FF9900)
成功/就绪/正常           →  --studio-success (#10B981)
危险/终止/解绑           →  --studio-danger (#EF4444)
信息提示                 →  --studio-info (#06B6D4)
正文                     →  --studio-text-main (#1E293B)
辅助文字                 →  --studio-text-muted (#64748B)
深色背景文字             →  --studio-text-on-dark (#F8FAFC)
深色背景辅助文字         →  --studio-text-on-dark-muted (#94A3B8)
边框/分隔                →  --studio-border (#E2E8F0)