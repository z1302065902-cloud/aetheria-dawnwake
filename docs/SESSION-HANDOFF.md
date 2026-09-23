# 交接说明（给下一个会话 / 下一个 agent）

> 保存点：见 `git log -1`（本文档随代码一起提交）
> 工作区干净，`main` 分支（无远端）。类型检查干净。

## 一、先跑这三条，确认基线没坏

```bash
cd "/Users/zsy/Desktop/游戏项目/aetheria-rts"

npx vite --port 5173 --strictPort &      # 测试都依赖 dev server
npm run typecheck                        # 必须干净
npm test                                 # 期望 60/60
npm run test:singleplayer                # 期望 15/15
npm run test:campaign                    # 期望 51/51：10 关全部能打到 Victory + 三档任务齐备
```

其他套件：`npm run test:layout`（24/24）· `npm run test:soak`（6/6）· `npm run test:gpu`（11/11，会弹窗）。
`npm run test:prod` 需要先 `npm run build` 再 `npm run preview`。

## 二、当前真实状态（不要当成全绿）

| 套件 | 结果 |
|---|---|
| smoke（`npm test`） | **60/60** |
| singleplayer（`npm run test:singleplayer`） | **20/20** |
| pacing（`node tests/pacing.mjs`） | **2/5**（英雄升级达标；部队/会战/通关被下面的 bug 卡住） |
| campaign（`npm run test:campaign`） | **51/51**（10 关全部打到 Victory + 每关主/支线/隐藏齐备） |
| tsc | 干净 |

**已全部修好**（都是真 bug，不是测试凑数）：

| 关 | 症状 | 根因 | 修法 |
|---|---|---|---|
| m01 | 目标链卡在 o2 | 测试没有真的造兵营（**测试缺口**） | 测试按 `build` 目标真的放一座兵营并施工 |
| m04 | `o2 rescue` 不触发 | `explore` 目标用 `isVisibleWorld`（当前可见），走开就失效 → o2 永远 pending | 改为 `isExploredWorld`：**"找到"＝已发现**，路过即算 |
| m06 | `collect 两处神龛` 只有 1 座 | `MatchSetup` 只把 `manaShrines[0]` 变成可占领建筑 | **每个神龛都生成**可占领建筑 |
| m08 | `o2 rescue` 直接 failed | ① 囚犯生成位置 = 敌营 y+60px，而敌营在地图最底边 → **生成到地图外被拒**；② 生成失败被当成"囚犯已死" | ① `safeSpot()` 夹紧坐标 + 递增半径找空地 + 兜底到基地；② 加 `rescueTargetSpawned`，"从未生成"不再判失败 |
| m08 | 救出后又被杀 | 获救后囚犯可被攻击（**这是正确设计**：营救后要护送），是测试脚本太慢 | 测试在同一次迭代内完成"救人→带回家"，该段速度降到 1 |
| m09 | `o2 攻城器械必须存活` | 关卡从没给玩家投石车 → **目标不可能完成** | `setupMatch` 按 `defend.unitId` 目标发放该单位（符合关卡简报"用投石车砸开祭坛"） |
| m09/m10 | Boss 目标不完成 | **`bossSpawned` 有两份**（`ai.*` 与 `missions.*`），直接调 `ai.spawnBoss` 只设前者 | 统一为单一来源：`AIController.spawnBoss` 里写 `ctx.missions.bossSpawned` |
| 冒烟回退 | 工人"凭空消失" | 建造检查时 `elapsed=250`，**波次敌人已在场上杀工人**（隔离只挡了新波次） | 隔离时同时清掉在场敌人并回满血 |

## 三、下一步优先级（设计契约在 `docs/singleplayer-design.md`）

1. ~~打通 10 关到 Victory~~ ✅ 完成（51/51）。
2. ~~隐藏/支线目标数据写满 10 关~~ ✅ 完成（每关 1 支线 + 1 隐藏，测试已断言）。
3. ~~地图级随机事件~~ ✅ 完成（`src/systems/MapEvents.ts`，三类事件已断言）。
4. **5/10/15/20 分钟节奏**（下一步第一优先）：`tests/pacing.mjs` 已就绪并能量出数据。
   英雄升级 **2:59 ✅**（目标 ≤10:00），但**部队/会战/通关被下面这个 bug 卡住**。
