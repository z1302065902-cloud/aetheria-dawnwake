# 发布验收脚本 / Release acceptance checks

这些脚本是**发布验收的证据生成器**（不是单元测试，故不叫 *.test.ts）。

| 脚本 | 作用 |
|---|---|
| `_release-accept.mjs` | **一键验收三平台**：Pages / Vercel 载入后进战斗（断言单位/建筑/HUD），itch 点 Run game 进官方播放器 frame 断言引擎启动 |
| `_itch-play.mjs` / `_itch-play2.mjs` | itch 专用：点击 Run game → 等 `html-classic.itch.zone` frame → 断言 `__AETHERIA__`，并抓 frame 内失败请求 |
| `_itch-dump.mjs` | 抓 itch 商店页的图片（截图）与正文，核对商店页内容 |
| `_afdian-anon.mjs` | **匿名复核**：全新无 cookie 浏览器打开创作者主页（发布验收要求"已登录视角不算验证"） |
| `_afdian-anon2.mjs` | 匿名看「动态」标签（爱发电要求实名认证后动态才对公众可见） |

## 运行方式

需要全局网络能到各平台（LetsVPN 全局模式）或先起 `scripts/tunnel-proxy.py` 后加 `--proxy-server=http://127.0.0.1:8899`：

```bash
node tests/release-checks/_release-accept.mjs
node tests/release-checks/_afdian-anon.mjs
```

## 最近一次结果（2026-09-24）

```
GitHub Pages   ✅ 引擎+战斗可跑 {"units":22,"buildings":14,"hud":true} · 报错=无
Vercel         ✅ 引擎+战斗可跑 {"units":22,"buildings":14,"hud":true} · 报错=无
itch.io        ✅ 引擎启动=true · frame=https://html-classic.itch.zone/html/19379983-2011717
```
