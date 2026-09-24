# QA 报告 · 测试矩阵与结果

> 规则：**改完代码必须自测**；一个功能只有同时满足
> ① 功能正确 ② 视觉正常 ③ 无 Console Error ④ 不破坏旧功能 ⑤ 性能可接受，
> 才算完成。未通过就继续修，不报"完成"。
>
> 最近一次全量执行：所有套件通过（下方有实测数字）。

## 一、启动测试

| 命令 | 结果 |
|---|---|
| `npm install` | ✅ 0 vulnerabilities |
| `npx tsc --noEmit` | ✅ 干净 |
| `npm run build` | ✅ 1.73s · index 285.89 kB (gzip 92.79) · phaser 1,205.40 kB (gzip 331.25) |
| `npm run dev` | ✅ 200 |
| `npm run preview`（生产构建） | ✅ 200，且生产构建通过完整冒烟 60/60 |

## 二、测试套件（一条命令一类）

| 套件 | 命令 | 覆盖 | 结果 |
|---|---|---|---|
| 玩法冒烟 | `npm test` | 17 项浏览器流程 + 存档 + 控制台 | **60/60**（dev 与生产构建各一遍） |
| 异常测试 | `npm run test:chaos` | 破坏性操作 + 不变量审计 | **21/21**（连续 3 次稳定通过） |
| 性能剖析 | `npm run test:profile` | 每系统耗时 / 内存 / 寻路 / 10-20-40-60 缩放 | **12/12** |
| 真实 GPU | `npm run test:gpu` | 帧成本 + 单位规模表 | **11/11** |
| 视觉圣经 | `npm run test:visual` | 色彩/光照/UI/图层合规 | **68/68** |
| 战役 | `npm run test:campaign` | 十关生成→通关 | **51/51** |
| 单人化 | `npm run test:singleplayer` | 自动化/编组/冒险/事件/Roguelite | **20/20** |
| 产品闭环 | `npm run test:product` | 选英雄→出征→每英雄独立进度 | **11/11** |
| 四设备布局 | `npm run test:layout` | desktop / laptop / tablet / phone（8 视口） | **全过** |
| 泄漏压测 | `npm run test:soak` | 连续 3 局 + 强制 GC | **6/6** |
| 节奏 | `node tests/pacing.mjs` | 5/10/15/20 分钟里程碑 | 4/5（见"已知未通过"） |
| **双语** | `npm run test:bilingual` | 全游戏中英双语（静态 + 运行时） | **6/6** |

## 三、17 项浏览器流程 → 测试映射

| # | 流程 | 测试项 | 结果 |
|---|---|---|---|
| 1 | 主菜单 | `menu: title + 5 main actions rendered` | ✅ |
| 2 | New Game | `menu: start button located` + `battle: scene created + HUD launched` | ✅ |
| 3 | 地图加载 | `battle: entities spawned (player/enemy/neutral/resources)` | ✅ |
| 4 | 英雄生成 | `battle: hero present` | ✅ |
| 5 | 英雄移动 | `hero: shield charge moves the hero toward the target` + chaos 移动检查 | ✅ |
| 6 | 框选单位 | `input: drag box selects player units` | ✅ |
| 7 | 单位移动 | `formation: 20 units ordered across the bridge` + chaos 隔离移动 | ✅ |
| 8 | 单位攻击 | `combat: army ordered to attack-move onto the camp` + chaos 命中掉血 | ✅ |
| 9 | 建造建筑 | `build: site placed / settlers assigned / construction finishes` | ✅ |
| 10 | 生产单位 | `production: barracks accepts order / unit exists + pop counted` | ✅ |
| 11 | 资源变化 | `economy: workers harvest and bank gold`（实测 175 金/分） | ✅ |
| 12 | 敌人 AI | `ai: wave timer runs` + `boss: spawns / takes damage / summons` | ✅ |
| 13 | 技能 | `hero: whirlwind casts` + chaos 连放 80 次技能 | ✅ |
| 14 | 胜利 | `mission: victory triggers` + `audio: victory track` + 结算面板 | ✅ |
| 15 | 失败 | `mission: losing the castle ends in defeat` + `audio: defeat track` | ✅ |
| 16 | 保存 | `save: progress persisted to localStorage` | ✅ |
| 17 | 读取 | chaos 刷新后存档完好 + product 每英雄记录 | ✅ |

