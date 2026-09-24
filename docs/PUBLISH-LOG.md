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

## 第四轮：itch.io 完成 ✅（关键突破：LetsVPN 分流模式）

**突破点**：VPN「看起来没连、实际连了」。诊断链条：

| 检查 | 结果 |
|---|---|
| `ifconfig` | `utun6: inet 26.26.26.1` ← **LetsVPN 隧道确实起来了**（`LetsVPN-NE` 扩展进程在跑） |
| `netstat -rn` | utun6 上有 **31 条精细路由**，但**默认路由仍是 en0** → 分流模式，itch 不在规则里 |
| `curl https://itch.io/` | 000（走 en0，DNS 污染 + SNI 阻断） |
| `curl --interface utun6 https://itch.io/` | **200** ✅ ← 决定性证据 |
| 系统解析器 | `socket.gethostbyname('itch.io')` → `172.67.69.99`（真实 Cloudflare IP；`dig` 仍返回伪造 IP，因为 dig 不走系统解析器顺序） |

**解法**：写 `scripts/tunnel-proxy.py` —— 一个把出站 socket `SO_BINDTODEVICE` 到 utun6 的本地 HTTP 代理，
于是 CLI 工具一条环境变量即可走隧道，且不需要 sudo：

```bash
python3 scripts/tunnel-proxy.py utun6 8899 &
export HTTPS_PROXY=http://127.0.0.1:8899
curl -x http://127.0.0.1:8899 https://itch.io/     # 200
```

**itch 发布全部完成**（逐项有证据）：

| 步骤 | 方式 | 结果 |
|---|---|---|
| 建项目页 | `scripts/create-itch-page.mjs`（ego-browser 自动化，登录态 zsy2026） | ✅ 跳到 `itch.io/game/edit/5048064` |
| 封面 630×500 | 同脚本上传（JPEG；PNG 曾被服务端拒） | ✅ 预览确认 |
| 6 张截图 | 精确点击 `.add_screenshot_btn`（首次点击落在视口外 y=-511 失败） | ✅ 页面上 6 张 347×195 缩略图 |
| Kind | 编辑页 `textbox [ref=117]` → 选 HTML | ✅ `Kind = HTML` |
| 可见性 | `game[published]` 单选 → `published`（注意值不是 `public`） | ✅ `published` |
| 上传本体 | `HTTPS_PROXY=... butler push dist zsy2026/aetheria-dawnwake:html5` | ✅ `UPLOAD #19379983 · BUILD <#2011717 · VERSION ab4a948` |
| 标题/slug | — | ✅ `Aetheria: Dawnwake · 以太利亚 · 黎明觉醒` / `aetheria-dawnwake` |
| **简介 + 详细描述** | `page.fill` 无效 → 改 **DOM 赋值 + 派发 input/change** | ✅ 51 字 + 1323 字落盘 |
| 公开页 | `https://zsy2026.itch.io/aetheria-dawnwake` | ✅ **HTTP 200** |
| **可玩性** | Playwright 挂代理 → 点 `Run game` → 进 itch 播放器 frame | ✅ `engine: true · splash: false · canvas: true`（唯一失败请求是 itch 自己的 GA） |

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

## 便捷工具（防"以后又不能用"）

| 工具 | 用途 |
|---|---|
| `scripts/with-tunnel.sh <命令>` | **自动识别隧道网卡 + 起代理 + 让命令走隧道**（CLI 在 LetsVPN 分流模式下默认走 en0，会 000） |
| `scripts/tunnel-proxy.py` | 上面那个代理本体（`SO_BINDTODEVICE` 到 utun6，无需 sudo） |
| `scripts/create-itch-page.mjs` | itch 建页自动化（填表 + 封面 + 截图 + Kind=HTML + Public + 保存） |
| `scripts/finish-itch-publish.sh` | butler 上传 + 验 200（已接入自动建页） |
| `release/itch/COPY-PASTE.md` | 手动建页抄写单（任何网络/设备可用） |

自测：`./scripts/with-tunnel.sh curl -s -o /dev/null -w "%{http_code}" https://itch.io/` → **200** ✅

## 防锁屏（按你的要求）

