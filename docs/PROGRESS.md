# Aetheria: Dawnwake — 交接 / 进度文档

> **换 agent、隔天续做、上下文压缩后，先读这一份。**
> 最后更新：2026-09-23（Phase 1 里程碑完成）

---

## 一、当前状态一句话

**Phase 1 垂直切片已完成并可玩**：从主菜单进入「翡翠谷地」，采金 → 造兵营 → 训兵 → 过桥打荒野营地 → Boss 棘齿巨兽现身 → 击杀 → 结算存档，整条链路真实可跑；
自动化验收 **dev 32/32、生产构建 32/32 通过**。

工程位置：`/Users/zsy/Desktop/游戏项目/aetheria-rts`
技术栈：Phaser 3.88.2 + TypeScript 5.9 + Vite 7；**零第三方素材**（美术/音效全部运行时代码生成）。

---

## 二、环境与命令

```bash
cd "/Users/zsy/Desktop/游戏项目/aetheria-rts"

npm run dev                 # dev server (5173)
npm run build               # tsc --noEmit && vite build → dist/
npm run preview             # 预览生产构建 (4173)
npm run typecheck

node tests/smoke.mjs                            # 32 项端到端断言（dev）
node tests/smoke.mjs http://localhost:4173       # 同一套断言跑生产构建
node tests/capture.mjs                          # 生成 artifacts/ 截图
```

**这台机器上的两个环境坑**：

1. shell 里带着 `NODE_ENV=production` → `npm install -D xxx` 会静默跳过 devDependencies（输出「up to date」但其实没装）。
   项目已加 `.npmrc: include=dev`。如果还是装不上，用 `NODE_ENV=development npm i -D xxx`。
2. 安装 playwright 浏览器：`npx playwright install chromium`（已装，playwright 1.63 / chromium headless shell 已缓存）。
   测试用 `channel: 'chromium'` + SwiftShader 参数，**注意这是软件光栅化**，帧时间不代表真实 GPU 性能。

---

## 三、已实现清单（可验证）

**玩法**

- 地图：72×72 tile（40px/tile）= 2880×2880 世界；程序化生成（河流 + 2 座桥 + 森林 + 岩脊 + 泥土路 + 金矿/林地/神龛布点）。
- 英雄：3 名数据与技能全部实现（骑士指挥官/奥术法师/游侠，各 4 技能）；等级 1–10、经验表、每 3 级解锁技能、阵亡 30 秒后在城堡复活。
- 单位：拓荒者可生产（采集/建造），剑士、弓箭手可生产；侍从骑士/牧师/投石车数据就绪但锁到 Phase 2。
- 建筑：黎明城堡（产工人/存资源/复活英雄）、兵营、射手营地、农庄(+8 人口)、守卫塔；法师塔/工坊数据就绪锁 Phase 2。
- 经济：金币 / 木材 / 魔法水晶；工人「资源点→携带→回城入库」循环；建造只在有工人在旁时推进。
- 人口：初始 20（城堡 +4），农庄 +8，硬顶 60。
- 战斗：近战瞬伤 + 远程投射物 + 溅射 + 护甲/伤害类型矩阵 + 暴击；攻击间隔、射程、仇恨范围、撤退。
- AI：Idle/Patrol/Chase/Attack/Retreat/Defend；营地自动补兵；按 105s 间隔、递增规模的波次进攻玩家基地；中立野兽（team 3）用同一套脑子。
- Boss：棘齿巨兽 2900 HP，3 阶段（召唤狼群 / 预警践踏 / 狂暴），地面预警圈 + Boss 音乐。
- 任务：目标链（采集→建造→生产→摧毁营地→击败 Boss）+ 2 个可选目标 + 星级结算 + 奖励发放（金币/经验/遗物）。
- 胜负：全主线完成 = 胜；城堡被拆 = 败；结算面板可「再打一次 / 返回主菜单」。

**表现**

- 命中反馈：剑光 + 火花 + 伤害数字 + 受击白闪 + 音效；爆发伤害带屏幕震动；Boss 有预警圈。
- 地形整图烘焙成 1 张纹理（含树/石），全图 1 draw call。
- 血条/蓝条/建造进度/占领进度：单 Graphics 每帧重绘。
- 小地图：烘焙底图 + 敌我光点 + 摄像框 + 点击跳转。
- HUD：顶部资源/人口/计时/下一波 + 右上目标 + 左下小地图与英雄面板 + 底部选择与建造/生产面板 + 右下 QWER 技能（冷却/法力/解锁等级）。
- 音频：WebAudio 合成 24 种音效 + 3 首循环音乐（menu / battle / boss，lookahead 音序器）；音乐/音效独立音量 + 静音，写回存档。

