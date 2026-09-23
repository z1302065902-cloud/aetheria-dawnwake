# 验证运行日志（原始输出留档）

保留每一次验收运行的原样输出，供下一轮定位问题用（不要只留结论）。

| 文件 | 命令 | 结果 |
|---|---|---|
| `2026-09-23-smoke-run.log` | `node tests/smoke.mjs`（dev 5173） | ✅ **60/60 checks passed, 0 failed**（第五轮 WIP 未回归原玩法） |
| `2026-09-23-campaign-run.log` | `node tests/campaign.mjs`（dev 5173） | 31 PASS / **5 FAIL** —— m01 m04 m06 m08 m09 走不到 Victory |

补测待办（下一轮必须补上）：
- `node tests/singleplayer.mjs`（单人向设计断言：自动化 / 编组 / 冒险 / 祝福）—— 本轮未取回结果
- `node tests/campaign.mjs` —— 目标 36/36