- ✅ `caffeinate -d -i -s` 常驻（阻止显示/系统空闲休眠；本轮已启动，pid 见 `pgrep caffeinate`）
- ✅ `defaults -currentHost write com.apple.screensaver idleTime -int 0`（屏保空闲 = 永不）
- ⚠️ **未动** `askForPassword`（唤醒需密码是安全项，我不会擅自关；你要真关就说一句，我给命令）

## 第五轮：爱发电（部分达成 —— 卡在平台实名认证）

**登录**：ego 浏览器内登录成功（`auth_token` 存在、头部出现「发布|管理|设置」）——注意**必须登在 ego 浏览器里**，
在 Chrome/Safari 登录我读不到（会话独立）。用户首次说"登录了"时，ego 里其实只有统计 cookie（`__qc_wId/_ga`），无会话。

**已完成**：
| 动作 | 结果 |
|---|---|
| 公开动态 | ✅ **已发布**（标题 `【发布】以太利亚 · 黎明觉醒 —— 单人幻想 RTS，浏览器直接开玩` + 443 字正文 + 三平台链接）；作者视角可见（`hasOurPost: true`） |
| 可见性设置 | ✅ 编辑器里选「**所有人可见**」（注意：不是默认的「所有赞助者」） |
| 踩坑① | 编辑器**没有「存草稿」**，只有直接发布；且**页面导航会丢草稿**（第一次填好内容后我跳页验证，回来编辑器已关闭 → 重填） |
| 踩坑② | 标题/正文用 `page.fill` 无效 → 必须 **DOM setter + dispatch input/change** |

**未达成（平台限制，非操作问题）**：匿名复核发现动态对公众**不可见**，页面显示平台原文：
> **「创作者需认证后即可发布动态、显示主页图片」**

| 匿名视角证据 | 结果 |
|---|---|
| `https://afdian.com/a/zsy2026`（Playwright 全新无 cookie） | 昵称显示为 **「未认证创作者」**，头像为占位图 |
| 主页标签 | 只列出 ¥7.00/月 的**方案（无方案名）** —— 方案匿名可见 ✓ |
| 「动态」标签 | **空**，并给出上述认证提示 |
| 后台（作者视角） | 动态存在、可 编辑/删除/置顶 ✓ |

**第二处独立证据（用户坚持"以前上传过不用认证"后复查）**：在用户**自己的后台**
`/setting/group`（电圈设置）页面上，爱发电原文写着：

> **「认证后即可使用电圈功能，3分钟认证一下吧！ →」**

并且 `/setting/creator` 的「正在创作」字段**改了三次都存不进去**（DOM setter / 真实键盘输入 + 点该区块
的「保存」按钮，重载后均还原为旧值），页面同时把昵称显示为「未认证创作者」——
**说明未认证状态下创作主页资料本身是只读/锁定的**，不只是动态。

**结论**：用户说的对一半 —— **赞助方案不需要认证**（其 6 个 ¥7 方案匿名可见，实测有效）；
但**动态（电圈）与主页资料**确为平台要求认证后才能公开/生效，两处平台原文为证。爱发电的**赞助方案**部分匿名可见（可用）；**动态公开可见性**被平台要求实名认证锁住，
只能用户本人操作（身份证/人脸，属 human-auth-gate，不代做）。用户称"以前都上传过不用再认证"——
但平台对**动态**的规则是明确的"未认证不可公开显示"。

## 网络最终状态（重要）

LetsVPN 后来切到**全局模式**：`route -n get default` → `interface: utun6`。
此时 **afdian / itch.io / github / vercel 全部直连 200**，不再需要 `scripts/tunnel-proxy.py`
（该工具在**分流模式**下仍是必需的；两种模式都留着说明）。

## 待用户操作（仅两件）

1. **连上 LetsVPN**（进程在跑但隧道没连）→ 说"继续"，我一趟做完 itch（建页 → 封面/截图 → butler 上传 → 设 Public → 验 200）。
   也可自行运行：`bash scripts/finish-itch-publish.sh`
2. **爱发电登录**（ego 浏览器窗口已停在登录页）→ 登录后我代填创作页与方案。

## 无网络依赖的追加动作（已全部做掉）

