# Aetheria: Dawnwake — 交接 / 进度文档

> **换 agent、隔天续做、上下文压缩后，先读这一份。**
> 最后更新：2026-09-23（第四轮：**战斗表现升级** —— 单位动画 / 受击反馈 / 死亡演出 / 技能特效 / 环境动画 / 战斗信息 / 粒子池化 / 性能表）

---

## 一、当前状态一句话

**Phase 1 垂直切片已完成并可玩**：从主菜单进入「翡翠谷地」，采金 → 造兵营 → 训兵 → 过桥打荒野营地 → Boss 棘齿巨兽现身 → 击杀 → 结算存档，整条链路真实可跑。

**验收全绿**（命令都在 package.json）：
`npm test` **60/60**（dev）· `npm run test:prod` **60/60**（生产构建）· `npm run test:gpu` **11/11**（含 10/20/40/60 单位性能表）
· `npm run test:layout` **24/24**（6 视口 + 4 个菜单页）· `npm run test:soak` **6/6**（无泄漏）。

**第四轮做完的事（战斗表现升级）**：单位从「单帧贴图」换成**姿态驱动骨骼式动画**（16 张 spritesheet × 11–15 帧，
9 种 archetype、10 种武器）；受击方向反馈 + 暴击特效；倒地动画 + 尸体淡出 + Boss 死亡演出（爆炸/终极震动/慢动作）；
陨石全链路特效；环境动画（树摇/火炬燃烧冒烟/旗帜/废墟/水面闪光）；Boss 血条 + 目标准星 + 战斗日志；特效全池化。

**真实性能（Apple M4 Max / 1600×900 @DPR2 / 解除 vsync）**：

| units | FPS | sim ms/tick | heap MB |
|---|---|---|---|
| 10 | 810 | 0.036 | 64 |
| 20 | 806 | 0.044 | 63 |
| 40 | 818 | 0.068 | 65 |
| 60 | 817 | 0.083 | 66 |

CPU 随单位数线性增长（约 1.4µs/单位），60 单位只占 60FPS 预算的 0.5%。

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

**Roguelite 遗物（第二轮完成）**

- `src/systems/Relics.ts` 把存档里的遗物汇总成 `world.mods`，在**开局前**注入：
  魔法伤害（`Combat.applyDamage`）、英雄普攻与技能（`Combat.performAttack` / `HeroAbilities`）、
  近战单位与建筑最大生命、部队移速（`World.spawnUnit/spawnBuilding`）、采集与收益（`Economy`）。
- 6 件遗物全部有实际效果；开局横幅 + 暂停菜单都会列出本局生效的加成。
- 判据已断言：`flameRelic` → 魔法伤害 ×1.100；`warriorRelic` → 剑士 150→162（弓箭手不受影响）。

**阵型与避让（第二轮完成）**

- 群体移动改成**网格阵位**（最近原则分配，落点保证可站立），配合**按质量加权的成对松弛**局部避让
  （单帧位移上限 6px，绝不被推进阻挡格，Boss 推步兵而步兵推不动 Boss）。
- 判据已断言：20 单位过桥后最差间距比 1.01（要求 ≥0.8），17/20 抵达对岸。

**战争迷雾（第三轮完成）**

- `src/systems/Vision.ts`：三态网格（未探索 0 / 已探索记忆 1 / 当前可见 2），视野来源 = 玩家单位 `sightRange` + 建筑半径。
- 渲染：整张雾烘焙成**一张 tile 分辨率 canvas 纹理**（72×72），世界覆盖层与小地图共用 → 1 draw call、每次变化只传 72×72 像素。
  0.15s 节流重算（`BattleScene`），变化才重绘（`VisionGrid.paint()` 内部按 version 去重）。
- 玩法接线：敌人单位**只在视野内渲染**；敌方建筑**探索过就保留**（经典 RTS「记住建筑」）；玩家索敌与塔自动开火受视野限制
  （`World.canSee`）；AI 不吃迷雾（它是防守方）。
- `explore` 类目标解锁：m01 新增可选目标「探索西南方的古老立石」，把立石纳入视野即完成。

**装备 / Loot / 天赋闭环（第三轮完成）**

- 掉落：胜利必掉 1 件，三星 +1、击杀 Boss +1；按背包唯一去重；结算面板列出战利品。
- 装备：`src/systems/Equipment.ts` 汇总 4 个槽位（武器/护甲/戒指/护符）的 7 种属性，开局注入英雄
  （攻击/护甲/暴击/技能伤害/攻速/生命/法力），其中**攻速已接入真实攻击间隔**。
