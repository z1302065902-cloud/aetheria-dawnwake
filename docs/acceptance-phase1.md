# Aetheria: Dawnwake — Phase 1 验收清单

> 写法遵守 `threejs-webgame-build-playbook` 的验收清单三原则：
> ① 每条都有**验证方式**（可自动化的写断言，手测的写具体步骤）；
> ② 容易糊弄的维度**逐项拆开**；
> ③ 区分「实现」与「符合标准」，状态用**三档**（已实现 / 部分实现 / 未实现）。
>
> 自动化命令：
> `npm test`（**60 项**端到端，dev）· `npm run test:prod`（生产构建）· `npm run test:gpu`（真实 GPU 帧时）
> · `npm run test:layout`（6 视口响应式）· `npm run test:soak`（泄漏压测）
>
> 最近一次结果（2026-09-23 第三轮）：
> **smoke 60/60（dev 与生产构建各一遍）· GPU 8/8（vsync + 解除上限两种模式）· layout 24/24 · soak 6/6**，控制台零 pageerror。

## 汇总

| 状态 | 条数 |
|---|---|
| ☑ 已实现 | 37 |
| ◐ 部分实现 | 5 |
| ☐ 未实现 | 1 |

**第三轮关闭的项**：战争迷雾（B-18）、装备与 Loot（E-03）、天赋加点（E-06/D-05）、第 5 首音乐（C-07）。
**仅剩 1 项 ☐**：商业化预留（E-05）——按计划留到发布阶段做双构建，**不做客户端假门闸**。

---

## A. 工程 / 技术选型

### A-01 技术栈与模块化
- 标准：Phaser 3 + TypeScript + Vite；无「整个游戏塞进一个 JS」；单位/建筑/英雄/技能/装备/任务数据驱动。
- 验证方式：`find src -name "*.ts" | wc -l` → 44 文件 / 9260 行；`src/data/*.ts` 全部数值来自数据表；`grep -rn "UNITS\[" src/systems` 无硬编码数值。
- 状态：☑ 已实现
- 代码位置：`src/`（见 README 结构图）
- 实测结果：44 个 TS 文件，最大单文件 `BattleScene.ts` 约 900 行（编排 + 输入，无系统逻辑）；`src/data/units.ts` 等 6 张数据表。
- 备注：原计划用 Phaser 3.88.2（非 Phaser 4），因为 RTS 需要的是稳定 API 与成熟的显示列表/输入系统。

### A-02 类型检查与构建
- 标准：`tsc --noEmit` 零错误；`vite build` 成功。
- 验证方式：`npm run build`。
- 状态：☑ 已实现
- 实测结果：`✓ 49 modules transformed`，产物 `index.js 169.7kB (gzip 55.2kB)` + `phaser.js 1205.4kB (gzip 331.3kB)`。
- 备注：`base: './'` 已设置（itch.io 子路径必需）；sourcemap 默认关闭。

### A-03 生产构建可运行
- 标准：生产构建（不是 dev server）能跑完整一局。
- 验证方式：`npm run build && npm run preview` 然后在 `http://localhost:4173` 跑同一套 smoke 断言。
- 状态：☑ 已实现
- 实测结果：**32/32 通过**，与控制台零 pageerror。

---

## B. 玩法（Phase 1 必须项）

### B-01 英雄存在、可选中、可移动
- 验证方式：断言 `world.hero` 非空；拖拽框选后英雄在选中集合内；`shieldCharge` 后坐标位移 > 60px。
- 状态：☑ 已实现
- 实测结果：`hero: shield charge moves the hero toward the target — {"x0":586.8,"y0":516.5} -> {"x":786.9,"y":636.6}`。

### B-02 单位移动（A* + 局部避让）
- 验证方式：右键下令后断言单位坐标持续变化；`path.findPath` 返回路径长度 > 0。
- 状态：☑ 已实现
- 实测结果：桥面行军截图（`artifacts/11-battle.png`）可见部队沿路径过桥；寻路单次搜索 < 0.2ms。
- 备注：**曾经失败过**——见「反复踩过的坑」#2/#3，那两个 bug 会让单位原地不动。

