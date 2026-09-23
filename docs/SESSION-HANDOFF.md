# 交接说明（给下一个会话 / 下一个 agent）

> 保存点：commit **efe5c24**（`feat(singleplayer): hero-adventure / army-war / base-growth redesign`）
> 工作区干净，`main` 分支（无远端）。类型检查干净。

## 一、先跑这三条，确认基线没坏

```bash
cd "/Users/zsy/Desktop/游戏项目/aetheria-rts"

npx vite --port 5173 --strictPort &      # 测试都依赖 dev server
npm run typecheck                        # 必须干净
npm test                                 # 期望 60/60
npm run test:singleplayer                # 期望 15/15
npm run test:campaign                    # 期望：10 关地图全 PASS，5 关 victories 仍 FAIL
```

其他套件：`npm run test:layout`（24/24）· `npm run test:soak`（6/6）· `npm run test:gpu`（11/11，会弹窗）。
`npm run test:prod` 需要先 `npm run build` 再 `npm run preview`。

## 二、当前真实状态（不要当成全绿）

| 套件 | 结果 |
|---|---|
| smoke（`npm test`） | **60/60** |
| singleplayer（`npm run test:singleplayer`） | **15/15** |
| campaign（`npm run test:campaign`） | 36 PASS / **5 FAIL** |
| tsc | 干净 |

**campaign 的 5 个 FAIL 全是 `reaches Victory`**（地图生成、连通性、寻路、目标数量都已 PASS）：

| 关 | 卡住的目标 | 已定位的根因 / 下一步 |
|---|---|---|
| m01 | `o2 建造一座兵营` 之后的链 | 需要复查：自动生产是否在测试的快进节奏下把链打断（先用 `automation.holdProduction` 或关掉 autoProduction 复现） |
| m04 | `o2 rescue` | 囚犯会被流弹/中立怪打死 → 目标直接 `failed`。修法：**被囚期间不可被攻击**，获救后才可被攻击 |
| m06 | `o1 collect 两处魔法神龛` | `Building.captured` 的置位路径没生效。修法：查清谁应该置位（玩家单位进入神龛范围应触发占领），并在 `Mission.checkObjective` 的 collect 分支用同一来源 |
| m08 | `o2 rescue` | 同 m04 |
| m09 | `o2 击败虚空巫师` | 营地清空后 `ai.spawnBoss()` 没真正生成 Boss。修法：查 `AIController.spawnBoss` 的前置条件（`bossSpawned` / camp 判定） |

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
