# Three.js HUD Redesign — 存款复利计算器科技感重写

## Overview

用 Three.js 将现有存款复利计算器重写为全面 3D 科幻 HUD 体验。视觉风格为钢铁侠 JARVIS（蓝白色调），固定视角 + CSS3DRenderer 悬浮面板，保留全部现有计算功能。移动端降级为纯 2D。

## Project Structure

```
index.html              — 入口 HTML，importmap 引入 Three.js（CDN），加载 ES modules
css/
  hud.css              — HUD 面板样式、表单样式、桌面端布局
  mobile.css           — 移动端 2D 降级样式
js/
  main.js              — 入口，设备检测（mobile vs desktop），初始化对应路径
  scene.js             — Three.js 场景、PerspectiveCamera、渲染循环、resize 处理
  background.js        — 粒子星场 + 数据流节点/连线动画
  panels.js            — CSS3DRenderer 管理，面板定位与入场动画
  chart3d.js           — 3D 发光曲线图（TubeGeometry + Bloom）
  postprocessing.js    — EffectComposer, UnrealBloomPass
  calculator.js        — 纯计算逻辑（从现有代码提取，不改功能）
  ui.js                — 表单交互、输入格式化、收入/支出管理
```

Three.js 通过 `<script type="importmap">` 从 CDN 引入（unpkg 或 cdnjs），无需构建工具，保持当前"打开即用"的 GitHub Pages 部署方式。

## Visual Style — JARVIS Blue

- 主色：`#1e90ff`（DodgerBlue）
- 面板背景：`rgba(10, 20, 40, 0.75)` + `backdrop-filter: blur(12px)`
- 面板边框：`1px solid rgba(30, 144, 255, 0.25)`，圆角 12px
- 面板顶部光边：`border-top: 2px solid rgba(30,144,255,0.6)`
- 弧形装饰：面板标题旁 SVG 弧线 + 小圆点（纯装饰）
- 标题文字渐变：`#4a90d9` → `#a0d4ff`
- 颜色映射：当前金色 `#ffd200` 全部替换为 `#1e90ff`；绿色（安全）、红色（危险）、橙色（警告/支出）保留

## Three.js Scene Structure

### Renderer Stack (bottom to top)

1. **WebGLRenderer** — 全屏 canvas，渲染 3D 背景和 3D 曲线图
2. **CSS3DRenderer** — 叠加在 WebGL 上，渲染 HTML 面板
3. 两个 renderer 共享同一个 PerspectiveCamera 和场景坐标系

### Camera

- PerspectiveCamera，固定位置 z ≈ 1500
- 鼠标移动时微视差：±2° 偏移，用 lerp 平滑过渡（factor ~0.05）
- 不可拖拽旋转/缩放

### Scene Space Layout

- 面板（CSS3DObject）在 z=0 平面上下排列
- 粒子星场在 z=-500 ~ -2000 远景
- 数据流节点在 z=-100 ~ -300 中景

## 3D Background Animation

### Particle Starfield (Far)

- ~2000 个粒子，`BufferGeometry` + `PointsMaterial`
- 颜色：蓝白色调（`#4a90d9` → `#ffffff`），大小 1~3px，随机透明度
- 整体绕 Y 轴旋转 ~0.0002 rad/frame
- 部分粒子用 sin 函数调制 opacity 实现闪烁

### Data Flow Network (Mid)

- ~30 个发光节点（`SphereGeometry` + `MeshBasicMaterial`，蓝色）
- 节点间用 `Line`（`LineBasicMaterial`，低透明度蓝色）连线
- 节点沿随机路径缓慢漂移，距离阈值内动态建立/断开连线
- 偶尔有"数据脉冲"沿连线传播（小光点从 A 滑向 B）

### Performance Budget

- 总粒子/节点 < 2500
- 无实时阴影
- 背景不参与射线检测

## HUD Panels

### Panel Layout (via CSS3DObject)