- 天赋：`src/data/talents.ts` 6 个天赋（战阵/秘法/王国三系，各 2 级），点数来自每局星级，设置页可全额退还。
- 三者最终都汇入同一个 `MatchModifiers`（`buildModifiers(relics, talents)`），是「永久成长 → 玩法数值」的唯一入口。

**表现（第四轮重做）**

- **单位动画**：`src/art/UnitRenderer.ts` 用姿态（躯干/肩/肘/膝/武器角度）驱动分层绘制
  （阴影 → 披风 → 后肢/后臂 → 躯干+板甲线+罩袍+护肩 → 前肢 → 头（盔/兜帽/帽/裸头/虚空）→ 前臂+武器 → 盾 → 边缘光）。
  每单位 11–15 帧：idle 3 / walk 4 / attack 4 / death 4；`Unit.playAnim` 按状态机切换（dead→death、swing→attack、有路径→walk、否则 idle）。
- **命中反馈**：攻击者→目标方向向量驱动火花偏置与**身体后仰**（0.18s 视觉位移，不改逻辑坐标）+ 白闪；
  暴击＝金色环 + 16 粒金火花 + 23px 放大数字 + 独立音效。
- **死亡**：单位自身 sprite 播放 4 帧倒地（末帧 `drawLying` 专用躺地姿势）+ 扬尘血雾 + 尸体 7s 后淡出下沉；
  Boss 死亡＝7 次错峰爆炸 + 终极爆炸 + `ultimate` 震动 + 1.1s 慢动作 + 灼地。
- **技能**：陨石＝天空法阵 → 落石 → 地面红圈 → 爆炸 → 火焰 → 灼地 → AOE；通道技能有施法圈；每次命中都有特效。
- **环境**：树/旗双频摇摆、火炬火焰抖动 + 每 0.18s 冒烟、水面 140 处闪烁、废墟残骸、建筑旁自动火炬与旗帜（暖光池）。
  **只动画视野内且已探索的装饰**，未探索区域自动隐藏（与迷雾联动）。
- **战斗信息**：Boss 血条（阶段 N/3 + 视野外提示）、受伤/选中血条、英雄蓝条、伤害数字、**目标准星**、**战斗日志**（击杀/损失/摧毁）。
- 命中反馈：剑光 + 火花 + 伤害数字 + 受击白闪 + 音效；爆发伤害带屏幕震动；Boss 有预警圈。
- 地形整图烘焙成 1 张纹理（含树/石），全图 1 draw call。
- 血条/蓝条/建造进度/占领进度：单 Graphics 每帧重绘。
- 小地图：烘焙底图 + 敌我光点 + 摄像框 + 点击跳转。
- HUD：顶部资源/人口/计时/下一波 + 右上目标 + 左下小地图与英雄面板 + 底部选择与建造/生产面板 + 右下 QWER 技能（冷却/法力/解锁等级）。
- 音频：WebAudio 合成 24 种音效 + **5 首循环音乐**（menu / battle / boss / victory / defeat，lookahead 音序器）；音乐/音效独立音量 + 静音，写回存档。

**系统**

- **粒子池化**：`FxSystem` 的一次性特效全部来自 `Pool<FxItem>`（预热 220）+ `Pool<FloatingText>`（48），
  用**手动积分器**（位置/速度/重力/缩放/透明度）替代 tween → 运行期零分配、零 GC 抖动。
- **镜头震动预算**：`shake(amp, duration, tier)` 分 light/heavy/ultimate；light 限幅 2.2 且有 0.22s 冷却、被更高级别压制。
- 响应式 HUD：所有面板由视口推导（`scale = clamp(min(W/1600,H/900), 0.3, 1.6)`，底部四面板按比例封顶），
  6 视口断言通过（1920×1080 / 1600×900 / 1280×720 / 1200×1113@2 严格档 + 2 个手机尺寸仅查溢出）。
- A* 寻路（八向、禁切角、地形代价），每帧预算 10 次搜索 + 同目标去重 + 群体共享路径。
- SpatialHash 承担全部「附近有什么」查询；对象池：投射物、伤害数字、粒子发射器。
- LocalStorage 存档：战役进度/解锁关卡/英雄等级/遗物/设置；主菜单「继续上次进度」。

