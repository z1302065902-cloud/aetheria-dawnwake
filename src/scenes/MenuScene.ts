import Phaser from 'phaser';
import { CAMERA } from '../art/VisualBible';
import { PAL, toCss } from '../art/Palette';
import { Button, drawPanel, text } from '../ui/UiKit';
import { audio } from '../audio/AudioBus';
import { save } from '../core/SaveManager';
import { IS_DEMO_BUILD, MISSIONS, PLAYABLE_MISSIONS } from '../data/missions';
import { HEROES, HERO_ORDER } from '../data/heroes';
import { ITEMS, RELICS } from '../data/items';
import { TALENTS, TALENT_BRANCH_LABEL } from '../data/talents';
import { equipFromInventory, heroSheet, unequipSlot } from '../systems/Equipment';
import { metaOf } from '../art/SpriteFactory';
import { bi, biAuto, biLines, biName } from '../data/i18n';

type Screen = 'main' | 'campaign' | 'deploy' | 'heroes' | 'settings';

/** lookup tables for the deployment screen (names shown next to the player's gear) */
const ITEM_NAMES: Record<string, string> = Object.fromEntries(ITEMS.map((i) => [i.id, i.name]));
const RELIC_NAMES: Record<string, string> = Object.fromEntries(RELICS.map((r) => [r.id, r.name]));
const HERO_BOSS_NAMES: Record<string, string> = {
  thornmaw: '棘齿巨兽（森林巨兽 · 毒绿）',
  voidsorcerer: '虚空巫师（紫 · 电蓝）',
  ancientdragon: '远古巨龙（深绯红 · 黑 · 金）',
};
void RELIC_NAMES;

/** Campaign acts (product plan phase 2/3): each act is a self-contained story beat. */
export const ACTS: Array<{ id: string; name: string; sub: string; missions: string[] }> = [
  { id: 'act1', name: '第一幕 · 绿谷的余火', sub: '重建前哨，学会带兵', missions: ['m01', 'm02', 'm03'] },
  { id: 'act2', name: '第二幕 · 森林的盟约', sub: '深入暗影森林，营救与被囚者', missions: ['m04', 'm05', 'm06', 'm07'] },
  { id: 'act3', name: '第三幕 · 虚空潮汐', sub: '黑暗堡垒与远古巨龙', missions: ['m08', 'm09', 'm10'] },
];

/**
 * Front end: title, campaign select, hero codex / armory / relics and settings.
 * Everything is original art generated at runtime (see SpriteFactory).
 */
export class MenuScene extends Phaser.Scene {
  private screen: Screen = 'main';
  private s = 1;
  private W = 1600;
  private H = 900;
  private g!: Phaser.GameObjects.Graphics;
  private bg!: Phaser.GameObjects.Graphics;
  private root!: Phaser.GameObjects.Container;
  private selectedHero = 'knightCommander';