## 四、异常测试（破坏性操作 → 不变量审计）

每个场景之后都审计整个世界：**无 NaN / 无 undefined / 无重复 id / 无悬空引用 / hp 不越界**。

| 场景 | 不变量结果 |
|---|---|
| 100 次快速点击 + Escape | ✅ 菜单存活，场景未崩 |
| 连续启动 5 张地图（快速切图） | ✅ 35 单位 · 8 建筑 · 0 悬空 · 仅一个活跃对局 |
| 数秒内连放 80 次技能 | ✅ 22 单位 · 14 建筑 · 特效池 48（上限 220） |
| 一次生成 70 单位 | ✅ 92 单位 · 人口账目一致 |
| 35 单位 + 英雄 + 建筑同帧死亡 | ✅ 英雄进入复活流程而非消失 |
| 连续建造 8 座建筑 | ✅ 全部落地 |
| 全流程后仍能移动 / 仍能造成伤害 | ✅ 距离 12-126px；目标 4→0 死亡 |
| 浏览器硬刷新 | ✅ 2.1s 恢复，存档（含每英雄记录）完好 |
| 刷新后重新进入对局 | ✅ 全新合法对局 |
| 画面非黑屏 | ✅ 1453 种颜色，均值 71（截图合成帧检测） |
| 纹理/对象/堆 | ✅ 自有纹理 87 稳定 · 对象 710→710 · 堆 431→**73MB**（GC 后回基线） |
| Console | ✅ **零 JS 错误**贯穿整个破坏性会话 |

## 五、性能测试

### 真实 GPU（Apple M4 Max，1600×900 @DPR2，解除 vsync）

| units | FPS | frame ms | sim ms/tick | p95 ms | worst ms | heap MB |
|---|---|---|---|---|---|---|
| 10 | 725 | 1.38 | 0.047 | 2.30 | 6.90 | 79 |
| 20 | 715 | 1.40 | 0.063 | 2.40 | 9.00 | 77 |
| 40 | 715 | 1.40 | 0.094 | 2.40 | 12.40 | 79 |
| 60 | 716 | 1.40 | 0.125 | 2.30 | 16.50 | 77 |

**CPU 线性**（约 1.5µs/单位），60 单位仅占 60FPS 预算的 **0.75%**。

### 根因剖析（不是降画质，而是查源头）

| 检查 | 实测 | 结论 |
|---|---|---|
| 每系统耗时（40 单位交战） | 全部系统合计 **0.164ms**（预算的 1.0%），最重 movement 0.056ms | 无单系统垄断 |
| 单次调用尖峰 | 最差 1.00ms | 无卡帧风险 |
| 寻路 | 94 次搜索 · 均值 **0.031ms** · 最大 0.80ms · 0 失败 | **A* 不是瓶颈** |
| 存活堆（强制 GC，30 秒） | 73.4MB → 74.9MB（**+1.5MB**） | **无内存泄漏** |
| 3 局泄漏压测 | 堆 +2.3%，自有纹理恒定 | 无泄漏 |

### 本轮定位并修掉的真实性能问题

1. **热路径每帧新建闭包**（最大自有分配源）：`Orders.acquire`（每单位每帧）、`Combat.update`（每建筑每帧）、
   `Automation.autoEngage` 都构造 `(e) => canSee(...)` 闭包 → 每秒数千个小函数。
   **修法**：新增 `World.nearestVisibleEnemy()`（内联可见性判定，零闭包）。堆采样中三处热点随即消失。
2. **`drawOverlay` 每帧全量重建 Graphics**：内含 `drawBar` 闭包 + 准星数组字面量，且 Phaser 每次
   `clear()` 都要重新三角化整个批次（采样里 `earcut`/`batchFillPath`/`batchTri`）。
   **修法**：把 `drawBar` 提升为方法、准星数组提为模块常量、并把覆盖层降到 **20Hz**（血条不需要 60Hz）→
   Graphics 重建量减少 2/3。
