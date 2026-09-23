import type Phaser from 'phaser';
import { Entity } from './Entity';
import type { BuildingDef } from '../data/types';

export interface ProductionItem {
  unitId: string;
  timeLeft: number;
  total: number;
}

export class Building extends Entity {
  def: BuildingDef;
  /** 0..1 while under construction, 1 when operational. */
  construction = 1;
  building = false;
  production: ProductionItem[] = [];
  cooldown = 0;
  rallyX = 0;
  rallyY = 0;
  /** Grid footprint occupied in the movement grid. */
  blocked: Array<{ tx: number; ty: number }> = [];
  damageFlash = 0;
  smoke = 0;
  /** True for the neutral shrine once a player unit stands on it. */
  captured = false;
  captureTeam = 0;
  captureProgress = 0;

  constructor(x: number, y: number, def: BuildingDef, faction?: string) {
    super('building', (faction ?? def.faction) as any, x, y, def.hp, Math.max(def.footprint.w, def.footprint.h) * 16);
    this.def = def;
    this.armor = def.armor;
    this.rallyX = x + 60;
    this.rallyY = y + 40;
  }

  get operational(): boolean {
    return !this.building;
  }

  queueUnit(unitId: string, buildTime: number): void {
    this.production.push({ unitId, timeLeft: buildTime, total: buildTime });
  }

  get progress(): number {
    if (this.building) return this.construction;
    if (this.production.length === 0) return 1;
    const head = this.production[0];
    return 1 - head.timeLeft / head.total;
  }

  updateSprite(dt: number): void {
    const spr = this.sprite;
    if (!spr) return;
    spr.setPosition(this.x, this.y);
    spr.setDepth(100 + this.y * 0.01);
    if (this.building) {
      spr.setAlpha(0.55 + 0.3 * this.construction);
    } else if (spr.alpha !== 1) {
      spr.setAlpha(1);
    }
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt);
      spr.setTintFill(0xffffff);
      if (this.damageFlash === 0) spr.clearTint();
    }
    if (this.def.faction === 'dawn' && this.captured) {
      spr.setTint(0x9fffd0);
    }
  }
}