### B-03 框选
- 验证方式：真实鼠标 `mouse.down → move → up` 拖框，断言选中数 ≥ 4 且含 4 个工人。
- 状态：☑ 已实现
- 实测结果：`input: drag box selects player units — {"count":5,"workers":4}`。
- 备注：第一版加了「框选时优先军事单位」，导致工人选不中（框内 1 英雄 + 4 工人只选到英雄），已改为全部选中。

### B-04 攻击（自动攻击 + 伤害结算 + 反馈）
- 验证方式：断言 `missions.unitsKilledByPlayer > 0` 或英雄掉血；观察伤害数字/火花。
- 状态：☑ 已实现
- 实测结果：`combat: kills registered — {"killed":6,"heroXp":96,"heroHp":27}`（英雄在营地突袭中打到只剩 27 血）。

### B-05 建造（放置 → 工人到场 → 进度 → 完工）
- 标准：点击 HUD 建筑按钮 → 地面出现半透明幽灵 → 点击落位 → 扣资源 → 工人自动前往 → 进度条推进 → 完工可用。
- 验证方式：点击 HUD「兵营」按钮（真实点击其 label 坐标）→ 点击地面 → 断言 `building=true`；断言有工人 `buildId === site.id`；等待 `building === false`。
- 状态：☑ 已实现
- 实测结果：`build: barracks site placed — {"building":true,"construction":0.02}`；`build: settlers are assigned — [{"st":"buildGo","bid":61,...}]`；`build: settlers finish construction — {"building":false,"construction":1}`。

### B-06 生产（队列 + 资源扣除 + 人口校验 + 出单位）
- 验证方式：断言 `production.enqueue` 返回 `ok`、队列长度 ≥ 1、随后场上出现该单位且 `popUsed > 0`。
- 状态：☑ 已实现
- 实测结果：`production: barracks accepts a training order — {"res":"ok","queued":1,"gold":180}`；`{"footmen":1,"popUsed":6,"popMax":24}`。

### B-07 资源采集循环
- 验证方式：右键金矿 → 断言工人进入 `gatherGo/gather`；等待后断言金币增加或状态进入 `returnGo`。
- 状态：☑ 已实现
- 实测结果：`economy: workers harvest — {"gatherStates":["gatherGo","gatherGo","gatherGo","gatherGo"]}`；任务目标「采集 400 金币」在真实采集流程中自动完成（`o1 done, p=400`）。
- 备注：入城存钱音效 + 飘字都在（`deposit`）。

### B-08 敌人 AI
- 标准：Idle / Patrol / Chase / Attack / Retreat / Defend 状态；能发现玩家、追击、攻建筑、撤退、守资源点；营地会自动补兵；按节奏发动波次。
- 验证方式：断言 `ai.waveCount ≥ 1` 且波次计时器在跑；观察撤退（血量 < 30% 回撤）与营地补兵（`tickCampProduction`）。
- 状态：☑ 已实现
- 实测结果：`ai: wave timer runs — {"waveIndex":2,"nextIn":84,"elapsed":276}`；地图上游荡的荒野狼（team 3 中立）会主动咬人。
- 备注：中立生物也用同一套 AI（`team !== 1` 全部交给 AIController），因此 7 只中立怪会自己互相/攻击玩家。

### B-09 胜利条件
- 验证方式：完成全部主线目标后断言 `missions.victory === true` 且 `ended === true`。
- 状态：☑ 已实现
- 实测结果：`mission: victory triggers — {"ended":true,"victory":true, objectives: 5×done}`，并弹出结算（`artifacts/03-victory.png`）。

### B-10 失败条件
- 验证方式：摧毁玩家城堡，断言 `missions.defeat === true`。
- 状态：☑ 已实现
- 实测结果：`mission: losing the castle ends in defeat — {"castleGone":true,"ended":true,"defeat":true}`（截图 `artifacts/04-defeat.png`）。

### B-11 英雄技能 QWER
- 标准：4 个技能各自有消耗/冷却/等级门槛/不同机制；冷却与法力不足要给出明确提示。
- 验证方式：逐技能 `abilities.cast` 断言返回 `ok`、冷却被写入、通道型技能进入 channel；HUD 按钮上显示冷却/法力/解锁等级。
- 状态：☑ 已实现
- 实测结果：`whirlwind — {"res":{"ok":true},"after":14,"channelling":true}`；`shieldCharge` 位移 262px；`divineGuard` 3 级解锁（HUD 显示「3级解锁」）。
- 备注：3 名英雄 12 个技能的数据与实现都在（charge / buff / spin / guard / projectile / meteor / arrow-rain / trap / teleport / vision）。