- 仓库元数据（描述 / 主页 / 8 主题）+ **GitHub Release v1.0.0**（附可下载 zip）
- `index.html` 加 `description` / `og:*` / `twitter:card`（分享卡片）
- `public/og.png` 1200×630（真实战斗截图生成）→ 已上线
- README 状态修正；`docs/PUBLISH.md`（商店文案）、`docs/PUBLISH-LOG.md`（本文件）、`scripts/finish-itch-publish.sh`


---

## 第六轮：按惯例跑「A 全套」（试玩/完整版分离）

依据用户惯例（`文档资料/STORMFRONT-多站收费.txt` + 后台实测：itch `stormfront`=Buy Now、`neo-drift`=$1、
爱发电售卖商品里已有「DARK ZONE 完整版 ¥7」「HORIZON RUSH 完整版 ¥7」等）。

### ✅ 已完成并有验证

| 项 | 证据 |
|---|---|
| 代码：试玩/完整版分离 | `PLAYABLE_MISSIONS` 改为构建期由 `VITE_DEMO` 决定；`main.ts` 暴露 `__AETHERIA__.__build` |
| 代码：试玩版 UX | 菜单战役面板顶部双语引导；03–10 关标记「试玩版 · Demo」；点击提示去 itch/爱发电 |
| 代码：i18n | 3 条新字符串入词典（`tests/bilingual.mjs` 覆盖强制） |
| 质量 | `tsc` 通过 · `bilingual` **BILINGUAL COMPLIANT** · `smoke` **60/60** |
| 门闸验收 | `tests/release-checks/_verify-build-variants.mjs`：试玩 `{demo:true, playable:[m01,m02]}`、完整 `{demo:false, playable:10}` |
| **GitHub Pages** | 改为 `VITE_DEMO=1` 构建 → 线上实测 `{"demo":true,"playable":["m01","m02"]}` ✅ |
| **Vercel** | `vercel.json` 改 `VITE_DEMO=1 npm run build` → 重新部署 → 线上实测同为试玩版 ✅ |
| **itch 定价** | `Kind → Downloadable`、`payment_mode=paid`、`min_price=$1.00`（对齐 NEO DRIFT）→ 公开页显示 **Buy Now**、**无 Run game** ✅ |
| **itch 完整版包** | `butler push dist-full ...:full-download --userversion 1.0.0-full` → 通道已建（626KB 完整版）✅ |
| 文档 | 新增 `docs/PRICING.md`（收费模式与构建对应关系） |

### ⏳ 两项交接（工具层卡住，非账号问题）

1. **itch 删 html5 通道**：`/game/edit/5048064` 的 Uploads 区里 `.delete_btn` 在折叠的「More…」菜单内，
   点「More…」→「Delete file」→ 原生确认框，**试 3 次未生效**（已按防死循环规则停手）。
   **影响已被消除**：`Kind=Downloadable` 后页面已无 Run game，那个 html5 zip 现在也是"需付费的文件"。
   手动清理：编辑页 → Uploads → 该文件的 More… → Delete file（1 分钟）。

2. **爱发电上架 ¥7 商品**：正确入口是 **设置 → 售卖商品 → 上架新商品**（不是「赞助方案」——
   方案页的新增保存静默失败，且 dashboard 提示「去认证，获得完整功能」+「填写收款方式」未完成）。
   商品表单我已把描述填入、但**用 5 种机制（坐标点击 / DOM 赋值 / 真实键盘 / `page.fill` / ref 快照）
   都没能稳定完成**（该 SPA 顶部为吸顶栏、型号区与主表单混排，坐标测量反复失效）。
   **未产生任何半成品商品**（已核验商品列表：`hasAetheria:false`，原有 5 个完好）。
   
   手动上架（2 分钟，字段已备好）：
   - 入口：`afdian.com/setting/shop` → 「上架新商品」
   - 商品名称：`完整版 · 以太利亚·黎明觉醒`
   - 价格：`7.00`（与 DARK ZONE / HORIZON RUSH 一致）
   - 商品描述：见 `docs/PUBLISH.md`
   - 点击「保存并上架」
   - 自动回复下载：完整版包已备好 `release/itch/aetheria-dawnwake-full.zip`（626KB，index.html 在根）
     —— 需你上传到网盘（夸克等）后把链接填进自动回复，与之前 AI 包的做法一致


