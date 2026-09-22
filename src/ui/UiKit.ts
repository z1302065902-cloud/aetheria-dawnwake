import Phaser from 'phaser';
import { PAL, toCss } from '../art/Palette';

const FONT = 'Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif';

export interface PanelOptions {
  fill?: number;
  alpha?: number;
  border?: number;
  borderAlpha?: number;
  radius?: number;
  header?: boolean;
}

/** Dark fantasy-ish UI panel used by every screen. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, opt: PanelOptions = {}): void {
  const fill = opt.fill ?? PAL.uiPanel;
  const alpha = opt.alpha ?? 0.92;
  const border = opt.border ?? PAL.uiBorder;
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, opt.radius ?? 6);
  g.lineStyle(1.5, border, opt.borderAlpha ?? 0.85);
  g.strokeRoundedRect(x, y, w, h, opt.radius ?? 6);
  if (opt.header) {
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(x + 1, y + 1, w - 2, 22, { tl: 6, tr: 6, bl: 0, br: 0 });
    g.lineStyle(1, border, 0.5);
    g.lineBetween(x + 1, y + 23, x + w - 1, y + 23);
  }
}

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size = 14,
  color: string = toCss(PAL.uiText),
  opts: { bold?: boolean; origin?: [number, number]; shadow?: boolean } = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, content, {
    fontFamily: FONT,
    fontSize: `${Math.round(size)}px`,
    color,
    fontStyle: opts.bold ? 'bold' : 'normal',
  });
  const o = opts.origin ?? [0, 0.5];
  t.setOrigin(o[0], o[1]);
  if (opts.shadow !== false) t.setShadow(0, 1, 'rgba(0,0,0,0.75)', 2);
  return t;
}

export interface ButtonStyle {
  fill?: number;
  fillHover?: number;
  border?: number;
  textColor?: string;
  fontSize?: number;
  radius?: number;
}

/**
 * Flat UI button: rectangle + label + hover/disabled states.
 * Kept as a plain class (not a Container) so hit areas stay exact at any HUD scale.
 */
export class Button {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  enabled = true;
  visible = true;
  onClick: () => void;
  private dataId: string | null = null;
  private style: Required<ButtonStyle>;

  constructor(
    private scene: Phaser.Scene,
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    label: string,
    onClick: () => void,
    style: ButtonStyle = {},
  ) {
    this.style = {
      fill: style.fill ?? PAL.uiPanelLight,
      fillHover: style.fillHover ?? 0x35486f,
      border: style.border ?? PAL.uiBorder,
      textColor: style.textColor ?? toCss(PAL.uiText),
      fontSize: style.fontSize ?? 14,
      radius: style.radius ?? 5,
    };
    this.onClick = onClick;
    this.rect = scene.add
      .rectangle(x, y, w, h, this.style.fill, 0.95)
      .setStrokeStyle(1.5, this.style.border, 0.9)
      .setInteractive({ useHandCursor: true });
    this.label = text(scene, x, y, label, this.style.fontSize, this.style.textColor, { origin: [0.5, 0.5], bold: true });
    this.rect.on('pointerover', () => this.enabled && this.rect.setFillStyle(this.style.fillHover, 1));
    this.rect.on('pointerout', () => this.rect.setFillStyle(this.style.fill, 0.95));
    this.rect.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      p.event?.stopPropagation?.();
      this.onClick();
    });
  }

  setLabel(s: string): this {
    this.label.setText(s);
    return this;
  }

  /** Buttons that represent a data row (build / produce) carry their id here. */
  setDataId(id: string | null): this {
    this.dataId = id;
    return this;
  }

  getDataId(): string | null {
    return this.dataId;
  }

  setSubColor(color: string): this {
    this.label.setColor(color);
    return this;
  }

  setEnabled(v: boolean): this {
    this.enabled = v;
    this.rect.setAlpha(v ? 1 : 0.45);
    this.label.setAlpha(v ? 1 : 0.5);
    return this;
  }

  setVisible(v: boolean): this {
    this.visible = v;
    this.rect.setVisible(v);
    this.label.setVisible(v);
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.rect.setPosition(x, y);
    this.label.setPosition(x, y);
    return this;
  }

  setSize(w: number, h: number): this {
    this.w = w;
    this.h = h;
    this.rect.setSize(w, h);
    return this;
  }

  setDepth(d: number): this {
    this.rect.setDepth(d);
    this.label.setDepth(d + 1);
    return this;
  }

  destroy(): void {
    this.rect.destroy();
    this.label.destroy();
  }

  static get font(): string {
    return FONT;
  }
}

/** Horizontal progress bar (hp / mana / xp / build). */
export class Bar {
  private g: Phaser.GameObjects.Graphics;
  constructor(
    scene: Phaser.Scene,
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    private color: number,
  ) {
    this.g = scene.add.graphics();
  }

  setDepth(d: number): this {
    this.g.setDepth(d);
    return this;
  }

  setColor(c: number): this {
    this.color = c;
    return this;
  }

  draw(ratio: number, bgAlpha = 0.65, label?: string): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, bgAlpha);
    g.fillRect(this.x - 1, this.y - 1, this.w + 2, this.h + 2);
    g.fillStyle(0x1b2440, 0.95);
    g.fillRect(this.x, this.y, this.w, this.h);
    g.fillStyle(this.color, 1);
    g.fillRect(this.x, this.y, Math.max(0, Math.min(1, ratio)) * this.w, this.h);
    g.lineStyle(1, 0x000000, 0.55);
    g.strokeRect(this.x - 1, this.y - 1, this.w + 2, this.h + 2);
    void label;
  }

  clear(): void {
    this.g.clear();
  }

  setVisible(v: boolean): this {
    this.g.setVisible(v);
    return this;
  }

  destroy(): void {
    this.g.destroy();
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
