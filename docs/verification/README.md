# 验证运行日志（原始输出留档）

保留每一次验收运行的原样输出，供下一轮定位问题用（不要只留结论）。

| 文件 | 命令 | 结果 |
|---|---|---|
| `2026-09-23-campaign-run.log` | `node tests/campaign.mjs`（dev 5173） | 31 PASS / **5 FAIL**（m01 m04 m06 m08 m09 走不到 Victory） |
| `2026-09-23-smoke-partial.log` | `node tests/smoke.mjs`（dev 5173） | **跑到第 52 项时 0 FAIL**（进程被中断，未跑完；下次必须补全 60/60） |