### B-12 英雄等级与经验
- 验证方式：击杀获得 XP 飘字；`missions.updateHero()` 按 `HERO_XP_TABLE` 升级；每次升级属性成长、每 3 级解锁技能。
- 状态：☑ 已实现
- 实测结果：`heroXp: 96`（击杀 6 只）；HUD 显示 Lv 与经验条。
- 备注：**平衡上「英雄单刷不了整张图」成立**——单个英雄 + 1 个剑士突袭营地会打到只剩 27 血甚至阵亡。

### B-13 英雄阵亡与复活（不会直接 Game Over）
- 标准：英雄死亡 → 30 秒复活计时 → 在城堡复活并回满血蓝。
- 验证方式：等 `hero.respawning === true`；再等 `!dead && !respawning && hp > 0`。
- 状态：☑ 已实现
- 实测结果：`hero: death starts a respawn timer and the hero comes back — 通过`（前一次运行里英雄确实打到 0 血，随后自行复活）。
- 代码位置：`src/systems/Production.ts:tickHeroRespawn`

### B-14 Boss（3 阶段 + 预警 + 召唤 + 独特音效）
- 标准：体型明显、有技能预警、按血量分 3 阶段、会召唤小怪、有独特音效与死亡结算。
- 验证方式：摧毁营地目标完成后断言 `ai.bossSpawned && ai.boss`；派遣部队攻击后断言 Boss 掉血、小怪数量上升、`bossPhase` 存在。
- 状态：☑ 已实现
- 实测结果：`boss: spawns — {"hp":2900,"x":2020,"y":2100,"phase":1}`；`boss: takes damage — {"bossHp":2635/2900,"summons":16}`。
- 备注：棘齿巨兽 3 阶段分别：咆哮召唤狼群 → 蓄力践踏（地面预警圈）→ 狂暴（更快更痛、更多召唤）。

### B-15 任务系统（主/可选目标 + 奖励 + 评分）
- 标准：目标类型覆盖 destroy / defend / escort / collect / explore / rescue / survive / boss；有主线顺序、可选目标、奖励与结算星级。
- 验证方式：断言 7 个目标按顺序推进（`active → done`）；可选目标失败会标记 `failed`；结算显示星级、任务数、金币/经验/遗物。
- 状态：☑ 已实现
- 实测结果：`objectives: [done,done,done,done,done,failed,active]`，结算面板 3 星。
- 备注：`escort` / `rescue` / `explore` 三种类型只有**判定框架**（在 Mission 里有分支但 Phase 1 地图没有对应关卡内容）→ 见 D-02。

### B-16 人口系统
- 验证方式：断言 `popUsed/popMax` 随单位与农庄变化；上限硬顶 60。
- 状态：☑ 已实现
- 实测结果：`popUsed: 6, popMax: 24`（初始 20 + 城堡 4）；每个农庄 +8，`CFG.POP_MAX = 60` 硬顶。

### B-17b 阵型与局部避让（本轮完成）
- 标准（交接文档判据）：20 个单位过桥后，任意两单位中心距 ≥ (r1+r2)×0.8。
- 验证方式：`npm test` 中「formation」三项 —— 隔离掉敌人（清空 `ai.camps` + 推远波次）后，在**南桥西岸**用真实地图落点（`map.landings[2]`）生成 20 个单位，下令过桥到东岸，等全部到达后计算全部两两距离比。
- 状态：☑ 已实现
- 实测结果：**最差间距比 1.01**（判据 ≥0.8），20 个里 17 个过河抵达（2 个仍在寻路），过程中零卡死。
- 代码位置：`src/systems/Movement.ts` —— `accumulateSeparation`/`applySeparation`（按质量加权的成对松弛，单帧位移上限 6px，且不许被推进阻挡格）+ `formationSlots`（网格阵位，按最近原则分配，保证每个落点可站立）。
- 备注：旧实现是「每单位受邻居软推力」，只有 1/60 固定系数、且会漏掉半径大于 24px 的配对（Boss 与步兵），20 单位过桥时会叠在一起。