---

## 四、已知问题（按优先级）

1. **战役 02–10 与另外两张地图只有数据**：每关的目标/波次/营地/Boss/简报都写好了，`MAPS` 里三张图的 biome 参数也在，
   但只有 Green Valley 做了完整布点 → 其余不可玩。
   → 判据：每关都能用 smoke 模板跑到 Victory。
2. **地形「地面」仍偏方块拼贴**：地表之上的装饰已全部改为带动画对象，但地面本身仍是逐格取色。
   → 判据：加一层低幅噪声/细节后，同一视口下看不到规则方块边界。
2b. **四足单位（野兽/Boss）美术弱于人形**：仍是「椭圆身体 + 尖刺 + 头」。
   → 判据：分层（鬃毛/尾摆/腿部关节）后与兽人同屏能一眼分辨。
3. **单位在极窄路口（宽 1 格）仍可能互相顶住**：现在只有位置松弛避让，没有排队/让路。
   → 判据：20 单位通过 1 格通道，全部通过且最差间距比 ≥0.8。
4. **手机尺寸下桌面专用菜单页会溢出**（战斗 HUD 不溢出、主菜单不溢出；「英雄/装备」「关卡」等页会）。
   手机不在 Phase 1 范围，`tests/layout.mjs` 已把这条写成「仅主菜单」的显式口径。
5. **尸体与 FX 未池化**（已证实不泄漏，属可选优化）。
6. **没有存档槽位 / 导出导入**，只有单份 LocalStorage。
7. 商业化预留（皮肤/主题接口）未做——按计划留到发布阶段，且**不做客户端假门闸**。

**前两轮列出的项已全部关闭**：真实 GPU 帧时、遗物只发不生效、阵型重叠、疑似泄漏、战争迷雾、装备/天赋闭环、第 5 首音乐。

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
| 11 | **窄视口下面板互相重叠 48px** | 底部四面板用固定设计尺寸，只有缩放没有按视口比例封顶 | minimap ≤13%W、英雄 ≤26%W、技能 ≤26%W，指令面板吃剩余空间 |
| 12 | 性能测出「所有负载都恰好 8.33ms」= 假结论 | 那是 120Hz vsync 的回声，不是成本 | 必须做**解除 vsync 的对照测量**（`test:gpu:uncapped`）+ 单位数爬坡，才是真实帧成本 |
| 13 | 有头浏览器帧率测量忽然变成 1Hz | 窗口不在前台时 Chrome 把 rAF 节流 | 加 `--disable-background-timer-throttling/--disable-backgrounding-occluded-windows/--disable-renderer-backgrounding` + `bringToFront()` |
| 14 | 以为纹理数在泄漏（187→211→200 波动） | **Phaser 每个 Text 对象都会注册一张 UUID 命名的 canvas 纹理**，创建/销毁成对出现 | 只看**自有命名空间**的纹理数（69，恒定）；总纹理数 ±30 是瞬时抖动 |
| 15 | 每秒堆增长 0.9MB，疑似慢泄漏 | 3 局样本不够，其实是 V8 预热 | 跑到 5 局看趋势：62.1→61.8→62.6→62.8→62.2MB **平台化** = 无泄漏 |
| 16 | 避让的累加器被自己清零（分离几乎失效） | 每单位循环里先 `push=0` 再累加，而配对是「只加给 id 更大的一方」→ 先前累加被抹掉 | 清零、累加、应用改成**三个独立 pass** |
| 17 | **天赋点了完全不生效** | `BattleScene` 调 `buildModifiers(relics)` 时**没传第二个参数**（talents 默认 `{}`） | 接线时把 `save.current.hero.talents` 一起传；断言直接测「伤害比 = 1.06」而不是「点了没报错」 |
| 18 | 迷雾检查全部失败（explored=0、explore 目标永远 active） | 那批检查跑在**已结束的对局**上：`update()` 与 `missions.update()` 都会短路，vision 节流也不跑 | 测试块必须跑在**活着的对局**里；加一条 `fog: the checks ran on a live match` 前置断言，避免以后再踩 |
| 19 | 战利品三连同名 | `addItem` 对背包去重，但掉落 roll 没避重 → 3 次 roll 只进 1 件 | 掉落时用 `rolled` 集合重 roll，池子抽干就少掉而不是重复 |
| 20 | 英雄头像压住名字/标题（HUD 与菜单都中招） | 头像按纹理尺寸缩放，而剑/帽子会超出角色包围盒 | 缩小头像缩放并右移文字列；菜单页再把卡片整体下移 |
| 21 | 「布局不溢出」断言在手机上假失败 | 菜单页是桌面专用，手机不在范围 | 断言按视口分档：桌面 4 档做完整检查，手机只查 HUD + 主菜单，并把差距写进文档 |
| 22 | 战斗中途崩：`Cannot read properties of null (reading 'drawImage')` | 本轮新加的 `feedTexts` 数组**漏加进 `HudScene.create()` 的重置清单** → 重启后数组变 10 项，前 5 项是上一实例已销毁的 Text，`refresh()` 一写就崩 | 所有 `create()` 填充的数组都必须重置；并给 `feedTexts` 加了 `if (!t.scene) continue` 防御。**教训：新增 UI 池数组时，先看 create() 的重置块** |
| 23 | 同样崩在 `Frame.setSize`，但栈里只有 Phaser 内部帧 | 排查方法：运行时给 `Frame.prototype.setSize` 打桩，打印 `this.text` + `window.__HUD_ALIVE__` + 完整栈 | 定位到「HUD 存活但 Text 已销毁」→ 才能反推到数组未重置。**这类崩溃光读代码找不到，必须打桩** |
| 24 | `TileSprite` 会让纹理帧失效 | `TileSprite` 直接拿共享纹理的帧并 `frame.setSize(自己的尺寸)`，纹理一旦被移除/重建，帧就死了 | 别对共享纹理用 TileSprite；水面闪光改成自建小精灵池 |
| 25 | 场景重启后纹理对象失效 | 之前每次 `create()` 都 `textures.remove(key)` 再重建同名纹理，旧对象仍持有已销毁的帧 | 同名同尺寸时**复用**纹理（`clearRect` + 重绘 + `refresh`），不再 remove/create |
| 26 | Boss 的动画帧数组越界（`pose.bob` of undefined） | `posesFor` 把**绝对帧号**当成姿态表下标用；Boss 帧数比姿态表少时采样越界 | 用「组内序号」采样并加 clamp + 兜底 `BASE` 姿态 |
| 27 | 单位画得像「保龄球瓶」、投石车画成了人 | 第一版比例失衡（头小肩窄）、没有 archetype 概念 | 加大头/肩比例，引入 `archetype` 决定头饰与躯干；投石车改为真正的攻城器械绘制 |

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