---

## 第七轮：Meta / 脸书（用户澄清 "mate" 即 Meta = 脸书）

用户原话「看日志 md 长传到 mate」→ 实际意思是 **检查日志与 md，并发布到 Meta（Facebook）**；
后补充「mate 就是脸书」「ego 今天上传过」。

### 会话状态

| 检查 | 结果 |
|---|---|
| ego 浏览器 Facebook cookie | ✅ `c_user` / `presence` / `wd` 存在（已登录） |
| `facebook.com/me` | ✅ 跳转到 **`facebook.com/yao.shun.33`**（账号 Yao Shun，会话有效） |
| 网络可达性 | ✅ facebook.com 200 · messenger.com 200 · static.xx.fbcdn.net 302 |

### 无法自动发帖的原因（不是登录问题）

脸书桌面版 SPA 在当前网络路径下**无法稳定 hydrate**：

- 页面 HTML 有 3.6MB、`lang="zh-Hans"`，`[role=main]` 一度能读到
  「创建帖子 · Yao Shun，分享你的新鲜事吧！」（说明曾渲染出 feed）
- 但随后回到 **Facebook 加载动画**（蓝色 f + from Meta），`body.innerText` 为 0；
  `[role=main]` 只剩 145 字；**可见 `[role=button]` 数量 = 0** → 界面不可交互
- `mbasic.facebook.com` / `m.facebook.com` 都被 302 回桌面版，同样空白
- 无 CDP 调试端口（9222/9223/9229/8315 均无响应）→ 无法用 Playwright 复用该登录态

结论：**能登录、不能交互**，属网络路径/SPA 加载问题，非账号或工具用法问题。

### 已交接（最省事路径）

文案已写入 `docs/FACEBOOK-POST.md`，并**通过 `peekaboo clipboard set` 放进系统剪贴板**（1010 字节，已读回验证）。
用户只需：打开脸书 → 点「创建帖子」 → `Cmd+V` → 「发布」（约 1 分钟）。

（说明：本 shell 的 `pbcopy/pbpaste` 在非 GUI 上下文读写不到剪贴板，必须用 peekaboo 的剪贴板工具才能真正写入用户会话的剪贴板。）


---

## 第八轮：爱发电 ¥7 商品**上架成功** ✅（补上第六轮的交接项）

**关键突破**：ego 的 `page.fill(..., { clearFirst: true })` 配合 **`loc=css:` 选择器前缀**才有效
（`css=...` 形式会超时；纯 DOM 赋值对 Vue 无效、真实键盘输入也反复被重置）。

**另一处关键**：商品表单的 **型号名称（SKU）是必填**——第六轮只填了商品名称/价格/描述，
点保存静默失败；这次补上 SKU 后保存成功。保存按钮要从**面积最小的精确匹配**里点
（页面上有 8 个含「保存并上架」文字的嵌套容器，点到容器无效）。

| 项 | 值 |
|---|---|
| 商品名称 | `完整版 · 以太利亚·黎明觉醒` |
| 价格 | `¥7.00`（对齐 DARK ZONE / HORIZON RUSH 等既有商品） |
| 型号（SKU） | `标准版 ¥7.00` · 库存无限 |
| 状态 | **上架中** ✅ |
| 公开链接 | https://afdian.com/item/0648e1dcb82911f19d2252540025c377 |
| plan_id | `0648e1dcb82911f19d2252540025c377` |
| **匿名复核** | ✅ 未登录访问该 item 页：显示 **¥7.00**、可「发电」 |
| 备注 | 匿名页把创作者显示为「未认证创作者」、不显示标题 —— 与用户**既有商品同样表现**（对照其主页既有 ¥7 方案同样只显示价格），非本次创建缺陷 |

**待补**：商品的**自动回复下载说明**需要网盘链接（用户惯例用夸克网盘；AI 包即如此）。
完整版包已备好：`release/itch/aetheria-dawnwake-full.zip`（626KB，index.html 在根）。