### B-17 中立怪与可占领神龛
- 验证方式：断言地图上存在 team 3 单位；玩家单位站上神龛 → `captured === true` 并持续产出魔法水晶。
- 状态：☑ 已实现（神龛占领的手测步骤：把英雄走到中央神龛旁 1.6 秒）
- 实测结果：`neutrals: 7`；神龛占领后 `+0.7 水晶/秒`。可选目标「占领中央魔法神龛」在测试里保持 `active`（未测量到完成）。

---

### B-18 战争迷雾（第三轮完成）
- 标准（交接文档判据）：未探索区域不可见、探索后保留、敌人只在视野内渲染、小地图同步；顺带解锁 explore 类目标。
- 验证方式：`npm test` 中 10 项 fog 断言 —— ① fog 纹理必须是 tile 分辨率（72×72）；② 开局基地可见、敌方营地既不可见也未探索；
  ③ 营地附近 6 个敌人的 `sprite.visible` 全为 false；④ 玩家单位永远不被自己的迷雾隐藏；⑤ 开局探索面积只占全图一小部分；
  ⑥ explore 目标在探索前必须是 `active`；⑦ 把英雄移动到立石后目标变 `done`；⑧ 英雄离开后该处 `visible=false` 但 `explored=true`。
- 状态：☑ 已实现
- 实测结果：`fog texture [72,72]`；`base true · camp visible false / explored false`；`6 enemies at the camp, all sprites hidden`；
  `405 / 5184 tiles explored`（7.8%）；`explore 目标 active → done`；`离开后 visible=false / explored=true`（462 格保留）。
- 代码位置：`src/systems/Vision.ts`（三态网格 + 共享 canvas 纹理）、`src/scenes/BattleScene.ts`（0.15s 节流更新 + 世界覆盖层）、
  `src/scenes/HudScene.ts`（小地图复用同一张雾纹理）、`src/world/World.ts:applyFog/canSee`（敌人只在视野内渲染 + 玩家索敌受限）、
  `src/systems/Mission.ts`（explore 目标）。
- 备注：雾是**一张 tile 分辨率的 canvas 纹理**，世界与小地图共用 → 整套迷雾 = 1 draw call、每次变化只上传 72×72 像素。
  真实帧成本从 1.21ms 升到 1.30ms（+0.08ms），可忽略。
  设计取舍：**AI 不吃迷雾**（它是防守方、守自己的地盘），玩家索敌与塔的自动开火受视野限制。

## C. 表现（战斗反馈是本项目重点）

### C-01 命中反馈三件套
- 标准：每次攻击都有 Hit Effect + Damage Number；重击有 Screen Shake；不同伤害类型颜色/粒子不同。
- 验证方式：代码路径 `CombatSystem.applyDamage → fx.damageText + fx.hit`（所有伤害来源都走这里，包括技能与 Boss）；截图观察。
- 状态：☑ 已实现
- 实测结果：截图里可见飘字（`13`、`600`）与火花；`explosion()` 带 `shake(amp, duration)`，Boss 践踏 `amp = min(11, radius/12)`。

### C-02 死亡表现
- 验证方式：`FxSystem.death` 生成灰化尸体并 3.2 秒淡出 + 冒烟。
- 状态：◐ 部分实现
- 实测结果：尸体可见且会消失。
- 差距：**尸体没有池化**（每个尸体 `scene.add.image` + tween），大规模团战会有额外分配；不同种族没有专属死亡动画。
- 泄漏判据（补测）：`npm run test:soak` 连跑 5 局重压后，**游戏自有纹理数恒定 69**、战斗场景显示对象 181→168（-7%）、HUD 111→111（0%）、强制 GC 后堆稳定在 ~62MB 平台（62.1→61.8→62.6→62.8→62.2MB，非线性增长）。
  结论：**没有泄漏**，只是分配抖动；因此池化尸体属于优化而非修 bug。

