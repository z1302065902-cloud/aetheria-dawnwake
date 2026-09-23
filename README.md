# Aetheria: Dawnwake · 以太利亚 · 黎明觉醒

单人幻想即时战略（RTS）+ 英雄成长 + Roguelite 遗物的**网页游戏**（Desktop Web Browser）。
Phaser 3 + TypeScript + Vite，**全部美术与音效均由代码程序化生成**（无任何第三方素材，零素材版权风险）。

> 当前版本：**Phase 1 里程碑（可玩垂直切片）+ 第二轮硬化**
> 一局完整可玩：进入游戏 → 选英雄 → 采集 → 建造 → 生产 → 探索 → 战斗 → 英雄升级/阵亡复活 → 摧毁敌方营地 → Boss 现身 → 击败 Boss → 结算存档。
> 主线 15–30 分钟。
>
> **第二轮验收**：玩法端到端 **38/38**（dev 与生产构建各一遍）· 真实 GPU **8/8** · 响应式布局 **22/22**（6 视口）· 5 局泄漏压测 **6/6**。
> 真实帧成本 **1.21ms**（Apple M4 Max / 3200×1800 / 314 单位，解除 vsync 实测）≈ 60FPS 预算的 14 倍余量。

---

## 1. 快速开始

```bash
npm install          # 首次（注意：若 shell 里 NODE_ENV=production, 见 .npmrc 说明）
npm run dev          # 开发服务器 → http://localhost:5173
npm run build        # 类型检查 + 生产构建 → dist/
npm run preview      # 预览生产构建 → http://localhost:4173
npm run typecheck    # 只跑 tsc --noEmit
```

自动化验收 / 机器人试玩（需要先启动 dev 或 preview）：

```bash
npm run dev &                                   # 或 npm run preview &
node tests/smoke.mjs                            # 对 http://localhost:5173 跑 32 项断言
node tests/smoke.mjs http://localhost:4173       # 对生产构建跑同样的断言
node tests/capture.mjs                          # 生成 artifacts/ 里的截图
```

测试会驱动**真实输入**（鼠标框选、右键下令、点击 HUD 按钮）并断言玩法真的推进了：
工人采到金、建筑真的盖起来、兵真的训出来、真的打死敌人、目标真的推进、胜负真的触发、存档真的写入。

---

## 2. 操作

| 操作 | 键位 |
|---|---|
| 选择 / 框选 | 左键点击 / 左键拖拽 |
| 移动 / 攻击 / 采集 / 建造 | 右键 |
| 攻击移动 | `A` 然后再点地面 |
| 停止 / 驻守 | `S` / `H` |
| 英雄技能 | `Q` `W` `E` `R`（需要指向的技能再点地面） |
| 编队 | `1`–`5` 存储 / 调出（`Shift+1..5` 覆盖） |
| 编队队列指令 | `Shift` + 右键 |
| 镜头 | 鼠标中键拖拽 / 小地图点击 / `Space` 回到英雄 / 滚轮缩放 |
| 取消 / 暂停 | 右键或 `Esc` 取消；`Esc` 暂停菜单（含音乐/音效独立音量与静音） |

---

## 3. 世界观（100% 原创）

世界 **Aetheria** 正被「虚空潮汐」侵蚀。三支文明：

- **Dawn Kingdom 黎明王国**（玩家阵营）：骑士、弓箭手、法师、圣骑士、城堡。
- **Wildborn Clans 荒野氏族**（敌人）：兽人、野兽、萨满、狼骑兵、巨兽。
- **Voidborn 虚空族**（敌人）：虚空暗影、巫妖、飞行单位、远古巨龙。

Phase 1 玩家阵营只做黎明王国；敌人用荒野氏族 + 作为 Boss 的虚空单位。

**英雄（3 名，数据与技能全部实现）**

| 英雄 | 定位 | Q / W / E / R |
|---|---|---|
| 骑士指挥官 Knight Commander | 近战坦克 | 盾牌冲锋 / 战吼 / 旋风斩 / 神圣守护 |
| 奥术法师 Arcane Mage | 远程法术 AOE | 火球术 / 奥术风暴 / 陨石 / 闪现 |
| 游侠 Ranger | 远程输出 | 多重射击 / 陷阱 / 箭雨 / 鹰眼 |

**单位（可生产）**：拓荒者（工人）、剑士、弓箭手；侍从骑士 / 牧师 / 投石车数据已就绪（Phase 2 解锁）。
**建筑**：黎明城堡、兵营、射手营地、农庄（+8 人口）、守卫塔；法师塔/工坊数据已就绪（Phase 2）。
**资源**：金币（金矿）、木材（林地）、魔法水晶（神龛，可占领）。

