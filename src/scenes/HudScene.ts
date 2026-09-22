import Phaser from 'phaser';
import { bus, EV } from '../core/EventBus';
import { audio } from '../audio/AudioBus';
import { PAL, toCss } from '../art/Palette';
import { Bar, Button, drawPanel, formatTime, text } from '../ui/UiKit';
import { metaOf } from '../art/SpriteFactory';
import { BUILDINGS } from '../data/buildings';
import { getUnit } from '../data/units';
import { RESOURCE_COLOR, type ResourceId } from '../config/Constants';
import { save } from '../core/SaveManager';
import type { BattleScene, HudState } from '../scenes/BattleScene';
import type { MatchResult } from '../systems/Mission';

interface UnitCard {
  bg: Phaser.GameObjects.Rectangle;
  bar: Bar;
  label: Phaser.GameObjects.Text;
}

/**
 * The whole HUD is a separate scene drawn at 1600x900 design scale, anchored to the
 * viewport corners. Nothing here touches the game world — it polls BattleScene state.
 */
export class HudScene extends Phaser.Scene {
  private battle!: BattleScene;
  private s = 1;
  private W = 1600;
  private H = 900;

  private staticG!: Phaser.GameObjects.Graphics;
  private goldText!: Phaser.GameObjects.Text;
  private woodText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private popText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  private minimapImage!: Phaser.GameObjects.Image;
  private minimapG!: Phaser.GameObjects.Graphics;
  private minimapZone!: Phaser.GameObjects.Rectangle;

  private heroName!: Phaser.GameObjects.Text;
  private heroLevel!: Phaser.GameObjects.Text;
  private heroPortrait!: Phaser.GameObjects.Image;
  private heroHp!: Bar;
  private heroMana!: Bar;
  private heroXp!: Bar;
  private heroRespawn!: Phaser.GameObjects.Text;

  private abilityButtons: Button[] = [];
  private abilityIcons: Phaser.GameObjects.Image[] = [];
  private abilityCooldown: Phaser.GameObjects.Graphics | null = null;
  private abilityCosts: Phaser.GameObjects.Text[] = [];

  private unitCards: UnitCard[] = [];
  private selectionTitle!: Phaser.GameObjects.Text;
  private buildButtons: Button[] = [];
  private produceButtons: Button[] = [];
  private queueTexts: Phaser.GameObjects.Text[] = [];

  private objectiveTexts: Phaser.GameObjects.Text[] = [];
  private objectivePanelHeight = 0;

  private toast!: Phaser.GameObjects.Text;
  private toastTimer = 0;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerTimer = 0;

  private pauseRoot!: Phaser.GameObjects.Container;
  private resultRoot!: Phaser.GameObjects.Container;
  private musicLabel!: Phaser.GameObjects.Text;
  private sfxLabel!: Phaser.GameObjects.Text;
  private muteLabel!: Phaser.GameObjects.Text;

  private toastText = '';
  private lastObjectiveSignature = '';

  constructor() {
    super('Hud');
  }