  constructor() {
    super('Menu');
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    // Visual Bible §12: the menu camera drifts slowly and never shakes. The parallax offset is
    // applied to the decorative layers instead of a real camera so the UI stays pixel-aligned.
    this.drift = this.cameras.main.zoom * 0;
    this.g = this.add.graphics().setDepth(1);
    this.bg = this.add.graphics().setDepth(0);
    this.root = this.add.container(0, 0).setDepth(10);

    this.driftT = 0;
    audio.playMusic('menu');
    this.scale.on('resize', this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize);
    });
    this.render();
  }

  private drift = 0;
  private driftT = 0;

  /** Menu camera language: a very slow horizontal drift across the painted backdrop. */
  update(_time: number, delta: number): void {
    this.driftT += delta / 1000;
    this.drift = Math.sin(this.driftT * CAMERA.menu.drift) * 18;
    this.bg?.setX(this.drift * 0.5);
    this.g?.setX(this.drift);
  }

  private onResize = (): void => {
    if (!this.scene.isActive()) return;
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.render();
  };

  private clearRoot(): void {
    for (const child of [...this.root.list]) child.destroy();
    this.root.removeAll();
  }

  private render(): void {
    this.s = Phaser.Math.Clamp(Math.min(this.W / 1600, this.H / 900), 0.42, 1.6);
    const s = this.s;
    this.clearRoot();
    this.g.clear();
    this.drawBackground();

    if (this.screen === 'main') this.renderMain();
    else if (this.screen === 'campaign') this.renderCampaign();
    else if (this.screen === 'deploy') this.renderDeploy();
    else if (this.screen === 'heroes') this.renderHeroes();
    else this.renderSettings();
    void s;
  }

  private drawBackground(): void {
    const b = this.bg;
    b.clear();
    b.fillStyle(0x070a13, 1);
    b.fillRect(0, 0, this.W, this.H);
    // sky gradient bands
    const bands = 30;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(0x14, 0x1f, 0x40),
        new Phaser.Display.Color(0x04, 0x06, 0x0b),
        100,
        Math.round(t * 100),
      );
      b.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      b.fillRect(0, t * this.H, this.W, this.H / bands + 1);
    }
    // sun emblem
    const cx = this.W * 0.5;
    const cy = this.H * 0.3;
    const r = Math.min(this.W, this.H) * 0.16;
    b.fillStyle(0xd98b2b, 0.09);
    b.fillCircle(cx, cy, r * 1.5);
    b.fillStyle(0xffd257, 0.13);
    b.fillCircle(cx, cy, r);
    b.lineStyle(2, 0xffd257, 0.22);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.lineBetween(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15, cx + Math.cos(a) * r * 1.55, cy + Math.sin(a) * r * 1.55);
    }
  }

  /** Main-menu buttons must fit a bilingual caption ("开始战役 · 翡翠谷地 · Start Campaign · Emerald Valley"). */
  private menuButtonW(): number {
    return Math.min(560 * this.s, this.W * 0.66);
  }

  private addButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void, enabled = true, fill?: number): Button {
    const b = new Button(this, x, y, w, h, label, () => {
      audio.init();
      audio.sfx('click', 0.4);
      onClick();
    }, { fontSize: 14 * this.s, fill });
    b.setEnabled(enabled);
    this.root.add([b.rect, b.label]);
    return b;
  }

  private addText(x: number, y: number, content: string, size: number, color: string, origin: [number, number] = [0.5, 0.5], bold = false): Phaser.GameObjects.Text {
    const t = text(this, x, y, content, size * this.s, color, { origin, bold });
    this.root.add(t);
    return t;
  }

  // ────────────────────────── screens ──────────────────────────

  private renderMain(): void {
    const s = this.s;
    this.addText(this.W / 2, this.H * 0.2, 'AETHERIA', 74, toCss(PAL.uiGold), [0.5, 0.5], true);
    this.addText(this.W / 2, this.H * 0.2 + 54 * s, 'D A W N W A K E   ·   黎 明 觉 醒', 20, toCss(PAL.uiDim));
    this.addText(this.W / 2, this.H * 0.2 + 88 * s, '单人幻想即时战略 · 英雄成长 · Roguelite 遗物', 14, toCss(PAL.uiDim));

    const bx = this.W / 2;
    let y = this.H * 0.42;
    const gap = 52 * s;
    this.addButton(bx, y, this.menuButtonW(), 42 * s, '开始战役 · 翡翠谷地', () => this.startMission('m01'));
    y += gap;
    this.addButton(bx, y, this.menuButtonW(), 42 * s, '关卡选择', () => {
      this.screen = 'campaign';
      this.render();
    });
    y += gap;
    this.addButton(bx, y, this.menuButtonW(), 42 * s, '英雄 / 装备 / 遗物', () => {
      this.screen = 'heroes';
      this.render();
    });
    y += gap;
    this.addButton(bx, y, this.menuButtonW(), 42 * s, '设置与音频', () => {
      this.screen = 'settings';
      this.render();
    });
    y += gap;
    this.addButton(bx, y, this.menuButtonW(), 42 * s, '继续上次进度', () => {
      const unlocked = save.current.campaign.unlockedMissions;
      const last = unlocked[unlocked.length - 1] ?? 'm01';
      this.startMission(PLAYABLE_MISSIONS.has(last) ? last : 'm01');
    });

    // Footer: each line is a bilingual BLOCK (Chinese line + English line), so the two blocks need
    // their own vertical slots — at the old 20px spacing the English half of the first block was
    // drawn straight through the second block.
    const stats = save.current.stats;
    const footerY = this.H - 92 * s;
    for (const [i, line] of [
      `本地存档：通关 ${stats.victories}/${stats.matches} 场 · 英雄等级 ${save.current.hero.level} · 遗物 ${save.current.hero.relics.length}`,
      '本作全部美术与音效均由代码程序化生成，不含任何第三方素材。',
    ].entries()) {
      this.addText(this.W / 2, footerY + i * 44 * s, biLines(line), i === 0 ? 13 : 12, toCss(PAL.uiDim));
    }
  }

  private renderCampaign(): void {
    const s = this.s;
    const panelW = Math.min(this.W * 0.9, 1040 * s);
    const panelX = (this.W - panelW) / 2;
    const panelY = this.H * 0.045;
    const panelH = this.H * 0.88;
    drawPanel(this.g, panelX, panelY, panelW, panelH, { header: true, alpha: 0.9 });
    const cleared = Object.keys(save.current.campaign.completed).length;
    this.addText(this.W / 2, panelY + 14 * s, `战役 · 三幕十关　已通关 ${cleared}/10`, 16, toCss(PAL.uiGold), [0.5, 0.5], true);
    // 试玩版标识：玩家必须看得出这份构建只有两关，以及完整版去哪买
    if (IS_DEMO_BUILD) {
      this.addText(
        this.W / 2,
        panelY + 32 * s,
        bi('试玩版 · 前两关免费　完整版十关在 itch.io / 爱发电'),
        11,
        toCss(PAL.uiDim),
        [0.5, 0.5],
      );
    }

    const unlocked = save.current.campaign.unlockedMissions;
    // Rows are taller now: each briefing is bilingual and wraps to two or three lines, and the
    // row label is bilingual as well.
    const rowH = 48 * s;
    let y = panelY + (IS_DEMO_BUILD ? 52 : 40) * s;
    for (const act of ACTS) {
      // act header with its own progress, so the campaign reads as a story rather than a list
      const actDone = act.missions.filter((id) => save.current.campaign.completed[id]).length;
      void actDone;
      const actOpen = act.missions.some((id) => unlocked.includes(id) && PLAYABLE_MISSIONS.has(id));
      this.root.add(this.add.rectangle(panelX + 16 * s, y, panelW - 32 * s, 26 * s, PAL.uiPanelLight, 0.5).setOrigin(0, 0.5));
      this.addText(panelX + 26 * s, y, `${bi(act.name)}  ·  ${bi(act.sub)}`, 13, actOpen ? toCss(PAL.uiGold) : toCss(PAL.uiDim), [0, 0.5], actOpen);
      this.addText(panelX + panelW - 26 * s, y, `${actDone}/${act.missions.length}`, 13, toCss(PAL.uiDim), [1, 0.5]);
      y += rowH;
      for (const mid of act.missions) {
        const m = MISSIONS.find((x) => x.id === mid);
        if (!m) continue;
        const playable = PLAYABLE_MISSIONS.has(m.id);
        const isUnlocked = unlocked.includes(m.id) && playable;
        const demoLocked = IS_DEMO_BUILD && !playable; // 试玩版里被裁掉的关卡，而不是“没打过的关”
        const done = save.current.campaign.completed[m.id];
        const stars = done
          ? '★'.repeat(done.stars) + '☆'.repeat(3 - done.stars)
          : isUnlocked
            ? '可挑战'
            : demoLocked
              ? '试玩版'
              : '未解锁';
        // The row label carries the number, the name in both languages and the state. The biome and
        // time of day were dropped from it: they duplicated the name ("格林谷地 · 绿谷日"), and the
        // deployment screen shows them properly.
        const label = `${String(m.index).padStart(2, '0')}  ${biName(m.name, m.enName)}  [${bi(stars)}]`;
        this.addButton(panelX + panelW * 0.16, y, panelW * 0.42, rowH - 8 * s, label, () => {
          if (!isUnlocked) {
            this.addToast(
              demoLocked ? bi('试玩版不含此关 —— 完整版十关在 itch.io / 爱发电') : '先通关上一关',
            );
            return;
          }
          this.pendingMission = m.id;
          this.selectedHero = m.hero; // default to the mission's own hero, player may change it
          this.screen = 'deploy';
          this.render();
        }, isUnlocked);
        const t = this.addText(panelX + panelW * 0.60, y, biLines(m.brief), 10, toCss(PAL.uiDim), [0, 0.5]);
        t.setWordWrapWidth(panelW * 0.37, true);
        y += rowH;
      }
      y += 6 * s;
    }

    this.addButton(this.W / 2, panelY + panelH + 30 * s, 240 * s, 38 * s, '返回', () => {
      this.screen = 'main';
      this.render();
    });
  }

  private renderHeroes(): void {
    const s = this.s;
    const panelW = Math.min(this.W * 0.94, 1240 * s);
    const panelX = (this.W - panelW) / 2;
    const panelY = this.H * 0.07;
    const panelH = this.H * 0.86;
    drawPanel(this.g, panelX, panelY, panelW, panelH, { header: true, alpha: 0.92 });
    this.addText(this.W / 2, panelY + 14 * s, '英雄 · 装备 · 天赋 · 遗物', 18, toCss(PAL.uiGold), [0.5, 0.5], true);

    // ── hero cards ───────────────────────────────────────────────
    HERO_ORDER.forEach((id, i) => {
      const def = HEROES[id];
      const colW = panelW / 3;
      const x = panelX + colW * i + colW / 2;
      const y = panelY + 46 * s;
      const selected = this.selectedHero === id;
      if (selected) {
        this.g.lineStyle(2, 0xffd257, 0.9);
        this.g.strokeRoundedRect(x - colW / 2 + 8 * s, y - 8 * s, colW - 16 * s, 180 * s, 8);
      }
      const img = this.add.image(x, y + 30 * s, `u_${id}`).setScale(1.5 * s * metaOf(`u_${id}`).sx);
      this.root.add(img);
      // the bilingual name is wider than the card, so it is wrapped to the card width
      const nameT = this.addText(x, y + 62 * s, biLines(`${def.name} · ${def.title}`), 13, toCss(PAL.uiGold), [0.5, 0], true);
      nameT.setWordWrapWidth(colW - 34 * s, true);
      const statT = this.addText(
        x,
        y + 62 * s + nameT.height + 3 * s,
        biLines(
          `${def.role === 'tank' ? '近战坦克' : def.role === 'mage' ? '远程法术 AOE' : '远程输出'}　HP ${def.base.hp} / 攻 ${def.base.attack} / 甲 ${def.base.armor}`,
        ),
        9,
        toCss(PAL.uiDim),
        [0.5, 0],
      );
      statT.setWordWrapWidth(colW - 34 * s, true);
      def.skills.forEach((sid, k) => {
        const icon = this.add.image(x - 66 * s + k * 44 * s, y + 126 * s, `icon_${sid}`).setDisplaySize(30 * s, 30 * s);
        this.root.add(icon);
      });
      const btn = new Button(this, x, y + 154 * s, colW - 90 * s, 30 * s, selected ? '已选择' : '选择此英雄', () => {
        this.selectedHero = id;
        save.current.hero.id = id;
        save.save();
        this.render();
      });
      this.root.add([btn.rect, btn.label]);
    });

    // ── divider ──────────────────────────────────────────────────
    const dividerY = panelY + 236 * s;
    this.g.lineStyle(1, PAL.uiBorder, 0.7);
    this.g.lineBetween(panelX + 20 * s, dividerY, panelX + panelW - 20 * s, dividerY);

    const sheet = heroSheet(save.current);
    const colW = (panelW - 60 * s) / 3;
    const colX = [panelX + 20 * s, panelX + 30 * s + colW, panelX + 40 * s + colW * 2];
    const top = dividerY + 18 * s;

    // ── column 1: equipment slots ────────────────────────────────
    this.addText(colX[0], top, '装备（点击卸下）', 15, toCss(PAL.uiGold), [0, 0.5], true);
    sheet.slots.forEach((slot, i) => {
      const y = top + 30 * s + i * 34 * s;
      const text = slot.item
        ? `${slot.label}：${slot.item.name}　${this.itemStatsText(slot.item)}`
        : `${slot.label}：— 空 —`;
      this.addText(colX[0], y, text, 12, slot.item ? this.rarityColor(slot.item.rarity) : toCss(PAL.uiDim), [0, 0.5]);
      if (slot.item) {
        const b = new Button(this, colX[0] + colW - 34 * s, y, 62 * s, 26 * s, '卸下', () => {
          unequipSlot(save.current, slot.slot);
          save.save();
          this.render();
        });
        this.root.add([b.rect, b.label]);
      }
    });
    const totals = sheet.totals;
    this.addText(
      colX[0],
      top + 30 * s + 4 * 34 * s + 14 * s,
      `合计：攻 +${totals.attack}　甲 +${totals.armor}　生命 +${totals.hp}　法力 +${totals.mana}\n暴击 +${totals.crit}%　攻速 +${totals.attackSpeed}%　技能 +${totals.skillDamage}%`,
      12,
      toCss(PAL.uiText),
      [0, 0],
    );

    // ── column 2: inventory ──────────────────────────────────────
    this.addText(colX[1], top, `背包（${sheet.inventory.length} 件）`, 15, toCss(PAL.uiGold), [0, 0.5], true);
    let invY = top + 32 * s;
    if (sheet.inventory.length === 0) {
      const note = this.addText(colX[1], invY, biLines('还没有战利品。通关会掉落装备（星级与 Boss 影响数量与品质）。'), 11, toCss(PAL.uiDim), [0, 0]);
      note.setWordWrapWidth(colW - 24 * s, true);
      invY += note.height + 10 * s;
    }
    sheet.inventory.slice(0, 9).forEach((item, i) => {
      const y = invY + i * 34 * s;
      const equipped = (save.current.hero.equipment ?? {})[item.slot] === item.id;
      const n = this.addText(colX[1], y, biLines(item.name), 11, this.rarityColor(item.rarity), [0, 0]);
      n.setWordWrapWidth(colW - 90 * s, true);
      const st = this.addText(colX[1], y + n.height + 1 * s, biLines(this.itemStatsText(item)), 9, toCss(PAL.uiDim), [0, 0]);
      st.setWordWrapWidth(colW - 90 * s, true);
      const b = new Button(this, colX[1] + colW - 34 * s, y + 12 * s, 62 * s, 26 * s, equipped ? '已装备' : '装备', () => {
        equipFromInventory(save.current, item.id);
        save.save();
        this.render();
      });
      b.setEnabled(!equipped);
      this.root.add([b.rect, b.label]);
    });

    // ── column 3: talents + relics ───────────────────────────────
    this.addText(colX[2], top, `天赋（剩余 ${save.current.hero.talentPoints} 点）`, 15, toCss(PAL.uiGold), [0, 0.5], true);
    // Talents are a stacked pair of lines per row: the name line and its effect line are both
    // bilingual, so putting them side by side (as before) made them run through each other.
    let talentY = top + 30 * s;
    TALENTS.forEach((t) => {
      const y = talentY;
      const rank = save.current.hero.talents?.[t.id] ?? 0;
      const maxed = rank >= t.maxRank;
      const nameT = this.addText(
        colX[2],
        y,
        biLines(`${TALENT_BRANCH_LABEL[t.branch]}·${t.name} ${rank}/${t.maxRank}`),
        11,
        rank > 0 ? toCss(0x9fffb0) : toCss(PAL.uiText),
        [0, 0],
      );
      nameT.setWordWrapWidth(colW - 40 * s, true);
      const descT = this.addText(colX[2], y + nameT.height + 1 * s, biLines(t.desc), 9, toCss(PAL.uiDim), [0, 0]);
      descT.setWordWrapWidth(colW - 40 * s, true);
      talentY += nameT.height + descT.height + 10 * s;
      const b = new Button(this, colX[2] + colW - 24 * s, y + 8 * s, 32 * s, 22 * s, '+', () => {
        save.spendTalentPoint(t.id, t.maxRank);
        this.render();
      });
      b.setEnabled(!maxed && save.current.hero.talentPoints > 0);
      this.root.add([b.rect, b.label]);
    });
    const relicTop = talentY + 12 * s;
    this.addText(colX[2], relicTop, `遗物（${save.current.hero.relics.length}/${RELICS.length}）`, 15, toCss(PAL.uiGold), [0, 0.5], true);
    let relicY = relicTop + 24 * s;
    RELICS.forEach((r) => {
      const owned = save.current.hero.relics.includes(r.id);
      const t = this.addText(colX[2], relicY, biLines(`${owned ? '✔' : '○'} ${r.name} — ${r.desc}`), 10, toCss(owned ? 0x9fffb0 : PAL.uiDim), [0, 0]);
      t.setWordWrapWidth(colW - 40 * s, true);
      relicY += t.height + 6 * s;
    });

    this.addButton(this.W / 2, panelY + panelH + 26 * s, 240 * s, 38 * s, '返回', () => {
      this.screen = 'main';
      this.render();
    });
  }

  private rarityColor(rarity: 'common' | 'rare' | 'epic' | 'legendary'): string {
    return rarity === 'legendary' ? toCss(0xffb347) : rarity === 'epic' ? toCss(0xc084fc) : rarity === 'rare' ? toCss(0x7fd8ff) : toCss(PAL.uiText);
  }

  private itemStatsText(item: { stats: Record<string, number | undefined> }): string {
    const label: Record<string, string> = {
      attack: '攻',
      armor: '甲',
      hp: '生命',
      mana: '法力',
      crit: '暴',
      attackSpeed: '攻速',
      skillDamage: '技能',
    };
    const pct = new Set(['crit', 'attackSpeed', 'skillDamage']);
    return Object.entries(item.stats)
      .filter(([, v]) => !!v)
      .map(([k, v]) => `${label[k] ?? k}+${v}${pct.has(k) ? '%' : ''}`)
      .join(' ');
  }


  private renderSettings(): void {
    const s = this.s;
    const panelW = Math.min(this.W * 0.7, 700 * s);
    const panelX = (this.W - panelW) / 2;
    const panelY = this.H * 0.16;
    const panelH = this.H * 0.6;
    drawPanel(this.g, panelX, panelY, panelW, panelH, { header: true, alpha: 0.9 });
    this.addText(this.W / 2, panelY + 14 * s, '设置', 18, toCss(PAL.uiGold), [0.5, 0.5], true);

    const st = save.current.settings;
    let y = panelY + 60 * s;
    const refresh = () => {
      audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);
      save.save();
      this.render();
    };
    this.addText(panelX + 30 * s, y, `音乐音量：${Math.round(st.music * 100)}%`, 15, toCss(PAL.uiText), [0, 0.5]);
    this.addButton(panelX + panelW - 130 * s, y, 40 * s, 30 * s, '-', () => {
      save.current.settings.music = Math.max(0, save.current.settings.music - 0.1);
      refresh();
    });
    this.addButton(panelX + panelW - 80 * s, y, 40 * s, 30 * s, '+', () => {
      save.current.settings.music = Math.min(1, save.current.settings.music + 0.1);
      refresh();
    });
    y += 46 * s;
    this.addText(panelX + 30 * s, y, `音效音量：${Math.round(st.sfx * 100)}%`, 15, toCss(PAL.uiText), [0, 0.5]);
    this.addButton(panelX + panelW - 130 * s, y, 40 * s, 30 * s, '-', () => {
      save.current.settings.sfx = Math.max(0, save.current.settings.sfx - 0.1);
      audio.sfx('click', 0.5);
      refresh();
    });
    this.addButton(panelX + panelW - 80 * s, y, 40 * s, 30 * s, '+', () => {
      save.current.settings.sfx = Math.min(1, save.current.settings.sfx + 0.1);
      audio.sfx('click', 0.5);
      refresh();
    });
    y += 46 * s;
    this.addText(panelX + 30 * s, y, `总开关：${st.muted ? '已静音' : '开启'}`, 15, toCss(PAL.uiText), [0, 0.5]);
    this.addButton(panelX + panelW - 110 * s, y, 70 * s, 30 * s, st.muted ? '取消静音' : '静音', () => {
      save.current.settings.muted = !save.current.settings.muted;
      refresh();
    });
    y += 56 * s;
    // The save note is a bilingual block (two lines), so the buttons below it need room: with the
    // old 34px step the "refund talents" button was drawn straight through the English line.
    const note = this.addText(panelX + 30 * s, y, biLines('存档保存在浏览器 LocalStorage（战役进度 / 英雄等级 / 装备 / 天赋 / 遗物 / 设置）。'), 11, toCss(PAL.uiDim), [0, 0]);
    note.setWordWrapWidth(panelW - 60 * s, true);
    y += note.height + 26 * s;
    this.addButton(panelX + panelW / 2 - 150 * s, y, 300 * s, 34 * s, '退还全部天赋点（不损失进度）', () => {
      save.respecTalents();
      this.render();
    });
    y += 56 * s;
    this.addButton(panelX + panelW / 2, y, 280 * s, 34 * s, '清空存档并重置', () => {
      save.reset();
      audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);
      this.render();
    }, true, 0x5a2a2a);

    this.addButton(this.W / 2, panelY + panelH + 30 * s, 240 * s, 38 * s, '返回', () => {
      this.screen = 'main';
      this.render();
    });
  }

  private addToast(msg: string): void {
    const t = text(this, this.W / 2, this.H * 0.92, msg, 14 * this.s, toCss(PAL.uiGold), { origin: [0.5, 0.5], bold: true });
    this.root.add(t);
    this.time.delayedCall(1400, () => t.destroy());
  }

  /** which mission the deployment screen is preparing */
  private pendingMission = 'm01';

  /**
   * 出征准备 — the core loop of a hero-lord game: pick WHO you bring, look at their gear, read
   * the mission intel, and only then commit. Previously the hero was hardcoded per mission, which
   * made the "hero" pillar decorative.
   */
  private renderDeploy(): void {
    const s = this.s;
    const m = MISSIONS.find((x) => x.id === this.pendingMission) ?? MISSIONS[0];
    const panelW = Math.min(this.W * 0.9, 1080 * s);
    const panelX = (this.W - panelW) / 2;
    const panelY = this.H * 0.06;
    const panelH = this.H * 0.86;
    drawPanel(this.g, panelX, panelY, panelW, panelH, { header: true, alpha: 0.94 });
    this.addText(this.W / 2, panelY + 12 * s, '出 征 准 备', 19, toCss(PAL.uiGold), [0.5, 0.5], true);
    this.addText(this.W / 2, panelY + 36 * s, `${String(m.index).padStart(2, '0')}　${m.name} · ${m.enName}`, 15, toCss(PAL.uiText), [0.5, 0.5]);

    // ── mission intel (left) ──
    const infoX = panelX + 26 * s;
    let iy = panelY + 66 * s;
    const biome = m.map.biome === 'valley' ? '绿谷（明亮草原）' : m.map.biome === 'forest' ? '暗影森林（薄雾、黄昏）' : '黑暗堡垒（灰烬、夜）';
    const todName = m.timeOfDay === 'night' ? '夜' : m.timeOfDay === 'dusk' ? '黄昏' : m.timeOfDay === 'dawn' ? '黎明' : '白天';
    const biomeLine = `${bi(biome)} · ${bi('光照')}: ${bi(todName)}`;
    const boss = m.boss.unitId ? HERO_BOSS_NAMES[m.boss.unitId] ?? m.boss.unitId : '无';
    const lines = [
      ['战场', biomeLine],
      ['目标时限', `${Math.round(m.parTime / 60)} 分钟（越快星级越高）`],
      ['敌方主营', `${m.enemyCamps.length} 座（强度 ${m.enemyCamps.map((c) => c.strength).join('/')}）`],
      ['最终 Boss', boss],
      ['本局随机祝福', '进入战场时随机获得 1 个（Roguelite）'],
    ];
    // Each intel row is a LABEL line followed by a VALUE line. Both are bilingual now, so a
    // "label left / value right" row would collide with itself, and a wrapped value would run into
    // the next row: the advance is taken from the text that was actually rendered.
    const infoW = panelW * 0.42;
    for (const [k, v] of lines) {
      const label = this.addText(infoX, iy, biAuto(k), 11, toCss(PAL.uiDim), [0, 0], true);
      label.setWordWrapWidth(infoW, true);
      const lineH = Math.max(label.height, 14 * s);
      const t = this.addText(infoX, iy + lineH + 2 * s, v, 12, toCss(PAL.uiText), [0, 0]);
      t.setWordWrapWidth(infoW, true);
      iy += lineH + 4 * s + t.height + 8 * s;
    }
    this.addText(infoX, iy + 6 * s, '任务简报', 12, toCss(PAL.uiDim), [0, 0], true);
    const brief = this.addText(infoX, iy + 28 * s, m.brief, 12, toCss(PAL.uiText), [0, 0]);
    brief.setWordWrapWidth(infoW, true);
    // objectives preview
    const objText = m.objectives
      .filter((o) => !o.hidden)
      .map((o) => biAuto(`${o.optional ? '·' : '▸'} ${o.text}`))
      .join('\n');
    const objs = this.addText(infoX, iy + 28 * s + brief.height + 12 * s, objText, 11, toCss(PAL.uiDim), [0, 0]);
    objs.setWordWrapWidth(infoW, true);

    // ── hero picker (right) ──
    const hx = panelX + panelW * 0.56;
    this.addText(hx, panelY + 56 * s, '选择出征英雄', 12, toCss(PAL.uiGold), [0, 0.5], true);
    const level = save.getRecordFor ? save.getRecordFor(this.selectedHero).level : save.current.hero.level;
    const equipped = save.getRecordFor ? save.getRecordFor(this.selectedHero).equipment : save.current.hero.equipment;
    HERO_ORDER.forEach((id, i) => {
      const def = HEROES[id];
      const y = panelY + 104 * s + i * 128 * s;
      const selected = this.selectedHero === id;
      const w = panelW * 0.4;
      this.g.fillStyle(selected ? PAL.uiPanelLight : PAL.uiPanel, selected ? 0.95 : 0.7);
      this.g.fillRoundedRect(hx, y - 22 * s, w, 112 * s, 6);
      this.g.lineStyle(selected ? 2 : 1, selected ? PAL.uiGold : PAL.uiBorder, selected ? 1 : 0.6);
      this.g.strokeRoundedRect(hx, y - 22 * s, w, 112 * s, 6);
      const img = this.add.image(hx + 46 * s, y + 30 * s, `u_${id}`).setScale(1.5 * s * metaOf(`u_${id}`).sx);
      this.root.add(img);
      this.addText(hx + 92 * s, y - 12 * s, `${def.name} · ${def.title}`, 15, selected ? toCss(PAL.uiGold) : toCss(PAL.uiText), [0, 0.5], true);
      const role = def.role === 'tank' ? '近战坦克' : def.role === 'mage' ? '远程法术 AOE' : '远程输出';
      this.addText(hx + 92 * s, y + 8 * s, `${role}　等级 ${level}`, 12, toCss(PAL.uiDim), [0, 0.5]);
      // equipped gear: the hero-lord fantasy is that your loot shows up here
      const gear = Object.entries(equipped)
        .filter(([, itemId]) => !!itemId)
        .map(([slot, itemId]) => `${slot}: ${ITEM_NAMES[itemId as string] ?? itemId}`)
        .slice(0, 3);
      // the "nothing equipped" hint is long in both languages and ran past the card border, so it
      // is wrapped to the card's inner width
      const gearText = this.addText(
        hx + 92 * s,
        y + 26 * s,
        gear.length ? gear.join('　') : '未装备（战利品可在「英雄/装备」里装上）',
        10,
        toCss(PAL.uiDim),
        [0, 0],
      );
      gearText.setWordWrapWidth(w - 104 * s, true);
      def.skills.forEach((sid, k) => {
        const icon = this.add.image(hx + 96 * s + k * 34 * s, y + 54 * s, `icon_${sid}`).setDisplaySize(26 * s, 26 * s);
        this.root.add(icon);
      });
      // clickable area
      const hit = this.addButton(hx + w / 2, y + 44 * s, w, 112 * s, '', () => {
        this.selectedHero = id;
        this.render();
      }, true);
      hit.rect.setAlpha(0.001);
      hit.label.setAlpha(0.001);
    });

    // ── actions ──
    this.addButton(panelX + panelW * 0.22, panelY + panelH + 26 * s, 200 * s, 40 * s, '返回战役', () => {
      this.screen = 'campaign';
      this.render();
    });
    this.addButton(panelX + panelW * 0.62, panelY + panelH + 26 * s, 260 * s, 40 * s, `出征 · ${HEROES[this.selectedHero].name}`, () => this.startMission(this.pendingMission));
  }

  private startMission(id: string): void {
    // commit the hero choice: every hero keeps their own level, gear, talents and relics
    save.setActiveHero(this.selectedHero);
    this.scene.start('Battle', { missionId: id, heroId: this.selectedHero });
  }
}