1. **战役 02–10 布点 + 两张地图**（现在最大的内容缺口）：用 `MapGen.generateMap()` 的 biome 参数为
   Dark Forest / Ruined Fortress 写布点函数（照抄 `buildGreenValley`），每关按 `MISSIONS` 里的 camps/boss/objectives 跑通。
   判据：每关都能用 smoke 模板跑到 Victory。
2. **地形地面去方块感**：地面仍是 40px tile 逐格取色。判据：加低幅噪声/细节后，1600×900 截图里看不到规则方块边界。
   （地表装饰已完成，剩下的是地面本身。）
3. **四足单位美术**：野兽/Boss 仍是「椭圆身体 + 尖刺 + 头」，比人形弱。判据：给四足加分层（鬃毛/尾巴摆动/腿部关节）后，
   与兽人单位同屏能一眼分辨体型差异。
4. **窄路口排队/让路**：宽 1 格通道下 20 单位通过不互相顶死。判据：全部通过且最差间距比 ≥0.8。
5. **手机端**（若要做）：先做菜单页重排（当前明确溢出），再做 HUD 竖屏堆叠。
6. 商业化只在发布阶段做：按 `game-publish-workflow` 出 `build:demo` / `build:full` 双构建，**不要用 localStorage 假门闸**。

---

## 九、提交历史

```bash
git log --oneline
# ea23787 feat(phase1): playable Aetheria: Dawnwake RTS vertical slice
# f4d4515 chore: refresh acceptance screenshots from the final verification run
# f0b8f8e feat(phase1.2): live relic effects, formation/avoidance, real-GPU + responsive verification
# 2ebd22a feat(phase1.3): fog of war, equipment/loot/talent loop, 5th music track
# + 第四轮：战斗表现升级（单位动画 / 受击反馈 / 死亡演出 / 技能特效 / 环境动画 / 战斗信息 / 粒子池化）
```

开工前先 `git status` 确认工作区干净。测试需要先起服务：`npm run dev &` 然后 `npm test`。
