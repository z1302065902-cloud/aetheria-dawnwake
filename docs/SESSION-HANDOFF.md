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
npm run test:campaign                    # 期望 41/41：10 关全部能打到 Victory
```

其他套件：`npm run test:layout`（24/24）· `npm run test:soak`（6/6）· `npm run test:gpu`（11/11，会弹窗）。
`npm run test:prod` 需要先 `npm run build` 再 `npm run preview`。

## 二、当前真实状态（不要当成全绿）

| 套件 | 结果 |
|---|---|
| smoke（`npm test`） | **60/60** |
| singleplayer（`npm run test:singleplayer`） | **15/15** |
| campaign（`npm run test:campaign`） | **41/41**（10 关全部打到 Victory） |
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

1. **打通上面 5 关到 Victory**（根因都已定位，属于修 bug 不是加功能）。
2. **把隐藏/支线目标数据写满 10 关**：机制（`ObjectiveDef.hidden` + `revealAfter`）已就绪，只差数据。
3. **地图级随机事件**：目前只有定时波次 + 虚空裂隙；补流浪商人 / 天降陨石 / 兽群迁徙。
4. **5/10/15/20 分钟节奏调参**：写 `tests/pacing.mjs` 量出来（第一关：5 分钟懂、10 分钟首次升级、15 分钟第一场大会战、20 分钟通关）。
5. **结算页**展示本局祝福 + 冒险发现清单（"再玩一局"的动力）。

## 四、改代码前必读的坑（都踩过、都在 `docs/PROGRESS.md`）

- **HudScene.create() 必须重置每一个 `create()` 填充的数组**。这个坑出现过两次（`feedTexts`、单人面板数组），第二次已做结构性修复：`Button.isAlive()` + 所有 setter 早返回。**新增 UI 池数组时，先去 create() 的重置块加一行。**
- 别对共享纹理用 `TileSprite`（它会 `frame.setSize` 改坏共享帧）。
- 同名同尺寸的 canvas 纹理要**复用**（`clearRect` + 重绘 + `refresh`），不要 remove/create——旧对象会持有死帧。
- 玩家的手动指令必须压过自动化：新加任何自动化行为，先问"它会不会覆盖玩家刚下的令"。
- 自动化只碰 `idle` 单位，且永远不要把工人从工地拉走。
