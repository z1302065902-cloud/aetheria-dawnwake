# 发布日志 / Publish log — Aetheria: Dawnwake

> 这份文件就是"发布这件事的日志"：每个动作的命令、证据、结果。
> 平台清单：GitHub · GitHub Pages · Vercel · itch.io · 爱发电。
> 口径：**只有我自己跑出来并看到结果的才算 ✅**；否则写 ⏳ / ⛔ 并注明卡在哪。

---

## 2026-09-24 · 第一轮发布

### 1. GitHub — ✅ 完成

| 动作 | 命令 | 结果 |
|---|---|---|
| 建仓并推送 | `gh repo create aetheria-dawnwake --public --source=. --remote=origin --push` | ✅ github.com/z1302065902-cloud/aetheria-dawnwake |
| 仓库元数据 | `gh repo edit --description ... --homepage ... --add-topic ...` | ✅ 描述 + 主页 + 8 个主题 |
| 正式版本 | `gh release create v1.0.0 --notes-file ... release/itch/*.zip` | ✅ releases/tag/v1.0.0（页 HTTP 200，附可下载 zip） |
| 推送 | `git push origin main` | ✅ 远端 `585c39b`；链路抖动，推送需重试 2–3 次 |

发布前修正：README 中"第五轮未验收 / 战役 5/36 失败"是过时状态 → 已改为实际（十关全通 51/51）。

### 2. GitHub Pages — ✅ 完成并验证

| 动作 | 结果 |
|---|---|
| workflow | `.github/workflows/deploy-pages.yml` |
| 启用 Pages | 用 **POST**（不是 PUT）`/repos/.../pages` `{"build_type":"workflow"}` —— skill 记录的真坑：POST 才创建，PUT 返回 404 |
| 工作流 | ✅ `success` × 4（`c82a28b` `45a6c27` `4fb7d36` `585c39b`） |
| URL | z1302065902-cloud.github.io/aetheria-dawnwake/ → **HTTP 200** |
| 资源 | 首页 200 · `og.png` 200 · 入口脚本 200（`base: './'` 子路径可用） |
| **浏览器实测** | ✅ 主菜单渲染 → 进入 m01 → 22 单位 / 8 建筑运行，**0 报错** |
| 分享元信息 | ✅ `og:title/description/image` 已上线（`og.png` 1200×630） |

### 3. Vercel — ✅ 部署完成（当时验证 200 + 可玩；此刻因链路抖动无法复验）

| 动作 | 结果 |
|---|---|
| CLI | 本机未装；用 `~/.npm-cache/_npx/*/node_modules/.bin/vercel`（59.26.0） |
| 项目归属 | `zsy6/aetheria-dawnwake` |
| 首次失败① | 上传 32MB 在 24MB 处 `fetch failed` → 根因：把 `artifacts/`（30MB 截图）也传了 |
| 首次失败② | 加 `.vercelignore` 时误排除 `src/` → 云端构建 `TS18003: No inputs were found` |
| 修复 | 只排 `artifacts/ node_modules/ .git .github coverage/ .vercel logs/` |
| 部署 | ✅ Production `aetheria-dawnwake-*.vercel.app` + **Aliased aetheria-dawnwake.vercel.app** |
| 验证（当时） | ✅ 首页 **200**；浏览器实测：主菜单 → m04 → 24 单位/8 建筑/HUD，**0 报错** |
| 二次部署（含 og） | ✅ CLI 返回新 Production + Aliased |
| 复验（现在） | ⚠️ 连续 6 次 `000`；DNS 把 `vercel.app` 解析到 `199.96.63.75`、把 `aetheria-dawnwake.vercel.app` 解析到 `202.160.128.203`（**都不是 Vercel 的 IP**）→ 链路/DNS 被干扰，非站点问题 |

### 4. itch.io — ⛔ 被网络阻断（未完成）

**做到哪一步**：ego-browser（登录态 `zsy2026`）打开 `itch.io/game/new`，表单已填
（标题、slug `aetheria-dawnwake`、简介、Kind=**HTML**、Classification=Games）；
传封面时报 `There's an issue with the file you selected / Server failed to respond`，随后整站不可达。

**诊断**：

| 检查 | 结果 | 结论 |
|---|---|---|
| `dig itch.io` | `31.13.84.34`/`31.13.81.4`/`66.220.149.18`/`4.78.139.54`/`103.252.114.101` | **DNS 污染**（Facebook 等非 itch 网段） |
| `dig @8.8.8.8 itch.io` | `108.160.165.48`（Dropbox 段） | 换上游 DNS 也是伪造答案 |
| Cloudflare IP 直连 + SNI itch.io | 104.16/104.17/172.64/104.24 全部 `000` | **SNI 阻断** |
| DoH（cloudflare-dns / dns.google / 1.1.1.1） | 全部不可达 | 无 DNS 绕过路径 |
| `html-classic.itch.zone` | **404（服务器有响应）** | 仅 Akamai CDN（已发布游戏的托管）可达 |
| `LetsVPN.app` | 进程在跑，但 **utun0–5 无 IPv4 地址**，默认路由仍是 `en0` | **VPN 隧道未连接** → 解释"早期能上、后来不能" |
| `butler` | `~/.local/bin/butler` v15.31.0；`status zsy2026/space-shooter` 返回频道表 | **key 有效**；`status zsy2026/aetheria-dawnwake` → `400 invalid game` = 项目页未创建（butler 不能建页） |