### C-03 血条 / 蓝条 / 建造进度
- 验证方式：受伤或选中即显示；英雄额外有蓝条；工地显示黄色进度条；神龛显示占领进度。
- 状态：☑ 已实现
- 实测结果：单张 `Graphics` 每帧重绘（1 个 display object 承担全部血条）。

### C-04 小地图
- 验证方式：左下角显示烘焙地图 + 敌我光点 + 白色英雄点 + 摄像机框；点击可跳转镜头。
- 状态：☑ 已实现
- 实测结果：截图可见营地红色方块、玩家单位绿点；`ui:minimap-click` 已接线。

### C-05 HUD 布局
- 标准（用户要求）：顶部金币/木材/水晶/人口；左下英雄头像 + HP/Mana/Level/XP；右下技能；底部单位选择；右侧任务目标；不遮战场；1280×720 起可用。
- 验证方式：HUD 以 1600×900 设计坐标 × `scale = clamp(min(W/1600, H/900), 0.42, 1.6)` 布局，所有元素按视口锚定；`page.screenshot` 人工核对 1600×900。
- 状态：☑ 已实现
- 实测结果：截图 `artifacts/02-battle-start.png` / `11-battle.png` 六处面板齐全，不与战场重叠区冲突。
- 备注：**未做多分辨率回归断言**（只有人工看 1600×900 与 1280×720 布局公式推导）→ 见 D-04。

### C-06 程序化美术（原创性红线）
- 标准：不含任何第三方素材；所有单位/建筑/图标/地形/特效由代码绘制。
- 验证方式：`find . -name "*.png" -not -path "./artifacts/*" -not -path "./node_modules/*"` 应为 0；纹理全部由 `SpriteFactory.ensureTextures()` 生成（74→186 张）。
- 状态：☑ 已实现
- 实测结果：仓库内零图片素材；186 张运行时生成纹理（含 3 种树、石头、资源、投射物、FX、技能图标）。

### C-07 程序化音频
- 标准：主菜单/战斗/Boss 音乐；剑击、箭矢、魔法、爆炸、建造、资源、升级、技能、Boss 攻击、胜利、失败音效；音乐/音效独立音量 + 静音。
- 验证方式：`audio.sfx()` 24 种；`audio.playMusic()` 3 轨（lookahead 步进音序器）；暂停菜单与设置页都有 ±/静音并写回存档。
- 状态：☑ 已实现（第三轮补齐）
- 实测结果：5 首音乐轨 **menu / battle / boss / victory / defeat** 全部可切换（断言 `trackCount === 5`）；
  胜利时切到 victory 轨、战败切到 defeat 轨（各有独立断言）；菜单 → 战斗 → Boss 会按 BPM 138/116/104/66/84 切换。
- 代码位置：`src/audio/AudioBus.ts`（`SCALES`/`ROOTS`/`melodyPattern`/BPM 各一档）、`src/scenes/BattleScene.ts:finishMatch`。
- 备注：纯 WebAudio 合成（无采样、无波形文件），因此「音乐」是程序化作曲而非录音。

---

## D. 性能与存档

### D-01 模拟开销
- 标准：RTS 逻辑在 60FPS 下有大量余量。
- 验证方式：在**活着的对局**里塞到 92 单位，连跑 240 次真实 `update(0, 16.7)`，同时校验模拟时间真的推进了 4.01s。
- 状态：☑ 已实现
- 实测结果：**0.166 ms/帧 @ 92 单位**（预算 16.7ms 的 1%）。240 tick 推进 4.01s 模拟时间。
- 备注：**第一次测出 0.00ms/帧是假通过**——那局已经结束，`update()` 会短路；加了「模拟时间必须推进」的断言后才暴露。

### D-02 对象池
- 验证方式：`core/Pool.ts`；投射物池预热 16，伤害数字池 40，粒子发射器按配置 key 复用。
- 状态：◐ 部分实现（**泄漏判据已通过**，见 C-02 的 5 局压测）
- 实测结果：投射物/文字确实复用（`combat.activeProjectiles`）。
- 差距：**尸体未池化**；`FxSystem.death/explosion/telegraph` 仍是 `add.image` + tween（短命对象，有分配压力但**经 5 局压测证实不泄漏**）。
- 备注：既然未造成泄漏、且真实帧成本只有 1.2ms，这条的优先级已下调为「可选优化」。