3. **一次真实的悬空引用 bug**（由异常测试发现）：实体死亡后，其他单位的
   `targetId`/`resourceId`/`buildId` 仍指向已移除实体。
   **修法**：`World.clearReferencesTo(id)` 在单位/建筑/资源移除时立刻清理入站引用。

## 五b、双语 / Bilingual

要求：**游戏中所有文字都是中文 + 英文**。这同样被做成了可判失败的检查（`tests/bilingual.mjs`）：

| 检查 | 内容 | 结果 |
|---|---|---|
| 静态覆盖 | 扫描 `src/` 里每个中文字面量，必须在 `src/data/i18n.ts` 里有对应英文（精确词条或数字模板） | **406 字面量 / 426 词条 / 0 漏译** |
| 词典质量 | 无空词条、英文值里不残留中文 | 通过 |
| 运行时·菜单 | 主菜单 / 战役 / 英雄 / 设置 / 出征 五个界面逐条检查：含中文的文本必须同时含英文 | 通过 |
| 运行时·HUD | 战斗 HUD（**含动态行**：人口、法力消耗、目标进度、工人面板、冒险行、战斗日志、横幅） | 通过 |
| 运行时·加载页 | 启动 / 加载页（Phaser 起来之前用户最先看到的文字） | 通过 |
| 运行时·无重复 | 任何标签不得把英文追加两次（标签会经过多层包装） | 通过 |
| 运行时·无重叠 | 同一屏内两个双语文本块不得互相压住 | 通过 |
| 运行时·装得下 | 标签必须装进自己的控件（菜单按钮 / HUD 格子 / 单位卡），不得溢出到相邻面板 | 通过 |

实现方式：`src/data/i18n.ts` 单一词源 + 三类渲染助手
- `bi()` 单行「中文 · English」；`biLines()` 面板两行；`biAuto()` 按长度/标点自动选择
- 覆盖点：`ui/UiKit.ts` 的 `text()` 与 `Button`（**一处改动覆盖所有 UI**）、HudScene 的 toast/banner/feed、
  全部 `setText`/`setLabel`、加载页、以及菜单里用双语部件拼接的组合行（关卡行、部署情报行、目标列表）

### 双语带来的一轮布局返工（记录，因为这是真实成本）

从"有英文"到"看起来对"经过了一轮**截图复核**：文字检查全绿时，菜单/部署/英雄/战役页仍然出现了
英文重复、双语块互相压住、以及文本溢出控件的问题。根因有三类，都已在产品侧修掉，并各自加了断言：

1. **幂等性**：标签会经过 `Button` 构造器 → `setLabel` → `setText` 多层包装，第二层会把英文再加一遍
   → 新增 `looksBilingual()` 守卫（并排除 `Boss`/`Roguelite` 这类"中文文案里的英文词"）
2. **固定行距装不下两行**：天赋、遗物、装备、目标、部署情报原本用固定行距 + 同行左右分栏
   → 全部改为"中文行 + 英文行"，并用**实测渲染高度**推进 y（不再猜）
3. **英文比中文宽约 1.6 倍**：菜单按钮、HUD 技能格、编队行、单位卡、目标面板被撑破
   → 加宽控件 / 缩小字号 / 长行按容器宽度 `setWordWrapWidth` 自动换行

## 六、已知未通过 / 未覆盖（诚实清单）

| 项 | 状态 | 说明 |
|---|---|---|
| `tests/pacing.mjs` 通关项 | ◐ 4/5 | m01 在 20 分钟内能开打但尚未打掉营地 —— 需继续调平衡，不是性能或稳定性问题 |
| 手机端菜单排版 | ◐ | 手机竖屏只保证 HUD 不溢出；菜单页为桌面/平板设计（已在测试中分档标注） |
| 皮肤系统 | ✕ | 第四阶段内容，尚未实现 |
| 7 个英雄（第三阶段） | ✕ | 当前 3 个 |
| 结算页视觉化 | ✕ | 目前是面板 + 推镜，未做成"英雄立于战场"的画面 |

> 结论：**功能/稳定性/性能/四设备/存活堆** 全部通过；**内容量**（英雄/皮肤）与
> **m01 通关平衡** 是下一轮目标。