**系统**

- A* 寻路（八向、禁切角、地形代价），每帧预算 10 次搜索 + 同目标去重 + 群体共享路径。
- SpatialHash 承担全部「附近有什么」查询；对象池：投射物、伤害数字、粒子发射器。
- LocalStorage 存档：战役进度/解锁关卡/英雄等级/遗物/设置；主菜单「继续上次进度」。

---

## 四、已知问题（按优先级，别当成已完成）

1. **真实 GPU 的 60FPS 没测过**。沙盒是软件光栅化（rAF ~30Hz 封顶），只有「模拟 0.166ms/帧 @92 单位」是真的。
   → 下一步：带 GPU 的 Chrome 里看 HUD 右上角 FPS，目标 ≥58。
2. **遗物只发不生效**：`RelicDef.effect` 没有任何系统读。
3. **装备/天赋**：数据结构 + 存档字段 + 掉落表都在，但没有掉落触发点、没有背包/装备/加点界面。
4. **尸体与 FX 未池化**：`FxSystem.death/explosion/telegraph` 仍是 `add.image` + tween。
5. **单位挤桥/挤路口会重叠**：只有软分离，没有阵型/排队/让路。
6. **没有战争迷雾**，所以「探索/隐藏区域」类目标在 Phase 1 无法成立。
7. **胜利/失败只有音效，没有独立音乐轨**（用户要求 5 首）。
8. 战役 02–10 与另外两张地图只有数据，没有布点 → 不可玩（Phase 1 范围内，但要说清楚）。
9. HUD 只在 1600×900 人工核对过；1280×720 与 4 设备矩阵没有自动化布局断言。

---

## 五、反复踩过的坑（★ 最重要，都是实测出来的）

| # | 症状 | 根因 | 正解 |
|---|---|---|---|
| 1 | 技能图标/按钮不见了，文字或面板被挡 | `staticG.setDepth(1)` 而其它对象默认 0 | 静态背景层不设 depth（靠插入顺序在最底） |
| 2 | 重开一局直接卡在结算；HUD 第二次 create 崩 `null.setSize` | **Phaser `scene.restart()` 复用场景实例**，字段不重置；池数组会被 push 第二次 | 两个场景 `create()` 开头强制重置所有字段与数组 |
| 3 | **单位原地不动**（贴着建筑时） | `resolveBlockers` 用「半边长+半径」扩展盒，且在移动**之后**执行 → 每帧位移被撤销 | 只纠正深度重叠（`radius*0.5` slack），并在移动**之前**执行；A* 已保证不会走进建筑格 |
| 4 | 加速模拟（speed=8）时全军原地不动 | `repathAt = now+0.4` 在 dt=0.4 下等于每帧重寻路；路径被重置到 0 号路点（自己脚下），而被吃掉的路点那帧直接 `return` | 只在「无路径」或「目标漂移 >56px」时重算；一帧内连续吃掉所有已到达路点 |
| 5 | 工人永远到不了工地，建筑一直 2% | 到达判定 `radius+30` < A* 目标距离（footprint 外最近可走格，可达 60px） | 到达判定改 `radius + TILE*0.9` |
| 6 | 一进游戏就崩：`unknown unit: knightCommander` | `spawnUnit` 只查 `UNITS`，英雄在 `HEROES` | 先查 `HEROES`；`ensureTextures` 也要生成英雄贴图 |
| 7 | 截图写进了 `%E6%B8%B8...` 假目录 | `new URL(...).pathname` 对非 ASCII 路径做百分号编码 | 用 `fileURLToPath()` |
| 8 | `npm i -D vite` 说 up to date 但什么都没装 | `NODE_ENV=production` | `.npmrc: include=dev` |
| 9 | 性能验收假通过（0.00 ms/tick） | 那一局已经结束，`update()` 短路 | 断言里加「模拟时间必须推进 4.01s」 |
| 10 | 框选选不到工人 | 第一版写了「框内优先军事单位」 | 改成全部选中 |

---

## 六、运行时调试钩子（可直接复制到 DevTools）

