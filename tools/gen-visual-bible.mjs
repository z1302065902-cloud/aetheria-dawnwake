/**
 * Generates docs/visual-bible.md FROM src/art/VisualBible.ts.
 *
 * The document is generated rather than hand-written so the spec can never drift away from
 * the values the game actually draws with. Run: `npm run docs:visual`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);

// compile the TS module on the fly with esbuild (already a vite dependency)
const esbuild = require('esbuild');
const built = await esbuild.build({
  entryPoints: [resolve(root, 'src/art/VisualBible.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const { STYLE, FACTION, RANK, REGION, REGION_VFX, ELEMENT, SPECIAL, LIGHT, VFX, PROPORTIONS, UI, TYPE, ICON, CAMERA, ALL_COLORS } = mod;

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const row = (...cells) => `| ${cells.join(' | ')} |`;

let md = `# 《AETHERIA》视觉圣经 Visual Bible V1.0

> **本文档由 \`src/art/VisualBible.ts\` 自动生成**（\`npm run docs:visual\`），请勿手改。
> 游戏里每一个颜色、比例、光照参数、UI token 都来自那个文件；\`tests/visual.mjs\` 会强制执行。
>
> **风格**：${STYLE.name} · 超采样 ${STYLE.supersample}× · 轮廓 ${STYLE.outline.width}px ${hex(STYLE.outline.color)}
> **禁忌**：${STYLE.forbidden.join(' / ')}

## 预算有限时的提升顺序

| 顺序 | 项 | 为什么 | 本作现状 |
|---|---|---|---|
| ① | **光影** | 最容易让“AI Demo”变成“游戏” | AO + 接触阴影 + 边缘光烘焙进精灵；区域环境光/主光由 \`LightingSystem\` 叠加；技能辉光走元素色 |
| ② | **色彩** | 一眼分清敌我/危险 | 阵营色 4 套 + 区域色 4 套 + 元素色 7 套 + 特殊色，全部在下方表中 |
| ③ | **VFX** | RTS 的爽感来源 | 完整链条 ${VFX.chain.join(' → ')}；粒子预算见 §7 |
| ④ | **角色轮廓** | 远镜头辨识度 | 比例表见 §8；英雄 ${RANK.hero.scaleMul}× / Boss ${RANK.boss.scaleMul}× |
| ⑤ | **UI** | AI 游戏最常翻车处 | 全部程序化绘制（\`ui/UiKit.ts\`），零 HTML 控件 |

## 一、整体风格

| 项 | 值 |
|---|---|
| 风格名 | ${STYLE.name} |
| 超采样 | ${STYLE.supersample}× |
| 轮廓 | ${STYLE.outline.width}px / 软轮廓 ${STYLE.outline.softWidth}px @ ${STYLE.outline.softAlpha} |
| 投影方式 | 正交俯视（单位只左右翻转，建筑正面） |
| 禁止 | ${STYLE.forbidden.join('、')} |

## 二、色彩体系 · 阵营色

| 阵营 | 主色 | 深色 | 金属 | 布料 | **信号色** | 定位 |
|---|---|---|---|---|---|---|
`;
for (const [, f] of Object.entries(FACTION)) {
  md += row(f.name, hex(f.primary), hex(f.secondary), hex(f.metal), hex(f.cloth), `**${hex(f.signal)}**`, f.role) + '\n';
}
md += `
**规则**
- 玩家阵营（dawn）的信号色**永远是金 ${hex(FACTION.dawn.signal)}**，敌方永远不带金。
- 荒野氏族暖（橙红 ${hex(FACTION.wildborn.signal)}），虚空族冷（青 ${hex(FACTION.voidborn.signal)}）——**暖冷对立**，扫一眼就能分清。
- 中立野兽低饱和（${hex(FACTION.neutral.primary)}），**永远不抢视线**。
- 信号色同时是边缘光颜色，所以“发光的东西＝有身份的东西”。

## 三、视觉层级

| 档位 | 缩放 | 边缘光强度 | 轮廓 | 光环 |
|---|---|---|---|---|
${Object.entries(RANK)
  .map(([k, r]) => row(k, `${r.scaleMul}×`, r.rim, `${r.outlineMul}×`, r.hasAura ? '有' : '无'))
  .join('\n')}

## 四、区域色

| 区域 | 地面 | 地面变体 | 岩面 | 环境光 | 迷雾 | 地标强调 |
|---|---|---|---|---|---|---|
${Object.entries(REGION)
  .map(([k, r]) => row(`${r.name} (${k})`, hex(r.ground), hex(r.groundAlt), hex(r.stone), `${hex(r.ambient)} @${r.ambientAlpha}`, hex(r.fog), hex(r.accent)))
  .join('\n')}

## 四b、区域 VFX（每个有两层粒子 + 命中残留色）

| 区域 | 飘浮粒子 | alpha | 数量 | 第二层（萤火/余烬） | 命中烟色 | 地面残留 | 碎屑色 |
|---|---|---|---|---|---|---|---|
${Object.entries(REGION_VFX)
  .map(([k, v]) =>
    row(
      k,
      hex(v.mote.color),
      v.mote.alpha,
      `${v.mote.count}${v.spark ? ` + ${v.spark.count}` : ''}`,
      v.spark ? `${hex(v.spark.color)} @${v.spark.alpha}（闪烁 ${v.spark.blink}s）` : '—',
      hex(v.impact.smoke),
      hex(v.impact.residue),
      hex(v.impact.debris),
    ),
  )
  .join('\n')}

**规则**：萤火层只在 dusk / night 出现（白天看不见，所以不生成）；命中烟雾/残留色必须取当前区域，
**不允许森林爆炸和石堡爆炸看起来一样**。

## 五、元素 / 技能色

| 元素 | 核心 | 亮心 | 拖尾 | 地面残留 | 伤害数字 | 叠加发光 |
|---|---|---|---|---|---|---|
${Object.entries(ELEMENT)
  .map(([, e]) => row(e.name, hex(e.core), hex(e.bright), hex(e.trail), hex(e.residue), hex(e.number), e.glow ? 'ADD' : '普通'))
  .join('\n')}

**特殊色**

| 用途 | 色值 |
|---|---|
| 暴击 crit | ${hex(SPECIAL.crit)} |
| 精英 elite | ${hex(SPECIAL.elite)} |
| Boss | ${hex(SPECIAL.boss)} |
| 治疗 heal | ${hex(SPECIAL.heal)} |
| 经验 xp | ${hex(SPECIAL.xp)} |

## 六、光照规则

| 项 | 值 |
|---|---|
| 主光方向 | (${LIGHT.key.dirX}, ${LIGHT.key.dirY}) = **左上打光**，阴影永远落右下 |
| 主光色 / 强度 | ${hex(LIGHT.key.color)} / ${LIGHT.key.strength} |
| 边缘光 | 偏移 (${LIGHT.rim.offsetX}, ${LIGHT.rim.offsetY})，强度按档位见 §3 |
| 接触阴影 AO | ${hex(LIGHT.ao.color)} @ 单位 ${LIGHT.ao.alpha.unit} / 建筑 ${LIGHT.ao.alpha.building} / 装饰 ${LIGHT.ao.alpha.decor}，压扁 ${LIGHT.ao.squash} |
| 环境补光 | ${hex(LIGHT.ambient.floor)} @ ${LIGHT.ambient.intensity}（保证没有纯黑） |
| 技能辉光 | ADD 混合，alpha ${LIGHT.skillGlow.alpha}，${LIGHT.skillGlow.scale}× |

**昼夜参数（关卡可选用）**

| 时段 | 环境光 | alpha | 主光强度 |
|---|---|---|---|
${Object.entries(LIGHT.timeOfDay)
  .map(([k, t]) => row(k, hex(t.ambient), t.alpha, t.keyStrength))
  .join('\n')}

**实现位置**：AO / 边缘光 / 主光烘焙在生成精灵时（\`UnitRenderer\`、\`SpriteFactory\`）；
区域环境光是运行时的 \`src/systems/LightingSystem.ts\`（MULTIPLY 叠加在地面之上、单位之下）。

## 七、VFX 规则

| 项 | 值 |
|---|---|
| 打击链条（顺序不可乱） | ${VFX.chain.join(' → ')} |
| 火花数量（近战/远程/魔法/暴击/爆炸/Boss 死亡） | ${VFX.sparkCount.melee} / ${VFX.sparkCount.ranged} / ${VFX.sparkCount.magic} / ${VFX.sparkCount.crit} / ${VFX.sparkCount.explosion} / ${VFX.sparkCount.bossDeath} |
| 寿命（火花/烟/辉光/拖尾/残留） | ${VFX.life.spark}s / ${VFX.life.smoke}s / ${VFX.life.glow}s / ${VFX.life.trail}s / ${VFX.life.residue}s |
| 伤害数字 | 普通 ${VFX.number.normal.size}px ${hex(VFX.number.normal.color)} · 魔法 ${VFX.number.magic.size}px · **暴击 ${VFX.number.crit.size}px ${hex(VFX.number.crit.color)}** |
| 震屏预算 | light ${VFX.shake.light}（冷却 ${VFX.shake.lightCooldown}s）· heavy ${VFX.shake.heavy} · ultimate ${VFX.shake.ultimate} |
| 池上限 | 特效 ${VFX.pool.effects} · 浮字 ${VFX.pool.floatingText} |

**规则**：任何技能必须走完整链条才允许上线；单次命中粒子数不得超过上表；震屏必须分级，禁止无上限抖动。

## 八、轮廓与比例

| 类别 | 参数 |
|---|---|
| 人形 | 身高 ${PROPORTIONS.humanoid.totalHeight}px · 头占 ${PROPORTIONS.humanoid.head} · 肩宽 ${PROPORTIONS.humanoid.shoulderWidth} · 腿长 ${PROPORTIONS.humanoid.legLength} |
| 四足 | 身高 ${PROPORTIONS.beast.totalHeight}px · 体长 ${PROPORTIONS.beast.bodyLength} · 腿 ${PROPORTIONS.beast.legLength} |
| 攻城器械 | 高 ${PROPORTIONS.siege.totalHeight}px · 轮半径比 ${PROPORTIONS.siege.wheelRadius} |
| 建筑 | 占地/高度比 ${PROPORTIONS.building.footprintToHeight} · 屋檐外挑 ${PROPORTIONS.building.roofOverhang}× |
| 英雄可辨识缩放 | ≥ ${PROPORTIONS.heroReadableZoom}× |

## 九、UI 规范

| 项 | 值 |
|---|---|
| 面板底色 | ${hex(UI.panel)}（深 ${hex(UI.panelDeep)}，亮 ${hex(UI.panelLight)}）@ alpha ${UI.panelAlpha} |
| 边框 | ${hex(UI.border)} · ${UI.borderWidth}px · 圆角 ${UI.radius}px |
| 文字三级 | 主要 ${hex(UI.text.primary)} · 次要 ${hex(UI.text.dim)} · 金 ${hex(UI.text.gold)} |
| 语义色 | 成功 ${hex(UI.state.ok)} · 警告 ${hex(UI.state.warn)} · 危险 ${hex(UI.state.danger)} · 信息 ${hex(UI.state.info)} |
| 按钮四态 | 常态 ${hex(UI.button.normal)} · 悬停 ${hex(UI.button.hover)} · 按下 ${hex(UI.button.pressed)} · 禁用 ${hex(UI.button.disabled)} |
| 血条/蓝条 | 血 ${hex(UI.bar.hp)} · 低血 ${hex(UI.bar.hpLow)} · 友军 ${hex(UI.bar.hpAlly)} · 敌军 ${hex(UI.bar.hpEnemy)} · 蓝 ${hex(UI.bar.mana)} · 经验 ${hex(UI.bar.xp)} |
| 间距梯度 | ${UI.space.xs} / ${UI.space.sm} / ${UI.space.md} / ${UI.space.lg} / ${UI.space.xl} px |
| 焦点环 | ${hex(UI.focusRing.color)} · ${UI.focusRing.width}px |

**硬规则**：不允许出现任何 HTML \`<button>\` / 原生控件；所有 UI 由 \`ui/UiKit.ts\` 程序化绘制，四态齐备。

## 十、字体

| 项 | 值 |
|---|---|
| 字体栈 | ${TYPE.family} |
| 数字 | ${TYPE.numeric} |
| 字号（仅四级） | 说明 ${TYPE.size.caption} · 正文 ${TYPE.size.body} · 标题 ${TYPE.size.title} · 大标题 ${TYPE.size.hero} |
| 字重 | 常规 ${TYPE.weight.normal} · 粗 ${TYPE.weight.bold} |
| 描边 | ${TYPE.outline.width}px ${hex(TYPE.outline.color)}（HUD 文字必须描边） |

## 十一、图标

| 项 | 值 |
|---|---|
| 网格 | ${ICON.grid}×${ICON.grid}，程序化绘制，不用位图 |
| 线宽 | ${ICON.stroke}px |
| 技能图标 | 元素色底板 @ ${ICON.skill.plateAlpha} + 白色字形 @ ${ICON.skill.glyphAlpha} |
| 冷却遮罩 | ${hex(ICON.skill.cooldownMask)} @ ${ICON.skill.cooldownAlpha} 径向 |
| 技能格 | ${ICON.tile}px 固定 |
| 资源图标最小尺寸 | ${ICON.minSize}px 仍需可读 |

## 十二、镜头语言

| 场景 | 参数 | 实现位置 |
|---|---|---|
| 主菜单 | 缩放 ${CAMERA.menu.zoom}，缓慢横移 ${CAMERA.menu.drift}（视差幅度 ±18px），**无震动** | \`MenuScene.update\` |
| 战斗 | 默认 ${CAMERA.battle.zoomDefault}×，范围 ${CAMERA.battle.zoomMin}–${CAMERA.battle.zoomMax}×，跟随阻尼 ${CAMERA.battle.follow} | \`BattleScene.setupInput\` |
| 胜利 | 推近到 ${CAMERA.victory.zoom}×，${CAMERA.victory.panMs}ms 推镜后停 ${CAMERA.victory.holdMs}ms | \`BattleScene.victoryCamera\` |
| 失败 | 拉远到 0.9×（让损失读得出来），1200ms | \`missions.onResolved\` |
| Boss 战 | 现身推近到 ${CAMERA.boss.zoom}×（${CAMERA.boss.panMs}ms 推 + ${CAMERA.boss.holdMs}ms 停），震屏上限 ${CAMERA.boss.shakeCap}，击杀慢动作 ${CAMERA.boss.slowMotion}× | \`BattleScene.bossIntroCamera\` |

### 逐关昼夜分配

| 关 | 时段 | 理由 |
|---|---|---|
| m01 | day | 教学关：光照中性，不靠氛围藏东西 |
| m02 | dawn | 清晨护送 |
| m03 | day | |
| m04 | dusk | 暗影森林里找失踪骑士 |
| m05 | day | |
| m06 | dusk | 占领森林 |
| m07 | day | |
| m08 | night | 虚空族夜里现身 |
| m09 | night | |
| m10 | night | 虚空潮汐 |

## 附：全部允许色（${ALL_COLORS.length} 个）

\`\`\`
${ALL_COLORS.map(hex).join('  ')}
\`\`\`
`;

mkdirSync(resolve(root, 'docs'), { recursive: true });
writeFileSync(resolve(root, 'docs/visual-bible.md'), md);
console.log(`docs/visual-bible.md written · ${ALL_COLORS.length} colours · ${md.split('\n').length} lines`);
