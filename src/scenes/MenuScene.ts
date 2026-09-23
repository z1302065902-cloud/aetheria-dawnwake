import Phaser from 'phaser';
import { PAL, toCss } from '../art/Palette';
import { Button, drawPanel, text } from '../ui/UiKit';
import { audio } from '../audio/AudioBus';
import { save } from '../core/SaveManager';
import { MISSIONS, PLAYABLE_MISSIONS } from '../data/missions';
import { HEROES, HERO_ORDER } from '../data/heroes';
import { RELICS } from '../data/items';
import { TALENTS, TALENT_BRANCH_LABEL } from '../data/talents';
import { equipFromInventory, heroSheet, unequipSlot } from '../systems/Equipment';
import { metaOf } from '../art/SpriteFactory';

type Screen = 'main' | 'campaign' | 'heroes' | 'settings';

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
    this.g = this.add.graphics().setDepth(1);
    this.bg = this.add.graphics().setDepth(0);
    this.root = this.add.container(0, 0).setDepth(10);

    audio.playMusic('menu');
    this.scale.on('resize', this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize);
    });
    this.render();
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

  private addButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void, enabled = true, fill?: number): Button {
    const b = new Button(this, x, y, w, h, label, () => {
      audio.init();
      audio.sfx('click', 0.4);
      onClick();
    }, { fontSize: 16 * this.s, fill });
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
    this.addButton(bx, y, 300 * s, 42 * s, '开始战役 · 翡翠谷地', () => this.startMission('m01'));
    y += gap;
    this.addButton(bx, y, 300 * s, 42 * s, '关卡选择', () => {
      this.screen = 'campaign';
      this.render();
    });
    y += gap;
    this.addButton(bx, y, 300 * s, 42 * s, '英雄 / 装备 / 遗物', () => {
      this.screen = 'heroes';
      this.render();
    });
    y += gap;
    this.addButton(bx, y, 300 * s, 42 * s, '设置与音频', () => {
      this.screen = 'settings';
      this.render();
    });
    y += gap;
    this.addButton(bx, y, 300 * s, 42 * s, '继续上次进度', () => {
      const unlocked = save.current.campaign.unlockedMissions;
      const last = unlocked[unlocked.length - 1] ?? 'm01';
      this.startMission(PLAYABLE_MISSIONS.has(last) ? last : 'm01');
    });

    const stats = save.current.stats;
    this.addText(this.W / 2, this.H - 44 * s, `本地存档：通关 ${stats.victories}/${stats.matches} 场 · 英雄等级 ${save.current.hero.level} · 遗物 ${save.current.hero.relics.length}`, 13, toCss(PAL.uiDim));
    this.addText(this.W / 2, this.H - 24 * s, '本作全部美术与音效均由代码程序化生成，不含任何第三方素材。', 12, toCss(PAL.uiDim));
  }

  private renderCampaign(): void {
    const s = this.s;
    const panelW = Math.min(this.W * 0.86, 980 * s);
    const panelX = (this.W - panelW) / 2;
    const panelY = this.H * 0.12;
    const panelH = this.H * 0.74;
    drawPanel(this.g, panelX, panelY, panelW, panelH, { header: true, alpha: 0.9 });
    this.addText(this.W / 2, panelY + 14 * s, '战役 · 十关', 18, toCss(PAL.uiGold), [0.5, 0.5], true);

    const unlocked = save.current.campaign.unlockedMissions;
    const rowH = 38 * s;
    const startY = panelY + 44 * s;
    MISSIONS.forEach((m, i) => {
      const y = startY + i * rowH;
      const playable = PLAYABLE_MISSIONS.has(m.id);
      const isUnlocked = unlocked.includes(m.id) && playable;
      const done = save.current.campaign.completed[m.id];
      const label = `${String(m.index).padStart(2, '0')}  ${m.name}　${m.enName}`;
      const state = done ? '★'.repeat(done.stars) + '☆'.repeat(3 - done.stars) : playable ? (isUnlocked ? '可挑战' : '未解锁') : 'Phase 2';
      const btn = this.addButton(panelX + panelW * 0.28, y, panelW * 0.5, rowH - 6 * s, `${label}　[${state}]`, () => {
        if (!isUnlocked) {
          this.addToast('该关卡在后续版本开放');
          return;
        }
        this.startMission(m.id);
      }, isUnlocked);
      void btn;
      const t = this.addText(panelX + panelW * 0.56, y, m.brief, 12, toCss(PAL.uiDim), [0, 0.5]);
      t.setWordWrapWidth(panelW * 0.36);
    });

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
        this.g.strokeRoundedRect(x - colW / 2 + 8 * s, y - 8 * s, colW - 16 * s, 152 * s, 8);
      }
      const img = this.add.image(x, y + 30 * s, `u_${id}`).setScale(1.5 * s * metaOf(`u_${id}`).sx);
      this.root.add(img);
      this.addText(x, y + 66 * s, `${def.name} · ${def.title}`, 15, toCss(PAL.uiGold), [0.5, 0.5], true);
      this.addText(
        x,
        y + 82 * s,
        `${def.role === 'tank' ? '近战坦克' : def.role === 'mage' ? '远程法术 AOE' : '远程输出'}　HP ${def.base.hp} / 攻 ${def.base.attack} / 甲 ${def.base.armor}`,
        12,
        toCss(PAL.uiDim),
        [0.5, 0.5],
      );
      def.skills.forEach((sid, k) => {
        const icon = this.add.image(x - 66 * s + k * 44 * s, y + 104 * s, `icon_${sid}`).setDisplaySize(34 * s, 34 * s);
        this.root.add(icon);
      });
      const btn = new Button(this, x, y + 134 * s, colW - 90 * s, 30 * s, selected ? '已选择' : '选择此英雄', () => {
        this.selectedHero = id;
        save.current.hero.id = id;
        save.save();
        this.render();
      });
      this.root.add([btn.rect, btn.label]);
    });

    // ── divider ──────────────────────────────────────────────────
    const dividerY = panelY + 208 * s;
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
    if (sheet.inventory.length === 0) {
      this.addText(colX[1], top + 34 * s, '还没有战利品。通关会掉落装备（星级与 Boss 影响数量与品质）。', 12, toCss(PAL.uiDim), [0, 0.5]);
    }
    sheet.inventory.slice(0, 9).forEach((item, i) => {
      const y = top + 30 * s + i * 32 * s;
      const equipped = (save.current.hero.equipment ?? {})[item.slot] === item.id;
      this.addText(colX[1], y, `${item.name}`, 12, this.rarityColor(item.rarity), [0, 0.5]);
      this.addText(colX[1] + 92 * s, y, this.itemStatsText(item), 11, toCss(PAL.uiDim), [0, 0.5]);
      const b = new Button(this, colX[1] + colW - 34 * s, y, 62 * s, 26 * s, equipped ? '已装备' : '装备', () => {
        equipFromInventory(save.current, item.id);
        save.save();
        this.render();
      });
      b.setEnabled(!equipped);
      this.root.add([b.rect, b.label]);
    });

    // ── column 3: talents + relics ───────────────────────────────
    this.addText(colX[2], top, `天赋（剩余 ${save.current.hero.talentPoints} 点）`, 15, toCss(PAL.uiGold), [0, 0.5], true);
    TALENTS.forEach((t, i) => {
      const y = top + 30 * s + i * 30 * s;
      const rank = save.current.hero.talents?.[t.id] ?? 0;
      const maxed = rank >= t.maxRank;
      this.addText(
        colX[2],
        y,
        `${TALENT_BRANCH_LABEL[t.branch]}·${t.name} ${rank}/${t.maxRank}`,
        12,
        rank > 0 ? toCss(0x9fffb0) : toCss(PAL.uiText),
        [0, 0.5],
      );
      this.addText(colX[2] + 150 * s, y, t.desc, 11, toCss(PAL.uiDim), [0, 0.5]);
      const b = new Button(this, colX[2] + colW - 24 * s, y, 34 * s, 24 * s, '+', () => {
        save.spendTalentPoint(t.id, t.maxRank);
        this.render();
      });
      b.setEnabled(!maxed && save.current.hero.talentPoints > 0);
      this.root.add([b.rect, b.label]);
    });
    const relicTop = top + 30 * s + TALENTS.length * 30 * s + 18 * s;
    this.addText(colX[2], relicTop, `遗物（${save.current.hero.relics.length}/${RELICS.length}）`, 15, toCss(PAL.uiGold), [0, 0.5], true);
    RELICS.forEach((r, i) => {
      const owned = save.current.hero.relics.includes(r.id);
      const y = relicTop + 26 * s + i * 20 * s;
      this.addText(colX[2], y, `${owned ? '✔' : '○'} ${r.name} — ${r.desc}`, 11, toCss(owned ? 0x9fffb0 : PAL.uiDim), [0, 0.5]);
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
    this.addText(panelX + 30 * s, y, '存档保存在浏览器 LocalStorage（战役进度 / 英雄等级 / 装备 / 天赋 / 遗物 / 设置）。', 12, toCss(PAL.uiDim), [0, 0.5]);
    y += 34 * s;
    this.addButton(panelX + panelW / 2 - 150 * s, y, 280 * s, 34 * s, '退还全部天赋点（不损失进度）', () => {
      save.respecTalents();
      this.render();
    });
    y += 44 * s;
    this.addButton(panelX + panelW / 2, y, 260 * s, 34 * s, '清空存档并重置', () => {
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

  private startMission(id: string): void {
    this.scene.start('Battle', { missionId: id, heroId: this.selectedHero });
  }
}