```js
const g = window.__AETHERIA__;                 // Phaser.Game
const b = window.__AETHERIA_BATTLE__;          // BattleScene（实现 GameCtx）

// 状态
b.world.elapsed                  // 对局秒数
b.world.wallet                   // { gold, wood, mana }
b.world.popUsed / b.world.popMax
b.world.units.length             // 单位数
b.world.buildings.length
b.selection.units                // 当前选中
b.missions.objectives            // [{ def, state, progress, total }]
b.ai.waveCount / b.ai.bossSpawned / b.ai.bossPhase
b.world.hero.level / .xp / .mana / .hp

// 操作
b.speed = 8                      // 加速模拟（测试用；HUD 不感知）
b.paused = true
b.orders.move(b.selection.units, x, y, true)     // 攻击移动
b.production.enqueue(barracks, 'footman')
b.abilities.cast(b.world.hero, 'whirlwind', x, y)
b.ai.spawnBoss(b.mission)
b.cameras.main.centerOn(x, y); b.cameras.main.setZoom(1.2)

// 验收/截图常用
b.missions.finish(true)          // 直接进胜利结算
b.world.killBuilding(castle, 2)  // 触发战败
b.world.spawnUnit('footman', x, y, 'dawn')       // 造兵压测
b.combat.activeProjectiles       // 投射物池活跃数
```

调试钩子接线位置：`src/main.ts`（`__AETHERIA__`）与 `src/scenes/BattleScene.ts:create()` 末尾（`__AETHERIA_BATTLE__`）。

---

## 七、代码地图（改哪里找哪里）

| 想改什么 | 去哪里 |
|---|---|
| 单位/建筑/英雄/技能/装备/任务数值 | `src/data/*.ts`（纯数据，改完即生效） |
| 地图形状、资源点、营地位置 | `src/world/MapGen.ts`（`buildGreenValley()`） |
| 开局布点（基地/工人/中立怪/敌营） | `src/world/MatchSetup.ts` |
| 单位外观/建筑外观/图标 | `src/art/SpriteFactory.ts`（`drawHumanoid` / `drawBuildingTexture`） |
| 地形配色与整图烘焙 | `src/art/TerrainPainter.ts` + `src/art/Palette.ts` |
| 音效/音乐 | `src/audio/AudioBus.ts` |
| 命中特效/伤害数字/震动 | `src/fx/FxSystem.ts` |
| 移动与碰撞、卡住恢复 | `src/systems/Movement.ts` |
| 玩家单位状态机、下令 API | `src/systems/Orders.ts` |
| 战斗结算、投射物、溅射 | `src/systems/Combat.ts` |
| 敌人 AI、波次、Boss | `src/systems/AIController.ts` |
| 技能实现 | `src/systems/HeroAbilities.ts` |
| 任务目标/胜负/评分 | `src/systems/Mission.ts` |
| HUD 布局与交互 | `src/scenes/HudScene.ts`（布局集中在 `layout()`） |
| 战斗全局节奏（系统调用顺序） | `src/scenes/BattleScene.ts:update()` |

**系统更新顺序（改顺序前先想清楚）**：`pathfinder.update → world.update → orders → ai → movement → combat → economy → build → production → abilities → missions → fx`。

---

## 八、下一步建议（判据写清楚，别写「继续优化」）

1. **带 GPU 的 FPS 实测**：92 单位对局，HUD 右上角 FPS 稳定 ≥58；并补 4 设备矩阵布局断言（面板不重叠、不超出视口）。
2. **遗物生效**：`RelicDef.effect` 接入 `CombatSystem`/`EconomySystem`；判据 = 带 `flameRelic` 时法术伤害数字比不带高 ~10%，可断言。
3. **池化尸体/FX**：判据 = 连续 3 局后纹理/显示对象数不增长。
4. **阵型与避让**：判据 = 20 单位过桥后任意两单位中心距 ≥ (r1+r2)×0.8；或干脆做「队列行军 + 桥面让行」。
5. **战争迷雾**：判据 = 未探索区域不可见、探索后保留、敌人只在视野内渲染。
6. **战役 02–10 + 两张地图布点**：每关都要能按 smoke 模板跑到 Victory。
7. 商业化只在发布阶段做：按 `game-publish-workflow` 出 `build:demo` / `build:full` 双构建，**不要用 localStorage 假门闸**。

---

## 九、提交历史

本轮为一次性里程碑提交（见 `git log`）。建议下一次开工前先 `git status` 确认工作区干净，然后按「八、下一步建议」第 1 条开始。