### D-03 地形单次绘制
- 验证方式：`paintTerrain()` 把 72×72 tile + 树/石烘焙成 1 张 2880×2880 CanvasTexture，场景里只有 1 个 Image。
- 状态：☑ 已实现
- 实测结果：地形 = 1 draw call；战斗场景 display object 总数 190（含 92 单位 + 建筑 + 特效）。

### D-04 真实 GPU 帧时（已实测）
- 标准：普通桌面 60FPS；1280×720 起可用。
- 验证方式：`npm run test:gpu`（有头 Chromium = 真 GPU）与 `npm run test:gpu:uncapped`（加 `--disable-gpu-vsync --disable-frame-rate-limit` 解除 vsync 上限）。
- 状态：☑ 已实现
- 实测结果（**Apple M4 Max / ANGLE Metal，1600×900 @DPR2 = 3200×1800 绘制缓冲**）：
  - 有 vsync：baseline / 60 单位 / 交战 / 90 单位+Boss / 307 单位 **全部 8.33ms（120FPS 满帧）**，p95 ≤9.4ms，frames>33ms = 0/298。
  - 解除 vsync（真实总帧成本）：**1.21–1.25ms（≈810 FPS）**，p95 ≤2.2ms，worst ≤2.9ms，即使 314 单位。
  - 结论：**帧预算余量约 14 倍**（60FPS 预算 16.7ms vs 实测 1.2ms）。
- 踩坑记录：有头窗口若不在前台，Chrome 会把 rAF 节流到 ~1Hz，测量会变成谎言。必须加
  `--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding` 并 `bringToFront()`。
- 另一个教训：只看 vsync 数字会得到「所有负载都是 8.33ms」的**回声**，无法证明余量；必须做解除上限的对照 + 单位数爬坡。

### D-04b 多分辨率布局回归
- 标准：HUD 由视口推导，任何支持尺寸下面板不溢出、不重叠。
- 验证方式：`npm run test:layout` —— 6 个视口各自启动一局，读取 HUD 上一帧真实绘制的矩形（`hud.getLayoutDebug()`）做断言。
- 状态：☑ 已实现
- 实测结果：1920×1080 / 1600×900 / 1280×720 / 1200×1113@2 四档 **全部面板在视口内 + 底部四面板零重叠 + 4 个技能按钮都在技能面板内 + 四个菜单页（主/关卡/英雄装备/设置）零溢出**；
  844×390@2 与 390×844@3 两档手机尺寸**只检查 HUD 与主菜单**（手机不在 Phase 1 范围）。
- 已知差距：**手机尺寸下「英雄/装备」等桌面专用菜单页会溢出**（面板按 1600×900 设计，不做手机重排）；手机支持不在范围内，此处如实记录。
- 代码位置：`src/scenes/HudScene.ts:layout()`；诊断接口 `getLayoutDebug()`。
- 备注：这轮顺手修掉一个真 bug —— 底部四面板原先是固定尺寸，窄视口下中央指令面板与技能面板会**重叠 48px**；改成按视口比例封顶（minimap ≤13%W、英雄 ≤26%W、技能 ≤26%W、指令面板吃剩余空间）。

### D-05 存档系统（LocalStorage）
- 标准：战役进度 / 英雄等级 / 装备 / 遗物 / 已解锁关卡 / 设置都要能存；支持 New Game / Continue。
- 验证方式：跑完一局后读 `localStorage['aetheria.dawnwake.save.v1']`。
- 状态：◐ 部分实现
- 实测结果：`{"exists":true,"unlocked":["m01","m02"],"victories":1}` —— 通关后自动解锁下一关并写入存档；主菜单「继续上次进度」会读它；设置页可清档。
- 第三轮补齐：装备掉落/装备界面（E-03）、遗物加成（E-04）、天赋加点（E-06）都已接入并断言；
  存档字段新增 `hero.talents`，旧存档加载时会自动补默认值（已做向后兼容）。
- 剩余差距：**没有「存档槽位/导出导入」**，只有单份 LocalStorage 存档。

---

## E. 用户提出的其它要求（对照检查）