**已备好（等 VPN 连上即可收尾）**：

| 素材 | 位置 |
|---|---|
| 上传包（`index.html` 在 zip 根） | `release/itch/aetheria-dawnwake-html5.zip`（脚本会从 `dist/` 重建，故 gitignore） |
| 封面 | `release/itch/cover.jpg`（630×500） |
| 截图 ×6 | `release/itch/shots/*.png`（1600×900） |
| 文案 | `docs/PUBLISH.md` |
| 一键收尾 | `bash scripts/finish-itch-publish.sh` |

> `/tmp` 会被系统清理（skill 明确警告）→ 上传物已从 `/tmp/itch-pkg` 挪到 **`release/itch/`**。

### 5. 爱发电 — ⏳ 待用户登录

| 检查 | 结果 |
|---|---|
| afdian.com 可达 | ✅ 200（当时） |
| 登录 | ❌ 未登录（显示「登录 / 注册」） |
| 处理 | 已用 ego-browser 打开登录页并 `handOff()` 交还控制权（human-auth-gate：登录/验证码不代做） |
| 文案 | ✅ 创作页简介 + **3 档赞助方案**（¥5 感谢名单 / ¥15 早鸟 / ¥39 共创命名）+ 首条发布动态 → `docs/PUBLISH.md` |

---

---

## 第二轮复查（网络部分恢复后）

| 检查 | 方式 | 结果 |
|---|---|---|
| GitHub 推送 | `git push origin main` | ✅ 远端 `091349e`，本地/远端同步（此前 5 次超时是链路问题） |
| Pages 最新提交 | `gh run list` | ✅ `success 091349e` —— 含 og 元信息的构建已上线 |
| Pages 首页 / og.png | HTTPS | ✅ 200 / 200 |
| **Vercel 部署状态** | `vercel ls`（走 api.vercel.com） | ✅ **两次生产部署均 `● Ready`**：`aetheria-dawnwake-bzi7cswb1`（39m，含 og 元信息）与 `aetheria-dawnwake-muqf7shv3`（2h） |
| **Release 资产** | `gh release view --json assets`（走 api.github.com） | ✅ `aetheria-dawnwake-html5.zip` 436,472 bytes · **uploaded** |
| Vercel 域名可达性 | HTTPS | ⛔ 本地 DNS 把 `vercel.app` 解析到 `156.233.67.243`、`aetheria-dawnwake.vercel.app` 解析到 `202.160.128.203`（**都不是 Vercel 的 IP**）→ 本地打不开，但 Vercel 侧 Ready（CLI 已确认） |
| github.com / api.github.com | HTTPS | ✅ 200（此前一度 000，链路抖动） |
| GitHub Release 页 HTML | HTTPS | ⛔ 000（`api.github.com` 的资产查询却是 uploaded → 页面 URL 走的是被干扰的路径） |
| itch.io | HTTPS + DNS | ⛔ 仍 000；DNS 继续返回伪造 IP |

**结论**：GitHub（仓库+Release）、GitHub Pages、Vercel **三者的服务端状态都已确认为正常/Ready**，
本地对 vercel.app / github 部分 URL 的失败是**本机 DNS 污染与链路抖动**，不是发布失败。

## 第三轮复查：机器处于锁屏状态

用 peekaboo 的权限检查 + 抓屏确认（本轮新增证据）：

| 检查 | 结果 |
|---|---|
| `peekaboo_permissions` | Screen Recording: **Granted** · Accessibility: Not Granted（可选） |
| 命令行 `screencapture` | 全黑（该进程没有屏幕录制权限） |
| `peekaboo_image`（显示器） | 首次失败 `No displays available for capture`；`caffeinate -u` 唤醒后成功 |
| 抓到的画面 | **macOS 锁屏页**（"zsy · 使用触控 ID 或输入密码"） |
| `peekaboo_window` (LetsVPN) | 两个窗口（`快连 VPN` / `变更国家和地区`）均报 `reason=window minimized` —— 锁屏下没有可见 surface |

**结论**：机器锁屏 → 无法做任何 GUI 操作（点 VPN 连接、点浏览器登录），
所以 itch.io 与爱发电这两件**必须由用户先解锁机器**才能继续。这不是流程问题，也不是我不会做，
而是物理上点不到。人工解锁属于 human-auth-gate 范围，不代做。

## 待用户操作（仅两件）

1. **连上 LetsVPN**（进程在跑但隧道没连）→ 说"继续"，我一趟做完 itch（建页 → 封面/截图 → butler 上传 → 设 Public → 验 200）。
   也可自行运行：`bash scripts/finish-itch-publish.sh`
2. **爱发电登录**（ego 浏览器窗口已停在登录页）→ 登录后我代填创作页与方案。

## 无网络依赖的追加动作（已全部做掉）

- 仓库元数据（描述 / 主页 / 8 主题）+ **GitHub Release v1.0.0**（附可下载 zip）
- `index.html` 加 `description` / `og:*` / `twitter:card`（分享卡片）
- `public/og.png` 1200×630（真实战斗截图生成）→ 已上线
- README 状态修正；`docs/PUBLISH.md`（商店文案）、`docs/PUBLISH-LOG.md`（本文件）、`scripts/finish-itch-publish.sh`