  create(data: { battle: BattleScene }): void {
    // restart()-safe: clear every pool/array that create() fills.
    this.abilityButtons = [];
    this.abilityIcons = [];
    this.abilityCosts = [];
    this.unitCards = [];
    this.buildButtons = [];
    this.produceButtons = [];
    this.queueTexts = [];
    this.objectiveTexts = [];
    this.pauseButtons = [];
    this.resultButtons = [];
    this.volumeButtons = [];
    this.unsubs = [];
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.refreshAccum = 0;
    this.lastObjectiveSignature = '';

    this.battle = data.battle;
    this.staticG = this.add.graphics().setDepth(0);

    // top bar texts
    this.goldText = text(this, 0, 0, '', 15, toCss(RESOURCE_COLOR.gold), { bold: true });
    this.woodText = text(this, 0, 0, '', 15, toCss(RESOURCE_COLOR.wood), { bold: true });
    this.manaText = text(this, 0, 0, '', 15, toCss(RESOURCE_COLOR.mana), { bold: true });
    this.popText = text(this, 0, 0, '', 15, toCss(PAL.uiText), { bold: true });
    this.timerText = text(this, 0, 0, '', 16, toCss(PAL.uiGold), { bold: true, origin: [0.5, 0.5] });
    this.waveText = text(this, 0, 0, '', 13, toCss(PAL.uiDim), { origin: [1, 0.5] });
    this.hintText = text(this, 0, 0, '左键框选 · 右键移动/攻击 · A 攻击移动 · S 停止 · H 驻守 · QWER 技能 · 1-5 编队 · 滚轮缩放 · Esc 暂停', 12, toCss(PAL.uiDim), { origin: [0.5, 0.5] });

    // minimap
    this.minimapImage = this.add.image(0, 0, 'minimapBase').setOrigin(0, 0);
    this.minimapG = this.add.graphics();
    this.minimapZone = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.minimapZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const b = this.minimapZone.getBounds();
      const nx = Phaser.Math.Clamp((p.x - b.x) / b.width, 0, 1);
      const ny = Phaser.Math.Clamp((p.y - b.y) / b.height, 0, 1);
      bus.emit('ui:minimap-click', { x: nx, y: ny });
    });

    // hero panel
    this.heroPortrait = this.add.image(0, 0, 'u_knightCommander').setOrigin(0.5, 0.62);
    this.heroName = text(this, 0, 0, '', 15, toCss(PAL.uiGold), { bold: true });
    this.heroLevel = text(this, 0, 0, '', 13, toCss(PAL.uiText), { origin: [1, 0.5] });
    this.heroHp = new Bar(this, 0, 0, 100, 9, PAL.hp);
    this.heroMana = new Bar(this, 0, 0, 100, 7, PAL.mana);
    this.heroXp = new Bar(this, 0, 0, 100, 5, PAL.xp);
    this.heroRespawn = text(this, 0, 0, '', 20, toCss(0xff7a6a), { bold: true, origin: [0.5, 0.5] });

    // abilities
    this.abilityCooldown = this.add.graphics();
    for (let i = 0; i < 4; i++) {
      const btn = new Button(this, 0, 0, 60, 60, '', () => {
        const st = this.battle.getHudState();
        const ability = st.hero.abilities[i];
        if (ability) bus.emit(EV.ABILITY, ability.id);
      });
      btn.setLabel('');
      this.abilityButtons.push(btn);
      const icon = this.add.image(0, 0, 'icon_shieldCharge').setDisplaySize(48, 48);
      this.abilityIcons.push(icon);
      this.abilityCosts.push(text(this, 0, 0, '', 11, toCss(PAL.mana), { origin: [0.5, 0.5], bold: true }));
    }

    // selection panel
    this.selectionTitle = text(this, 0, 0, '', 13, toCss(PAL.uiDim), { bold: true });
    for (let i = 0; i < 12; i++) {
      const bg = this.add.rectangle(0, 0, 54, 46, 0x1b2440, 0.9).setStrokeStyle(1, PAL.uiBorder, 0.7);
      const bar = new Bar(this, 0, 0, 46, 4, PAL.hp);
      const label = text(this, 0, 0, '', 10, toCss(PAL.uiText), { origin: [0.5, 0.5] });
      this.unitCards.push({ bg, bar, label });
    }
    for (let i = 0; i < 6; i++) {
      const btn = new Button(this, 0, 0, 108, 34, '', () => {
        const id = btn.getDataId();
        if (id) bus.emit('ui:build-request', id);
      });
      this.buildButtons.push(btn);
    }
    for (let i = 0; i < 4; i++) {
      const btn = new Button(this, 0, 0, 120, 34, '', () => {
        const id = btn.getDataId();
        if (id) bus.emit('ui:produce-request', id);
      });
      this.produceButtons.push(btn);
    }
    for (let i = 0; i < 5; i++) {
      this.queueTexts.push(text(this, 0, 0, '', 12, toCss(PAL.uiText), { origin: [0, 0.5] }));
    }

    // objectives
    for (let i = 0; i < 9; i++) {
      this.objectiveTexts.push(text(this, 0, 0, '', 12, toCss(PAL.uiText), { origin: [0, 0] }));
    }

    // toast + banner
    this.toast = text(this, 0, 0, '', 15, toCss(PAL.uiText), { origin: [0.5, 0.5], bold: true }).setAlpha(0);
    this.bannerTitle = text(this, 0, 0, '', 30, toCss(PAL.uiGold), { origin: [0.5, 0.5], bold: true }).setAlpha(0);
    this.bannerSub = text(this, 0, 0, '', 15, toCss(PAL.uiDim), { origin: [0.5, 0.5] }).setAlpha(0);

    this.buildPauseOverlay();
    this.buildResultOverlay();

    // events
    this.unsubs.push(
      bus.on(EV.TOAST, (msg: string) => this.showToast(msg)),
      bus.on(EV.BANNER, (payload: { text: string; sub?: string }) => this.showBanner(payload.text, payload.sub ?? '')),
      bus.on(EV.MATCH_END, (r: MatchResult & { missionName: string; parTime: number }) => this.showResult(r)),
      bus.on('ui:paused', (p: boolean) => this.pauseRoot.setVisible(p)),
    );

    this.scale.on('resize', this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const u of this.unsubs) u();
      this.unsubs.length = 0;
      this.scale.off('resize', this.onResize);
    });
    this.layout();
  }

  private onResize = (): void => {
    if (this.scene.isActive()) this.layout();
  };

  private unsubs: Array<() => void> = [];
  private refreshAccum = 0;

  bind(battle: BattleScene): void {
    this.battle = battle;
    this.resultRoot.setVisible(false);
    this.pauseRoot.setVisible(false);
  }

  // ────────────────────────── layout ──────────────────────────

  private layout(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.s = Phaser.Math.Clamp(Math.min(this.W / 1600, this.H / 900), 0.42, 1.6);
    const s = this.s;
    const g = this.staticG;

    // ---- top strip ----
    const topH = 40 * s;
    g.clear();
    g.fillStyle(PAL.uiBg, 0.92);
    g.fillRect(0, 0, this.W, topH);
    g.lineStyle(1.5, PAL.uiBorder, 0.6);
    g.lineBetween(0, topH, this.W, topH);

    let x = 14 * s;
    const cy = topH / 2;
    this.goldText.setPosition(x, cy).setFontSize(15 * s);
    x += 118 * s;
    this.woodText.setPosition(x, cy).setFontSize(15 * s);
    x += 118 * s;
    this.manaText.setPosition(x, cy).setFontSize(15 * s);
    x += 140 * s;
    this.popText.setPosition(x, cy).setFontSize(15 * s);
    this.timerText.setPosition(this.W / 2, cy).setFontSize(16 * s);
    this.waveText.setPosition(this.W - 14 * s, cy).setFontSize(13 * s);
    this.hintText.setPosition(this.W / 2, topH + 12 * s).setFontSize(11 * s);

    // ---- objectives panel (top right) ----
    const objW = 286 * s;
    const objX = this.W - objW - 10 * s;
    const objY = topH + 26 * s;
    this.objectivePanelHeight = 34 * s + this.objectiveTexts.length * 20 * s * 0.5 + 10 * s;
    drawPanel(g, objX, objY, objW, 26 * s + 9 * 20 * s, { header: true, alpha: 0.86 });
    for (let i = 0; i < this.objectiveTexts.length; i++) {
      this.objectiveTexts[i].setPosition(objX + 12 * s, objY + 30 * s + i * 19 * s).setFontSize(12 * s);
    }
    this.objectivePanelHeight = 26 * s + 9 * 19 * s;

    // ---- bottom strip ----
    const bottomH = 132 * s;
    const bottomY = this.H - bottomH;
    g.fillStyle(PAL.uiBg, 0.93);
    g.fillRect(0, bottomY, this.W, bottomH);
    g.lineStyle(1.5, PAL.uiBorder, 0.6);
    g.lineBetween(0, bottomY, this.W, bottomY);

    // minimap
    const mmSize = 120 * s;
    const mmX = 8 * s;
    const mmY = this.H - mmSize - 6 * s;
    this.minimapImage.setPosition(mmX, mmY).setDisplaySize(mmSize, mmSize);
    this.minimapZone.setPosition(mmX + mmSize / 2, mmY + mmSize / 2).setSize(mmSize, mmSize);
    this.minimapZone.setInteractive();
    g.lineStyle(1.5, PAL.uiBorder, 0.9);
    g.strokeRect(mmX, mmY, mmSize, mmSize);

    // hero panel
    const hpW = 296 * s;
    const hpX = mmX + mmSize + 10 * s;
    const hpY = this.H - bottomH + 8 * s;
    const hpH = bottomH - 16 * s;
    drawPanel(g, hpX, hpY, hpW, hpH, { alpha: 0.9 });
    this.heroPortrait.setPosition(hpX + 42 * s, hpY + hpH * 0.56).setScale(1.25 * s);
    this.heroName.setPosition(hpX + 84 * s, hpY + 16 * s).setFontSize(15 * s);
    this.heroLevel.setPosition(hpX + hpW - 10 * s, hpY + 16 * s).setFontSize(13 * s);
    const barX = hpX + 84 * s;
    const barW = hpW - 96 * s;
    this.heroHp.x = barX;
    this.heroHp.y = hpY + 34 * s;
    this.heroHp.w = barW;
    this.heroHp.h = 9 * s;
    this.heroMana.x = barX;
    this.heroMana.y = hpY + 50 * s;
    this.heroMana.w = barW;
    this.heroMana.h = 7 * s;
    this.heroXp.x = barX;
    this.heroXp.y = hpY + 64 * s;
    this.heroXp.w = barW;
    this.heroXp.h = 5 * s;
    this.heroRespawn.setPosition(hpX + hpW / 2, hpY + hpH - 18 * s).setFontSize(17 * s);

    // ability panel (right)
    const abW = 356 * s;
    const abX = this.W - abW - 8 * s;
    const abY = this.H - bottomH + 8 * s;
    drawPanel(g, abX, abY, abW, hpH, { alpha: 0.9 });
    for (let i = 0; i < 4; i++) {
      const bx = abX + 40 * s + i * 76 * s;
      const by = abY + 46 * s;
      this.abilityButtons[i].setPosition(bx, by).setSize(60 * s, 60 * s);
      this.abilityButtons[i].rect.setSize(60 * s, 60 * s);
      this.abilityIcons[i].setPosition(bx, by).setDisplaySize(50 * s, 50 * s);
      this.abilityCosts[i].setPosition(bx, by + 40 * s).setFontSize(11 * s);
    }

    // command panel (centre)
    const cmdX = hpX + hpW + 10 * s;
    const cmdW = Math.max(240 * s, abX - cmdX - 10 * s);
    drawPanel(g, cmdX, abY, cmdW, hpH, { alpha: 0.9 });
    this.selectionTitle.setPosition(cmdX + 10 * s, abY + 14 * s).setFontSize(13 * s);
    const cardW = 56 * s;
    for (let i = 0; i < this.unitCards.length; i++) {
      const cx = cmdX + 12 * s + i * (cardW + 4 * s);
      const cyy = abY + 34 * s;
      const card = this.unitCards[i];
      card.bg.setPosition(cx + cardW / 2 - 6 * s, cyy + 22 * s);
      card.bg.setSize(cardW - 4 * s, 44 * s);
      card.bar.x = cx + 4 * s;
      card.bar.y = cyy + 42 * s;
      card.bar.w = cardW - 14 * s;
      card.bar.h = 4 * s;
      card.label.setPosition(cx + cardW / 2 - 6 * s, cyy + 20 * s).setFontSize(10 * s);
    }
    for (let i = 0; i < this.buildButtons.length; i++) {
      const bx = cmdX + 14 * s + (i % 6) * 112 * s;
      const by = abY + 88 * s;
      this.buildButtons[i].setPosition(bx + 54 * s, by).setSize(106 * s, 30 * s);
      this.buildButtons[i].label.setFontSize(12 * s);
    }
    for (let i = 0; i < this.produceButtons.length; i++) {
      const bx = cmdX + 14 * s + i * 130 * s;
      const by = abY + 88 * s;
      this.produceButtons[i].setPosition(bx + 62 * s, by).setSize(124 * s, 30 * s);
      this.produceButtons[i].label.setFontSize(12 * s);
    }
    for (let i = 0; i < this.queueTexts.length; i++) {
      this.queueTexts[i].setPosition(cmdX + 14 * s, abY + 56 * s + i * 14 * s).setFontSize(11 * s);
    }

    // toast + banner
    this.toast.setPosition(this.W / 2, bottomY - 28 * s).setFontSize(15 * s);
    this.bannerTitle.setPosition(this.W / 2, this.H * 0.24).setFontSize(32 * s);
    this.bannerSub.setPosition(this.W / 2, this.H * 0.24 + 34 * s).setFontSize(15 * s);

    this.layoutOverlays();
  }

  private layoutOverlays(): void {
    const s = this.s;
    // pause
    const pauseChildren = this.pauseRoot.list as Phaser.GameObjects.GameObject[];
    const pauseBg = pauseChildren[0] as Phaser.GameObjects.Rectangle;
    pauseBg.setSize(this.W, this.H).setPosition(this.W / 2, this.H / 2);
    const title = pauseChildren[1] as Phaser.GameObjects.Text;
    title.setPosition(this.W / 2, this.H * 0.3).setFontSize(30 * s);
    const buttons = this.pauseButtons;
    buttons.forEach((b, i) => {
      b.setPosition(this.W / 2, this.H * 0.42 + i * 46 * s).setSize(280 * s, 36 * s);
      b.label.setFontSize(15 * s);
    });
    this.musicLabel.setPosition(this.W / 2, this.H * 0.42 + 4 * 46 * s + 6 * s).setFontSize(14 * s);
    this.sfxLabel.setPosition(this.W / 2, this.H * 0.42 + 4 * 46 * s + 30 * s).setFontSize(14 * s);
    this.muteLabel.setPosition(this.W / 2, this.H * 0.42 + 4 * 46 * s + 54 * s).setFontSize(14 * s);
    void pauseChildren;

    // result
    const rc = this.resultRoot.list as Phaser.GameObjects.GameObject[];
    const rbg = rc[0] as Phaser.GameObjects.Rectangle;
    rbg.setSize(this.W, this.H).setPosition(this.W / 2, this.H / 2);
    this.resultTitle.setPosition(this.W / 2, this.H * 0.2).setFontSize(40 * s);
    this.resultSub.setPosition(this.W / 2, this.H * 0.2 + 44 * s).setFontSize(17 * s);
    this.resultBody.setPosition(this.W / 2, this.H * 0.46).setFontSize(15 * s);
    this.resultStars.setPosition(this.W / 2, this.H * 0.38).setFontSize(34 * s);
    this.resultButtons.forEach((b, i) => {
      b.setPosition(this.W / 2 + (i - 0.5) * 200 * s, this.H * 0.76).setSize(180 * s, 42 * s);
      b.label.setFontSize(15 * s);
    });
  }

  // ────────────────────────── overlays ──────────────────────────

  private pauseButtons: Button[] = [];
  private resultButtons: Button[] = [];
  private resultTitle!: Phaser.GameObjects.Text;
  private resultSub!: Phaser.GameObjects.Text;
  private resultBody!: Phaser.GameObjects.Text;
  private resultStars!: Phaser.GameObjects.Text;

  private buildPauseOverlay(): void {
    this.pauseRoot = this.add.container(0, 0).setDepth(500).setVisible(false);
    const bg = this.add.rectangle(0, 0, 100, 100, 0x050710, 0.72);
    const title = text(this, 0, 0, '已暂停', 30, toCss(PAL.uiGold), { bold: true, origin: [0.5, 0.5] });
    this.pauseRoot.add([bg, title]);

    const resume = new Button(this, 0, 0, 280, 36, '继续战斗 (Esc)', () => bus.emit('ui:toggle-pause'), {});
    const restart = new Button(this, 0, 0, 280, 36, '重开本关', () => bus.emit('ui:retry'), {});
    const menu = new Button(this, 0, 0, 280, 36, '返回主菜单', () => bus.emit('ui:return-menu'), {});
    const help = new Button(this, 0, 0, 280, 36, '操作说明：A 攻击移动 / H 驻守 / 1-5 编队 / Shift 队列', () => this.showToast('右键移动与攻击 · 左键拖动框选 · 空格回到英雄'), {});
    this.pauseButtons = [resume, restart, menu, help];

    this.musicLabel = text(this, 0, 0, '', 14, toCss(PAL.uiText), { origin: [0.5, 0.5] });
    this.sfxLabel = text(this, 0, 0, '', 14, toCss(PAL.uiText), { origin: [0.5, 0.5] });
    this.muteLabel = text(this, 0, 0, '', 14, toCss(PAL.uiText), { origin: [0.5, 0.5] });
    this.pauseRoot.add([...this.pauseButtons.map((b) => b.rect), ...this.pauseButtons.map((b) => b.label)]);
    this.pauseRoot.add([this.musicLabel, this.sfxLabel, this.muteLabel]);

    const volumeBtn = (label: string, dy: number, get: () => number, set: (v: number) => void, textObj: () => Phaser.GameObjects.Text) => {
      const minus = new Button(this, 0, 0, 34, 28, '-', () => {
        set(Math.max(0, get() - 0.1));
        audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);
        textObj().setText(`${label} ${Math.round(get() * 100)}%（点击 +/- 调整）`);
        save.save();
      });
      const plus = new Button(this, 0, 0, 34, 28, '+', () => {
        set(Math.min(1, get() + 0.1));
        audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);
        textObj().setText(`${label} ${Math.round(get() * 100)}%（点击 +/- 调整）`);
        save.save();
      });
      this.volumeButtons.push({ minus, plus, dy });
      this.pauseRoot.add([minus.rect, minus.label, plus.rect, plus.label]);
    };
    this.volumeButtons.length = 0;
    volumeBtn('音乐音量', 0, () => save.current.settings.music, (v) => { save.current.settings.music = v; }, () => this.musicLabel);
    volumeBtn('音效音量', 1, () => save.current.settings.sfx, (v) => { save.current.settings.sfx = v; }, () => this.sfxLabel);
    const mute = new Button(this, 0, 0, 34, 28, '静音', () => {
      save.current.settings.muted = !save.current.settings.muted;
      audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);
      this.muteLabel.setText(`总开关：${save.current.settings.muted ? '已静音' : '开启'}`);
      save.save();
    });
    this.volumeButtons.push({ minus: mute, plus: null, dy: 2 });
    this.pauseRoot.add([mute.rect, mute.label]);
    this.musicLabel.setText(`音乐音量 ${Math.round(save.current.settings.music * 100)}%`);
    this.sfxLabel.setText(`音效音量 ${Math.round(save.current.settings.sfx * 100)}%`);
    this.muteLabel.setText(`总开关：${save.current.settings.muted ? '已静音' : '开启'}`);
  }

  private volumeButtons: Array<{ minus: Button; plus: Button | null; dy: number }> = [];

  private buildResultOverlay(): void {
    this.resultRoot = this.add.container(0, 0).setDepth(600).setVisible(false);
    const bg = this.add.rectangle(0, 0, 100, 100, 0x050710, 0.85);
    this.resultTitle = text(this, 0, 0, '', 40, toCss(PAL.uiGold), { bold: true, origin: [0.5, 0.5] });
    this.resultSub = text(this, 0, 0, '', 17, toCss(PAL.uiDim), { origin: [0.5, 0.5] });
    this.resultStars = text(this, 0, 0, '', 34, toCss(PAL.uiGold), { bold: true, origin: [0.5, 0.5] });
    this.resultBody = text(this, 0, 0, '', 15, toCss(PAL.uiText), { origin: [0.5, 0.5] });
    const again = new Button(this, 0, 0, 180, 42, '再打一次', () => bus.emit('ui:retry'), {});
    const menu = new Button(this, 0, 0, 180, 42, '返回主菜单', () => bus.emit('ui:return-menu'), {});
    this.resultButtons = [again, menu];
    this.resultRoot.add([bg, this.resultTitle, this.resultSub, this.resultStars, this.resultBody]);
    this.resultRoot.add([...this.resultButtons.map((b) => b.rect), ...this.resultButtons.map((b) => b.label)]);
  }

  private showResult(r: MatchResult & { missionName: string; parTime: number }): void {
    this.resultRoot.setVisible(true);
    this.resultTitle.setText(r.victory ? '胜  利' : '战  败');
    this.resultTitle.setColor(r.victory ? toCss(PAL.uiGold) : toCss(0xff6a5a));
    this.resultSub.setText(`${r.missionName} · 用时 ${formatTime(r.seconds)} / 目标 ${formatTime(r.parTime)}`);
    this.resultStars.setText(r.victory ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : '☆☆☆');
    const lines = [
      `完成任务：${r.objectivesDone}　可选完成：${r.optionalDone}　失败：${r.objectivesFailed}`,
      `获得金币：${r.goldEarned}　英雄经验：${r.xpEarned}${r.relic ? `　遗物：${r.relic}` : ''}`,
      r.victory ? '进度已保存到本地存档。' : '提示：多造农庄提高人口，沿路造塔，让英雄带着部队推进。',
    ];
    this.resultBody.setText(lines.join('\n'));
    this.layoutOverlays();
  }

  private showToast(msg: string): void {
    if (!msg) {
      this.toast.setAlpha(0);
      this.toastText = '';
      return;
    }
    this.toastText = msg;
    this.toast.setText(msg).setAlpha(1);
    this.toastTimer = 2.6;
  }

  private showBanner(title: string, sub: string): void {
    this.bannerTitle.setText(title).setAlpha(1).setScale(0.9);
    this.bannerSub.setText(sub).setAlpha(1);
    this.bannerTimer = 2.6;
    this.tweens.add({ targets: this.bannerTitle, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.easeOut' });
  }

  // ────────────────────────── per-frame refresh ──────────────────────────

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.tweens.add({ targets: this.toast, alpha: 0, duration: 400 });
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.tweens.add({ targets: [this.bannerTitle, this.bannerSub], alpha: 0, duration: 500 });
      }
    }
    if (!this.battle) return;
    // 20 Hz is plenty for an RTS HUD and keeps per-frame allocations near zero
    this.refreshAccum += dt;
    if (this.refreshAccum < 0.05) return;
    this.refreshAccum = 0;
    const st = this.battle.getHudState();
    this.refresh(st);
  }

  private refresh(st: HudState): void {
    const s = this.s;
    this.goldText.setText(`${Math.floor(st.gold)}`);
    this.woodText.setText(`${Math.floor(st.wood)}`);
    this.manaText.setText(`${Math.floor(st.mana)}`);
    const popColor = st.popUsed >= st.popMax ? toCss(0xff7a6a) : toCss(PAL.uiText);
    this.popText.setText(`人口 ${st.popUsed}/${st.popMax}`).setColor(popColor);
    this.timerText.setText(formatTime(st.elapsed));
    this.waveText.setText(`下一波进攻：${formatTime(st.wave.nextIn)}　第 ${st.wave.index} 波　FPS ${Math.round(st.fps)}`);

    // hero
    const h = st.hero;
    this.heroName.setText(`${h.name}　Lv.${h.level}`);
    this.heroLevel.setText(`HP ${Math.ceil(h.hp)}/${h.maxHp}`);
    this.heroHp.draw(h.maxHp ? h.hp / h.maxHp : 0);
    this.heroMana.draw(h.maxMana ? h.mana / h.maxMana : 0);
    const xpPrev = this.xpTable[h.level - 1] ?? 0;
    this.heroXp.draw(Math.max(0, Math.min(1, (h.xp - xpPrev) / Math.max(1, h.xpNext - xpPrev))));
    const heroTex = this.battle.currentSelection.hero;
    if (heroTex && this.heroPortrait.texture.key !== `u_${heroTex.heroDef.id}`) {
      this.heroPortrait.setTexture(`u_${heroTex.heroDef.id}`);
      this.heroPortrait.setScale(1.25 * s);
    }
    this.heroRespawn.setText(h.respawn > 1 ? `复活中 ${Math.ceil(h.respawn)}s` : '');

    // abilities
    this.abilityCooldown?.clear();
    for (let i = 0; i < 4; i++) {
      const ab = h.abilities[i];
      const btn = this.abilityButtons[i];
      const icon = this.abilityIcons[i];
      if (!ab) {
        btn.setVisible(false);
        icon.setVisible(false);
        this.abilityCosts[i].setVisible(false);
        continue;
      }
      btn.setVisible(true);
      icon.setVisible(true);
      this.abilityCosts[i].setVisible(true);
      if (icon.texture.key !== `icon_${ab.id}`) icon.setTexture(`icon_${ab.id}`);
      const ready = ab.cooldownLeft <= 0 && !ab.locked && ab.manaOk;
      btn.setEnabled(ready);
      btn.setLabel(ab.key);
      btn.label.setPosition(btn.x - btn.w / 2 + 10 * s, btn.y - btn.h / 2 + 10 * s).setFontSize(12 * s);
      icon.setAlpha(ab.locked ? 0.28 : 1);
      const label = ab.locked ? `${ab.requiredLevel}级解锁` : ab.cooldownLeft > 0 ? `${Math.ceil(ab.cooldownLeft)}s` : `${ab.manaCost} 法力`;
      this.abilityCosts[i].setText(label);
      this.abilityCosts[i].setColor(ab.locked ? toCss(PAL.uiDim) : ab.manaOk ? toCss(PAL.mana) : toCss(0xff7a6a));
      if (ab.cooldownLeft > 0) {
        const r = ab.cooldownLeft / Math.max(0.001, ab.cooldown);
        const g = this.abilityCooldown!;
        g.fillStyle(0x000000, 0.55);
        g.fillRect(btn.x - btn.w / 2, btn.y - btn.h / 2, btn.w, btn.h * Phaser.Math.Clamp(r, 0, 1));
      }
      if (ab.locked) {
        const g = this.abilityCooldown!;
        g.fillStyle(0x000000, 0.5);
        g.fillRect(btn.x - btn.w / 2, btn.y - btn.h / 2, btn.w, btn.h);
      }
    }

    // selection
    const sel = st.selection;
    const units = sel.units;
    this.selectionTitle.setText(sel.building ? sel.building.name : units.length > 0 ? `已选中 ${units.length} 个单位` : '未选中任何单位');
    for (let i = 0; i < this.unitCards.length; i++) {
      const card = this.unitCards[i];
      const u = units[i];
      const show = !!u && !sel.building;
      card.bg.setVisible(show);
      card.label.setVisible(show);
      card.bar.setVisible(show);
      if (show && u) {
        card.label.setText(u.name);
        card.bar.draw(u.hp, 0.6);
      }
    }

    // build buttons (workers selected)
    const showBuild = sel.hasWorker && !sel.building && units.length > 0;
    for (let i = 0; i < this.buildButtons.length; i++) {
      const def = sel.buildable[i];
      const btn = this.buildButtons[i];
      if (!def || !showBuild) {
        btn.setVisible(false);
        continue;
      }
      btn.setVisible(true);
      btn.setDataId(def.id);
      btn.setLabel(`${def.name} ${def.cost}`);
      btn.setEnabled(def.ok);
    }

    // production buttons
    const b = sel.building;
    const produces = b?.produces ?? [];
    for (let i = 0; i < this.produceButtons.length; i++) {
      const btn = this.produceButtons[i];
      const unitId = produces[i];
      if (!unitId || !b) {
        btn.setVisible(false);
        continue;
      }
      const def = getUnit(unitId);
      btn.setVisible(true);
      btn.setDataId(unitId);
      btn.setLabel(`${def.name} ${def.cost.gold ?? 0}金`);
      btn.setEnabled(!b.building);
    }
    for (let i = 0; i < this.queueTexts.length; i++) {
      const q = b?.queue ?? [];
      const item = q[i];
      if (!item) {
        this.queueTexts[i].setVisible(false);
        continue;
      }
      const def = getUnit(item.unitId);
      this.queueTexts[i].setVisible(!b?.building);
      this.queueTexts[i].setText(`队列 ${i + 1}. ${def.name} ${Math.round(item.progress * 100)}%`);
    }

    // objectives
    const sig = st.objectives.map((o) => `${o.state}${Math.round(o.progress)}`).join(',');
    if (sig !== this.lastObjectiveSignature) {
      this.lastObjectiveSignature = sig;
      for (let i = 0; i < this.objectiveTexts.length; i++) {
        const o = st.objectives[i];
        const t = this.objectiveTexts[i];
        if (!o) {
          t.setText('');
          continue;
        }
        const mark = o.state === 'done' ? '✔' : o.state === 'failed' ? '✘' : o.state === 'active' ? '▶' : '·';
        const prog = o.total > 1 ? ` (${Math.floor(o.progress)}/${o.total})` : '';
        t.setText(`${mark} ${o.text}${prog}`);
        t.setColor(o.state === 'done' ? toCss(0x7dff9b) : o.state === 'failed' ? toCss(0xff7a6a) : o.optional ? toCss(0x9fb4dd) : toCss(PAL.uiText));
      }
    }

    // minimap
    const mmBounds = this.minimapImage.getBounds();
    const g = this.minimapG;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRect(mmBounds.x, mmBounds.y, mmBounds.width, mmBounds.height);
    for (const bb of st.minimap.buildings) {
      g.fillStyle(bb.team === 1 ? 0x7fd8ff : bb.team === 2 ? 0xff6a5a : 0xd9c9a0, 1);
      g.fillRect(mmBounds.x + bb.x * mmBounds.width - 2, mmBounds.y + bb.y * mmBounds.height - 2, 5, 5);
    }
    for (const u of st.minimap.units) {
      if (u.hero) {
        g.fillStyle(0xffffff, 1);
        g.fillRect(mmBounds.x + u.x * mmBounds.width - 2.5, mmBounds.y + u.y * mmBounds.height - 2.5, 6, 6);
      } else {
        g.fillStyle(u.team === 1 ? 0x8fffb0 : u.team === 2 ? 0xff8a6a : 0xd9c9a0, 1);
        g.fillRect(mmBounds.x + u.x * mmBounds.width - 1, mmBounds.y + u.y * mmBounds.height - 1, 3, 3);
      }
    }
    const cam = this.battle.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const mapW = this.battle.world.map.w * 40;
    const mapH = this.battle.world.map.h * 40;
    g.lineStyle(1.5, 0xffffff, 0.75);
    g.strokeRect(
      mmBounds.x + ((cam.scrollX + viewW / 2) / mapW) * mmBounds.width - ((viewW / mapW) * mmBounds.width) / 2,
      mmBounds.y + ((cam.scrollY + viewH / 2) / mapH) * mmBounds.height - ((viewH / mapH) * mmBounds.height) / 2,
      (viewW / mapW) * mmBounds.width,
      (viewH / mapH) * mmBounds.height,
    );

    // volume labels
    this.musicLabel.setText(`音乐音量 ${Math.round(save.current.settings.music * 100)}%`);
    this.sfxLabel.setText(`音效音量 ${Math.round(save.current.settings.sfx * 100)}%`);
    this.muteLabel.setText(`总开关：${save.current.settings.muted ? '已静音' : '开启'}`);
  }

  private xpTable = [0, 120, 300, 560, 900, 1320, 1840, 2480, 3240, 4120];
}

/**
 * Convenience for buttons that need to carry an id.
 */