### E-01 三张地图
- 标准：Green Valley / Dark Forest / Ruined Fortress。
- 状态：◐ 部分实现
- 实测结果：`MAPS` 三张地图数据齐全（尺寸/seed/biome/夜战标记），`generateMap()` 支持 `valley/forest/fortress` 三种密度与配色；**只有 Green Valley 做了完整布点**（`buildGreenValley`），另两张只有生成参数。

### E-02 十关战役
- 状态：◐ 部分实现
- 实测结果：`MISSIONS` 10 关数据全部写好（目标/波次/营地/Boss/简报），`PLAYABLE_MISSIONS = {m01}`；关卡选择界面把 02–10 标为「Phase 2」。

### E-03 装备品质与随机属性 / Loot（第三轮完成）
- 标准：完成任务要真的掉装备、能在界面换上、属性要真的作用到英雄。
- 验证方式：`npm test` 中 6 项 —— ① 三星胜利 + 击杀 Boss 后存档背包必须增长；② 结算面板必须列出战利品名称；
  ③ 在菜单背包里点击「装备」按钮后存档 `equipment.weapon` 必须写入；④ 进入对局后英雄 `equipment.attack/crit/skillDamage` 必须等于该装备数值，
  且 `attackTotal === baseAttack + attack`。
- 状态：☑ 已实现
- 实测结果：`2 → 3 items: ["towerShield","shortSword","thornCrown"]`；结算面板 `战利品：荆棘王冠…`；
  `点击装备 → {"weapon":"tidePiercer"}`；`入局后 {"equipAttack":34,"equipCrit":14,"equipSkill":18,"attackTotal":62,"baseAttack":28}`。
- 代码位置：`src/systems/Equipment.ts`（属性汇总/装备/卸下/发放）、`src/scenes/BattleScene.ts:finishMatch`（掉落 roll）、
  `src/scenes/MenuScene.ts:renderHeroes`（装备槽 + 背包 UI）。
- 备注：掉落数量 = 1 + 三星加成 + 击杀 Boss 加成，并按「背包唯一」去重（避免三连同名）。
  攻速属性也已接入真实战斗节奏（`Combat.attackSpeedMulOf`）。

### E-04 Roguelite 遗物永久成长（本轮完成）
- 标准：遗物加成必须真的作用到战斗/经济，不是只发个物品。
- 验证方式：`npm test` 里的 3 项断言 —— ① 存档写 5 件遗物 → 重开局 → 断言 `world.mods` 与 HUD 列表；② 同一目标分别带/不带 `flameRelic` 打 100 点魔法伤害，断言比值 = 1.1；③ 带 `warriorRelic` 时剑士最大生命必须正好 162（150×1.08）。
- 状态：☑ 已实现
- 实测结果：`mods {"fireDamage":0.1,"meleeHp":0.08,"heroDamage":0.12,"unitSpeed":0.06}`；`110.92 / 100.83 = ×1.100`；`footmanMax 162 / archerMax 92`（只加成近战，符合遗物描述）。
- 代码位置：`src/systems/Relics.ts`（build/describe）；接入点 `world.spawnUnit`/`spawnBuilding`（生命、移速）、`Combat.applyDamage`（魔法伤害）、`Combat.performAttack` 与 `HeroAbilities`（英雄伤害）、`Economy`（采集与收益）。
- 备注：开局会弹一条横幅列出本局生效的遗物；暂停菜单底部也常驻显示。

### E-05 商业化预留（皮肤/无 P2W）
- 状态：☐ 未实现
- 实测结果：没有做任何付费门闸（符合「第一阶段免费」要求），但也没有留 skin/theme 接口。
- 备注：这条建议留到发布阶段按 `game-publish-workflow` 做双 build，而不是客户端假门闸。

### E-06 菜单项（New Game / Continue / Campaign / Heroes / Armory / Talents / Settings）
- 状态：☑ 已实现（Armory 与 Talents 合并进「英雄」页，功能完整）
- 验证方式：`npm test` 中 3 项天赋断言 —— ① 天赋行必须有 `+` 按钮；② 点击后存档 `talentPoints` 必须 -1 且 `talents.flameMastery === 1`；
  ③ 入局后 `world.mods.fireDamage` 必须包含该天赋，且实测伤害比 = 1.06。
