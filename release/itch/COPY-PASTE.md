# itch.io 建页抄写单（不连 VPN 也能手动完成）

> 页面：https://itch.io/game/new （用 zsy2026 登录）
> 素材在 `release/itch/`：`cover.jpg`（630×500）、`shots/1..6*.png`（1600×900）
> 按顺序把下面内容填进去即可，全部是最终文案，不用改写。

## 1. Title（标题）
```
Aetheria: Dawnwake · 以太利亚 · 黎明觉醒
```

## 2. Project URL（URL 后缀，必须完全一致，butler 上传要用）
```
aetheria-dawnwake
```
→ 最终地址会是 `https://zsy2026.itch.io/aetheria-dawnwake`

## 3. Short description / tagline（一句话简介）
```
单人幻想即时战略 · 英雄成长 · Roguelite 遗物 — 十关三幕，中英双语，浏览器打开即玩。
```

## 4. Classification（分类）
选 **Games**

## 5. Kind of project（类型）— ⚠️ 关键
把默认的 `Downloadable` 改成 **`HTML`**（"You have a ZIP or HTML file that will be played in the browser"）

## 6. Release status
保持 **Released**

## 7. Pricing
选 **`$0 or donate`**（免费可玩，允许赞助）

## 8. Upload Cover Image（封面）— ⚠️ 必填
上传 `release/itch/cover.jpg`（630×500 · JPEG；PNG 那次被服务端拒过，用这张 jpg）

## 9. Screenshots（截图 — 建议 6 张，按顺序）
```
release/itch/shots/1-menu.png      主菜单
release/itch/shots/2-deploy.png    出征准备（选英雄/情报/目标）
release/itch/shots/3-battle.png    战斗（HUD 双语、目标栏、编队与开关）
release/itch/shots/4-heroes.png    英雄 / 装备 / 天赋 / 遗物
release/itch/shots/5-campaign.png  战役十关（三幕）
release/itch/shots/6-result.png    结算（战果/掉落/存档）
```

## 10. Description（正文 — 直接整段粘贴）

```
以太利亚 · 黎明觉醒 —— 单人幻想即时战略（RTS）网页游戏，浏览器打开即玩，无需下载安装。

那个黄昏，苍穹裂开了。你带着残存的骑士团退回绿谷——而荒野深处的氏族正在集结。

【核心循环】采集 → 建造兵营 → 训练部队 → 带迷雾探索 → 与荒野氏族交战 → 英雄升级 → 摧毁敌方营地 → 击败 Boss → 掉落装备 → 进入下一关。一局 15–30 分钟，十关三幕（绿谷的余火 / 森林的盟约 / 虚空潮汐）。

【特点】
· 英雄 + RTS：英雄负责冒险（Q/W/E/R 技能、升级、装备、天赋），军队负责战争，基地负责成长
· 不为微操服务：工人自动分配（金/木/晶配比可调）、自动排产、编组带姿态（自动进攻 / 跟随英雄 / 驻守）
· 三幕十关：绿谷（白天草原）/ 暗影森林（黄昏薄雾）/ 黑暗堡垒（灰烬之夜），各带独立光照、天气与裂隙事件
· Roguelite：每局随机祝福 + 6 件遗物（通关可选目标解锁）
· 冒险层：宝箱、中立野兽、流浪商人、流浪学者、遗物密室、虚空裂隙、陨石
· Boss 战：棘齿巨兽三阶段（咆哮召唤狼群 / 践踏冲击波 / 狂暴冲刺）、虚空巫妖、远古巨龙
· 中英双语：全部界面文字中文 + English
· 零第三方素材：全部美术与音效由代码程序化生成（16 张单位精灵表 × 11–15 帧动画、区域光照与天气、程序化音乐音效）

【操作】左键拖拽框选 · 右键移动/攻击 · A 攻击移动 · S 停止 · H 驻守 · QWER 技能 · 1-5 编队 · 滚轮缩放 · Esc 暂停

【性能】Apple M4 Max / 1600×900 / DPR2：10/20/40/60 单位分别 810/806/818/817 FPS，模拟开销 0.036→0.083 ms/tick。

【免费在线玩】
· GitHub Pages：https://z1302065902-cloud.github.io/aetheria-dawnwake/
· Vercel：https://aetheria-dawnwake.vercel.app
· 源码：https://github.com/z1302065902-cloud/aetheria-dawnwake

**Aetheria: Dawnwake** is a single-player fantasy real-time strategy game that runs in your browser — no download, no install. Three acts and ten missions, three heroes, roguelite relics, three boss fights, fully bilingual (Chinese + English), and every asset generated procedurally in code.

【已知限制（诚实声明）】3 个可玩英雄（计划 7 个）· 无皮肤系统 · 手机竖屏只保证 HUD 不溢出（菜单面向桌面）· 无多人对战。
```

## 11. Tags（标签，逐个加）
```
real-time strategy, strategy, singleplayer, fantasy, roguelite, tower defense, html5, procedural
```

## 12. Visibility（可见性）— ⚠️ 两个都设上
- 表单底部：Visibility 选 **Public**
- Save 之后：Edit project 页里确认 **Visibility = Public**（新项目默认可能是 Draft）

## 13. 保存
点底部 **Save & view page**（蓝色按钮）。

## 14. 保存后：上传游戏本体（需要连 VPN 才能跑 butler）
```bash
bash scripts/finish-itch-publish.sh
```
该脚本会：重新打包 `dist/` → `butler push release/itch 目录 zsy2026/aetheria-dawnwake:html5` → 验证 `https://zsy2026.itch.io/aetheria-dawnwake` 返回 200。

> 如果 butler 报 `invalid game (400)`：说明项目页还没保存成功。
> 如果报 `invalid key (403)`：去 https://itch.io/user/settings/api-keys 重生成 key（需 sudo mode 密码），
> 覆盖 `~/Library/Application Support/itch/butler_creds`。
