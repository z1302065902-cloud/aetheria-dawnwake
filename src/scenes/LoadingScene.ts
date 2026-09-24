import Phaser from 'phaser';
import { ensureTextures, texturePhases } from '../art/SpriteFactory';
import { audio } from '../audio/AudioBus';
import { save } from '../core/SaveManager';
import { UI, FACTION, REGION, toCss, shade } from '../art/VisualBible';
import { drawPanel } from '../ui/UiKit';
import { MISSIONS } from '../data/missions';

/**
 * Loading screen (Art Direction §28).
 *
 * Not "Loading…": a fantasy plate with the world's lore, the mission being prepared, a real
 * progress bar driven by the actual texture-generation phases, and drifting motes so the frame
 * is alive. Everything is drawn in-engine — there is no HTML spinner anywhere in this build.
 */
export class LoadingScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private lore!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private motes: Phaser.GameObjects.Image[] = [];
  private t = 0;
  private phase = 0;
  private phases = texturePhases();
  private total = 0;
  private done = 0;
  private nextMission = 'm01';

  constructor() {
    super('Loading');
  }

  init(data: { missionId?: string }): void {
    this.nextMission = data?.missionId ?? 'm01';
    this.phase = 0;
    this.done = 0;
    this.t = 0;
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.total = this.phases.length + 6; // phases + the remaining texture groups

    // backdrop: the region palette of the mission being prepared, so the load screen already
    // tells you where you are going. Composition: dark sky, a lit horizon, hazy ridges, and a
    // glow behind the title so the plate reads as artwork rather than as an empty screen.
    const mission = MISSIONS.find((m) => m.id === this.nextMission);
    const region = REGION[(mission?.map.biome ?? 'valley') as keyof typeof REGION] ?? REGION.valley;
    const sky = this.add.graphics();
    sky.fillGradientStyle(shade(region.ground, -0.5), shade(region.ground, -0.5), shade(region.ground, -0.16), shade(region.ground, -0.3), 1);
    sky.fillRect(0, 0, W, H);
    // horizon glow — the light source of the whole plate
    const glow = this.add.graphics();
    for (let i = 5; i >= 1; i--) {
      glow.fillStyle(region.accent, 0.045 * i);
      glow.fillEllipse(W / 2, H * 0.46, W * (0.35 + i * 0.16), H * (0.1 + i * 0.05));
    }
    // hazy ridges: far ones lighter (atmospheric perspective), near ones darker
    for (let i = 0; i < 4; i++) {
      const g = this.add.graphics();
      const t = i / 3;
      g.fillStyle(shade(region.ground, -0.3 + t * 0.02), 0.92);
      g.beginPath();
      g.moveTo(0, H);
      const base = H * (0.5 + i * 0.055);
      for (let x = 0; x <= W; x += 36) {
        g.lineTo(x, base - Math.sin((x / W) * Math.PI * (2 + i)) * (38 - i * 7) - (i % 2) * 16);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fillPath();
    }
    // drifting motes
    for (let i = 0; i < 60; i++) {
      const big = i % 7 === 0;
      this.motes.push(
        this.add
          .image(Math.random() * W, Math.random() * H, 'fx_glow_warm')
          .setDisplaySize(big ? 14 : 4, big ? 14 : 4)
          .setAlpha(big ? 0.16 : 0.4)
          .setTint(region.accent)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    }

    // title plate
    const pw = Math.min(720, W * 0.7);
    const ph = 200;
    const px = (W - pw) / 2;
    const py = H * 0.26;
    const g = this.add.graphics();
    drawPanel(g, px, py, pw, ph, { header: true, alpha: 0.86 });
    this.add
      .text(W / 2, py + 34, 'AETHERIA', { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '40px', color: toCss(FACTION.dawn.signal), fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    this.add
      .text(W / 2, py + 80, '破  晓  之  誓', { fontFamily: '"Trebuchet MS", sans-serif', fontSize: '17px', color: toCss(UI.text.dim) })
      .setOrigin(0.5, 0)
      .setLetterSpacing(8);

    // progress bar
    const bw = pw - 80;
    const bx = px + 40;
    const by = py + ph - 46;
    this.add.rectangle(bx, by, bw, 12, UI.bar.back).setOrigin(0, 0.5).setStrokeStyle(1, UI.border, 0.9);
    this.bar = this.add.graphics();
    this.lore = this.add
      .text(W / 2, by + 26, '正在唤醒战场…', { fontFamily: '"Trebuchet MS", sans-serif', fontSize: '13px', color: toCss(UI.text.primary) })
      .setOrigin(0.5, 0);
    this.hint = this.add
      .text(
        W / 2,
        H * 0.84,
        '那个黄昏，苍穹裂开了。\n你带着残存的骑士团退回绿谷——而荒野深处的氏族正在集结。',
        { fontFamily: '"Trebuchet MS", sans-serif', fontSize: '14px', color: toCss(UI.text.dim), align: 'center', lineSpacing: 8 },
      )
      .setOrigin(0.5, 0);

    this.drawProgress(bx, by, bw, 0);

    audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);
    const unlock = () => {
      audio.init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  private drawProgress(bx: number, by: number, bw: number, ratio: number): void {
    this.bar.clear();
    const w = Math.max(2, bw * Math.min(1, ratio));
    this.bar.fillStyle(UI.bar.xp, 1);
    this.bar.fillRect(bx, by - 6, w, 12);
    // a bright leading edge so the bar reads as "energy", not as a trimmed rectangle
    this.bar.fillStyle(FACTION.dawn.signal, 1);
    this.bar.fillRect(bx + w - 3, by - 6, 3, 12);
  }

  update(_time: number, delta: number): void {
    this.t += delta / 1000;
    const W = this.scale.width;
    const H = this.scale.height;
    for (const m of this.motes) {
      m.y -= 12 * delta * 0.001;
      m.x += Math.sin(this.t * 0.6 + m.y * 0.02) * 0.3;
      if (m.y < -10) {
        m.y = H + 10;
        m.x = Math.random() * W;
      }
    }

    // one generation phase per frame: the bar reflects real work, and the UI keeps drawing
    if (this.phase < this.phases.length) {
      const ph = this.phases[this.phase];
      this.lore.setText(ph.label);
      ph.run(this);
      this.phase++;
      this.done++;
      this.drawProgress((W - Math.min(720, W * 0.7)) / 2 + 40, H * 0.3 + 200 - 46, Math.min(720, W * 0.7) - 80, this.done / this.total);
      return;
    }
    // remaining groups (fx, decor, terrain helpers) — a single pass, then hand over
    if (!this.finished) {
      this.finished = true;
      this.lore.setText('点亮火把，集合部队…');
      ensureTextures(this);
      this.done = this.total;
      this.drawProgress((W - Math.min(720, W * 0.7)) / 2 + 40, H * 0.3 + 200 - 46, Math.min(720, W * 0.7) - 80, 1);
      this.time.delayedCall(420, () => {
        this.cameras.main.fadeOut(320, 0, 0, 0);
        this.time.delayedCall(340, () => this.scene.start('Menu'));
      });
    }
  }

  private finished = false;
}