1. **输入面板**（上方）— 年龄、存款、利率、花费、养老金开关、收入计划、大额支出
2. **结果面板**（中间）— 安全支出、花费状态、大额支出汇总
3. **图表面板**（下方）— 3D 曲线图 + 详细表格切换

### Form Controls

- 输入框：半透明深蓝底 + 蓝色聚焦边框
- 所有交互逻辑不变（步进器、金额格式化、combo select、贷款展开等）
- Toggle switch 改为蓝色配色

### Panel Enter Animation

- 页面加载时面板依次从下方淡入上滑（opacity 0→1, translateY 30→0）
- 间隔 200ms

## 3D Glow Chart

### Curve

- `THREE.CatmullRomCurve3` 对数据点平滑插值 → `TubeGeometry`（半径 ~1.5）
- `MeshBasicMaterial` 蓝色（`#1e90ff`），通过 Bloom 后处理发光
- 曲线下方半透明渐变填充面（`ShaderMaterial`，顶部 `rgba(30,144,255,0.15)` → 底部透明）

### Data Points

- 每年份一个小球体（半径 3），默认低透明度
- 鼠标悬停（`Raycaster`）：球体放大 + 亮度提升 + CSS2DRenderer 弹出 tooltip
- 大额支出年份球体为橙色（`#e17055`）

### Depletion Indicator

- 资金耗尽点放置红色半透明竖平面 + 发光效果
- 上方红色文字标签（CSS2DRenderer）

### Axes

- `Line` 绘制 X/Y 轴线（低透明度蓝色）
- 轴标签（金额、年龄）用 CSS2DRenderer 渲染为 HTML

### Update Animation

- 参数改变时，曲线数据点通过 lerp 平滑过渡到新位置（~0.5s）

## Post-Processing

- `EffectComposer` → `RenderPass` → `UnrealBloomPass`
- Bloom 参数：strength 0.8, radius 0.4, threshold 0.6
- 影响范围：曲线、数据流节点、粒子（面板通过阈值排除）
- Bloom 使用选择性发光技术：将需要发光的物体渲染到单独 layer，compositing 时合并
- Raycaster 在 Bloom 合成前的原始 scene 上工作，不受后处理影响

## Mobile Degradation

### Detection

```js
const isMobile = window.innerWidth <= 768
  || /Android|iPhone|iPad/i.test(navigator.userAgent);
```

`main.js` 根据此判断加载 3D 或 2D 路径。

### 2D Fallback

- 不加载 Three.js 库
- 纯 CSS 暗色 HUD 风格（保留 JARVIS 蓝配色，CSS 发光边框模拟）
- 图表回退为 2D Canvas（复用 `drawChart` 逻辑，换成蓝色配色）
- 单列竖排布局

## Data Flow

```
用户输入 → ui.js 收集参数 → calculator.js 纯计算 → { years, depleted, results }
                                                       ↓
                                               ┌───────┴───────┐
                                               ↓               ↓
                                       结果面板 DOM 更新   chart3d.js updateChart()
                                                          （移动端则调用 2D drawChart）
```

### Calculator Interface

`calculator.js` 导出纯函数，不操作 DOM：

```js
export function calculate(params) → { years, depleted, safeSpending, results }
export function formatMoney(n) → string
export function parseFormatted(s) → number
```

### Chart Interface

`chart3d.js` 暴露：

```js
export function initChart(scene) → void
export function updateChart(years, depleted, startAge) → void
```

## Preserved Functionality

全部现有功能不变：
- 基础输入：年龄、预期寿命、存款、年化回报率、年度花费
- 养老金开关（性别选择、月养老金输入）
- 收入计划（多阶段，combo select 来源选择）
- 大额支出计划（贷款选项：首付比例、利率、期限）
- 金额输入自动逗号格式化 + 万/亿提示
- 年龄/利率步进器
- 结果展示（安全支出、花费状态、耗尽预警）
- 详细年度表格（可展开/收起）
- 图表 tooltip + 十字准线交互