5. **结算页**展示本局祝福 + 冒险发现清单 + 解锁进度（"再玩一局"的动力）。

### 当前唯一的阻塞 bug：工人到达不了资源点（采集零入库）

**复现**：`node tests/pacing.mjs`（脚本玩家开局造兵营+靶场）。t≈100s 后 4 个工人全部 `gatherGo`，
`deposits: 0`，金恒为 40 → 生产停摆 → 没有部队 → 无法通关。

**已排除的**（都实测过，不是原因）：
- 寻路失败：`path.findPath(工人格, 资源格)` 返回有效路径（pathLen 2–3，两端格都可走）
- 单位被卡死：`stuckTimer === 0`，且给同一工人下**手动移动令后它走了 432px**（移动系统正常）
- 自己站在阻塞格：`ownTileFree === true`
- 资源耗尽：`nodes: 13`（有货）

**关键线索**：
1. 同一轮里曾抓到 `findPath` 返回的路径**包含阻塞格甚至越界航点**（`wp=[(1260,1780)]` 但地图只有 52 格高）——
   怀疑寻路在"目标格被资源占据/不可达"时会做 best-effort 并返回不合法航点。
2. 另一轮路径完全合法，但工人 17 秒停在同格；`dist` 在 287→344 之间来回（在目标附近打转，不接近）。
3. **手动右击近处矿点采集是正常的**（smoke 测试的 `gather: gold deposited increases` 一直通过，
   那时工人距矿点约 92px）。所以问题很可能出在**远距离/自动选点**这条路径上。
4. `Economy.gatherGo` 的到位判定是 `dist < node.radius + 26`（≈46px）。如果寻路终点落在
   距资源格 1.5 格以上，工人会永远停在阈值外，而 `repathAt` 每秒重算 → 打转。

**下一步建议**：先给 `Economy.gatherGo` 加"连续 N 次重算仍未到位 → 换节点 / 直接用
`path.nearestFree` 取资源格旁的可走格作为终点，并用该格距离做到位判定"，再用 `tests/pacing.mjs` 验证
`deposits > 0`。同时在 `Pathfinder` 里断言"返回路径的每个航点都必须 `isFree`"，把不合法航点挡在源头。

**本轮顺带修掉的真实 bug（都已提交）**：
- 连放两座建筑时，第二次 `startConstruction` 会抢走第一批工人的 `buildId` → 第一座工地永远没人建
  （现在 `startConstruction` 不会抢别的工地的工人，且 `BuildSystem.staffSites` 会给空工地自动补人）
- 工地完工后，部分工人会**永久停在 `build` 状态**（`buildId` 仍指向已完工建筑），而自动农民会跳过
  `buildId >= 0` 的人 → 经济死锁。现在建筑一完工就无条件释放工人，自动农民也只跳过"真正在施工"的人
- 自动生产会一直造最便宜的农民，把金币花光 → 永远没有军队（现在按"工人/军队缺口"轮流生产，
  且不会为了便宜买替代品，会为目标单位攒钱）
- 固定"建造保留线"在 m01 直接饿死生产（420 金造两座建筑后只剩 140，保留线 220）→ 改为
  "玩家进入放置模式 + 有未完工工地时暂停花费"
- `this.feed = []` 被误插进视野更新里 → 每 0.15 秒清空一次战斗日志

## 四、改代码前必读的坑（都踩过、都在 `docs/PROGRESS.md`）

- **HudScene.create() 必须重置每一个 `create()` 填充的数组**。这个坑出现过两次（`feedTexts`、单人面板数组），第二次已做结构性修复：`Button.isAlive()` + 所有 setter 早返回。**新增 UI 池数组时，先去 create() 的重置块加一行。**
- 别对共享纹理用 `TileSprite`（它会 `frame.setSize` 改坏共享帧）。
- 同名同尺寸的 canvas 纹理要**复用**（`clearRect` + 重绘 + `refresh`），不要 remove/create——旧对象会持有死帧。
- 玩家的手动指令必须压过自动化：新加任何自动化行为，先问"它会不会覆盖玩家刚下的令"。
- 自动化只碰 `idle` 单位，且永远不要把工人从工地拉走。