---

## 4. 代码结构

```
src/
├── main.ts                  # Phaser 启动 / 场景注册
├── config/Constants.ts      # 世界尺寸、人口上限、性能预算、深度层、地形表
├── core/                    # Rng / EventBus / SpatialHash / Pool / SaveManager
├── data/                    # 数据驱动：units, buildings, heroes+skills, items, missions
├── art/                     # Palette / SpriteFactory（程序化贴图）/ TerrainPainter（整图烘焙）
├── audio/AudioBus.ts        # WebAudio 合成：20+ 音效 + 3 首循环音乐 + 独立音量
├── fx/FxSystem.ts           # 命中特效 / 伤害数字 / 屏幕震动 / 预警圈 / 尸体
├── world/                   # Entity, Unit, Hero, Building, ResourceNode, Projectile,
│                            # MapGen（地图生成）, MatchSetup（开局布点）, World（注册表+查询）
├── systems/                 # Pathfinder(A*), Movement, Orders, Combat, Economy, Build,
│                            # Production, AIController, HeroAbilities, Mission, Selection
├── scenes/                  # Boot / Menu / Battle / Hud
└── ui/UiKit.ts              # 面板 / 按钮 / 进度条（HUD 与菜单共用）
```

设计约束（已遵守）：**没有任何逻辑写进单文件巨石**；单位/建筑/英雄/技能/装备/任务全部在
`src/data/*.ts` 数据驱动；世界渲染不使用 DOM 覆盖层（HUD 是 Phaser 画布内绘制）。

---

## 5. 关键实现要点

- **地形 = 1 次 draw call**：整张 72×72 地图（树、石头直接烘焙进去）绘制成一张 CanvasTexture。
- **寻路**：网格 A*（八向、禁止切角、沼泽/道路不同代价），**每帧搜索预算 10 次**并做目标去重；
  群体移动只算 1 条路径 + 环形落点展开。
- **单位查询**：统一走 SpatialHash（分离/仇恨/溅射），没有 O(n²)。
- **对象池**：投射物、伤害数字、粒子发射器复用（`core/Pool.ts`）。
- **深度排序**：所有实体用 `ENTITY + y*0.01` 分层，避免逐帧排序。
- **战斗反馈**：每次命中都有剑光/火花 + 伤害数字 + 受击白闪 + 音效 + （大伤害）屏幕震动。
- **经济循环**：工人 → 资源点 → 携带回城 → 入库；建造进度只在有工人在旁时推进。

---

## 6. 已知限制（诚实清单）

未实现 / 部分实现的内容、以及每条的原因，全部记录在
[`docs/acceptance-phase1.md`](docs/acceptance-phase1.md)（含验证方式与实测结果）。
最需要注意的几条：

- **没有战争迷雾**（设计里提到的「隐藏区域」因此不能成立）。
- **装备/天赋只有数据**：掉落表与存档字段已就绪，但没有掉落触发点与加点/换装界面。
- **战役 02–10 与另两张地图只有数据**，不可玩（Phase 1 范围就是 1 张地图 1 关）。
- **胜利/失败只有音效，没有独立音乐轨**（要求 5 首音乐，现为 3 首 + 2 个 jingle）。
- **极窄路口（宽 1 格）仍可能互相顶住**：有位置松弛避让，但没有排队/让路逻辑。
- **地形偏「方块拼贴」**：草地是 3 色 40px 方块变化，远看有补丁感。
- 手机竖屏能保证不溢出，但字太小——手机不在 Phase 1 范围。

已关闭（第二轮验证）：~~遗物只发不生效~~ / ~~真实 GPU 60FPS 未实测~~ / ~~单位挤桥重叠~~ / ~~疑似纹理泄漏~~。

---

## 7. 文档

| 文件 | 内容 |
|---|---|
| `docs/PROGRESS.md` | **交接文档（换 agent / 隔天续做先读这个）**：状态、坑、调试钩子、环境 |
| `docs/acceptance-phase1.md` | Phase 1 验收清单：每条含标准 / 验证方式 / 三档状态 / 实测结果 |
| `docs/specs/2026-09-23-aetheria-design.md` | 设计稿：产品定位、范围表、架构、硬性验收、商业化红线 |
| `artifacts/` | 自动化测试产出的截图（菜单 / 开局 / 战斗 / 胜利 / 失败） |
