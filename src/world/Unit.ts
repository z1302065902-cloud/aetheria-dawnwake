import type Phaser from 'phaser';
import { Entity } from './Entity';
import type { UnitDef } from '../data/types';

export type UnitState =
  | 'idle'
  | 'move'
  | 'attackMove'
  | 'attack'
  | 'gatherGo'
  | 'gather'
  | 'returnGo'
  | 'buildGo'
  | 'build'
  | 'dead';

export interface PathPoint {
  x: number;
  y: number;
}

export interface Buff {
  id: string;
  until: number;
  attackMul?: number;
  speedMul?: number;
  armorAdd?: number;
  rangeMul?: number;
  critAdd?: number;
}

/** One queued command (Shift-click appends to this queue). */
export interface QueuedCommand {
  type: 'move' | 'attack' | 'attackMove' | 'gather' | 'build' | 'hold' | 'stop';
  x?: number;
  y?: number;
  targetId?: number;
  resource?: 'gold' | 'wood' | 'mana';
}

export class Unit extends Entity {
  def: UnitDef;
  state: UnitState = 'idle';
  prevState: UnitState = 'idle';

  path: PathPoint[] = [];
  pathIndex = 0;
  goalX = 0;
  goalY = 0;
  /** Last destination we computed a chase path for (re-path throttle). */
  chaseGoalX = -1;
  chaseGoalY = -1;
  repathAt = 0;
  speed = 0;

  targetId = -1;
  /** Set when the unit was ordered to attack (must not be dropped while chasing). */
  forcedTarget = false;

  cooldown = 0;
  /** Attack animation timer. */
  swing = 0;
  facing = 1;

  // worker-specific
  carrying: { kind: 'gold' | 'wood' | 'mana'; amount: number } | null = null;
  /** Remembers what the worker was doing so construction duty can be temporary. */
  lastGatherKind: 'gold' | 'wood' | 'mana' | null = null;
  gatherTimer = 0;
  resourceId = -1;
  buildId = -1;

  // enemy AI
  aiState: 'idle' | 'patrol' | 'chase' | 'attack' | 'retreat' | 'defend' = 'idle';
  homeX = 0;
  homeY = 0;
  patrolPoint: { x: number; y: number } | null = null;
  aiThink = 0;

  buffs: Buff[] = [];
  queue: QueuedCommand[] = [];
  /** frames without progress, used by the movement system's stuck detection */
  stuckTimer = 0;
  /** per-frame separation accumulator (mass-weighted push-back) */
  pushX = 0;
  pushY = 0;

  /** Hero-ish stats (0 for regular units). */
  isHero = false;

  constructor(x: number, y: number, def: UnitDef) {
    super('unit', def.faction as any, x, y, def.hp, def.radius);
    this.def = def;
    this.armor = def.armor;
    this.speed = def.moveSpeed;
  }

  get moveSpeed(): number {
    let mul = 1;
    for (const b of this.buffs) mul *= b.speedMul ?? 1;
    return this.speed * mul;
  }

  get attackMul(): number {
    let mul = 1;
    for (const b of this.buffs) mul *= b.attackMul ?? 1;
    return mul;
  }

  get armorTotal(): number {
    let add = 0;
    for (const b of this.buffs) add += b.armorAdd ?? 0;
    return this.armor + add;
  }

  get rangeTotal(): number {
    let mul = 1;
    for (const b of this.buffs) mul *= b.rangeMul ?? 1;
    return this.def.attackRange * mul;
  }

  addBuff(buff: Buff): void {
    const idx = this.buffs.findIndex((b) => b.id === buff.id);
    if (idx >= 0) this.buffs[idx] = buff;
    else this.buffs.push(buff);
  }

  tickBuffs(now: number): void {
    if (this.buffs.length === 0) return;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      if (this.buffs[i].until <= now) this.buffs.splice(i, 1);
    }
  }

  hasBuff(id: string, now: number): boolean {
    return this.buffs.some((b) => b.id === id && b.until > now);
  }

  faceTowards(x: number, y: number): void {
    this.facing = x >= this.x ? 1 : -1;
  }

  clearOrders(): void {
    this.path.length = 0;
    this.pathIndex = 0;
    this.targetId = -1;
    this.forcedTarget = false;
    this.resourceId = -1;
    this.buildId = -1;
    this.aiState = 'idle';
  }

  setState(s: UnitState): void {
    if (this.state !== s) {
      this.prevState = this.state;
      this.state = s;
    }
  }

  queuedStep(): QueuedCommand | null {
    return this.queue.length > 0 ? this.queue.shift()! : null;
  }

  updateSprite(dt: number): void {
    const spr = this.sprite as Phaser.GameObjects.Image | null;
    if (!spr) return;
    spr.setPosition(this.x, this.y);
    spr.setDepth(100 + this.y * 0.01);
    spr.setFlipX(this.facing < 0);
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt);
      const t = this.swing;
      spr.setRotation(Math.sin(t * 22) * 0.22 * (this.facing < 0 ? -1 : 1));
    } else if (spr.rotation !== 0) {
      spr.setRotation(0);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      spr.setTintFill(0xffffff);
      if (this.flash === 0) spr.clearTint();
    }
  }
}