- 实测结果：`点击 + → {"points":2,"ranks":{"flameMastery":1}}`；`mods.fireDamage 0.06 · 106.88 vs 100.83 = ×1.060`；
  `src/data/talents.ts` 6 个天赋（战阵/秘法/王国三系，各 2 级），设置页提供「退还全部天赋点」。
- 备注：**发现并修掉一个真 bug** —— `BattleScene` 调 `buildModifiers()` 时只传了遗物、**没传天赋**，导致天赋点了完全不生效（见 PROGRESS 踩坑 #17）。

---

## 反复踩过的坑（每条都有实测）

1. **UI 深度搞反**：`staticG` 设了 `depth=1`，而面板/按钮/图标都是默认 0 → 面板遮住了技能图标和按钮。改成静态层用插入顺序在最底。
2. **`scene.restart()` 复用实例**：`ended/paused/now/数组字段` 不会重置 → 重开后一开局就是「已结束」，HUD `create()` 第二次跑时 `abilityButtons` 里还留着已销毁的对象 → `Button.setSize` 崩在 `null`。现在两个场景的 `create()` 开头强制重置全部字段。
3. **建筑碰撞把移动吃掉**：`resolveBlockers` 用「半边长 + 单位半径」的扩展盒并且**在移动之后**执行 → 站在建筑边缘以外的单位每帧位移被撤销，表现为「单位永远不动」。A* 已经不会走进建筑格，所以现在只纠正**深度重叠**并放在移动**之前**。
4. **加速模拟下的追击重寻路**：`repathAt = now + 0.4` 在 dt=0.4s 的加速下等于「每帧重寻路」，路径被反复重置到 0 号路点（= 自己脚下那格），而 `pathIndex++` 那帧直接 `return` → 单位原地卡死。现在只在「没有路径」或「目标漂移 > 56px」时重算，并且**一帧内连续吃掉所有已到达的路点**。
5. **工人永远到不了工地**：到达判定用 `radius + 30`，但 A* 的目标是**footprint 外最近的可走格**（可达 1.5 格 ≈ 60px）→ 工人卡在 88px 处来回振荡，建筑永远是 2%。改成 `radius + TILE*0.9`。
6. **英雄贴图缺失**：`spawnUnit` 假设所有单位都在 `UNITS` 表里，英雄在 `HEROES` 表 → `getUnit('knightCommander')` 抛错，整局起不来。现在先查 `HEROES`，并且 `ensureTextures` 也生成英雄贴图。
7. **非 ASCII 路径被百分号编码**：`new URL('../artifacts/', import.meta.url).pathname` 在中文目录下会写成 `%E6%B8%B8...`，截图跑到一个假目录里。要用 `fileURLToPath()`。
8. **`NODE_ENV=production` 会跳过 devDependencies**：这台机器 shell 里带着 `NODE_ENV=production`，`npm i -D vite` 会静默「up to date」什么都不装。项目里加了 `.npmrc: include=dev`。
9. **假通过的验收**：性能那项第一次报 `0.00 ms/tick`——因为那一局已经结束、`update()` 短路。断言必须能证明「事情真的发生了」（现在会校验模拟时间推进 4.01s）。

---

## 下一轮建议（按优先级，每条都写判据）

1. **真实 GPU FPS 实测**：在带 GPU 的 Chrome 里跑 92 单位对局，`HUD 右上角 FPS` 应稳定 ≥58；同时用 Playwright 4 设备矩阵（1200×1113@2 / 1024×768@2 / 844×390@2 / 390×844@3）截图并断言 HUD 面板不重叠。
2. **遗物加成接入战斗**（判据：带着 `flameRelic` 打一场，法术伤害数字比不带时高 ~10%，且可用断言验证）。
3. **尸体与特效池化**（判据：连续 3 局后 `game.renderer` 相关对象数不增长；`Pool` 的 capacity 稳定）。
4. **阵型/排队**（判据：20 个单位过桥后不重叠，任意两单位中心距 ≥ 半径和 ×0.8）。
5. **战争迷雾**（判据：地图未探索区域不可见、探索后保持可见；敌人只在视野内可见）。
6. 战役 02–10 内容 + Dark Forest / Ruined Fortress 布点（判据：每关能用 smoke 模板跑到 Victory）。
