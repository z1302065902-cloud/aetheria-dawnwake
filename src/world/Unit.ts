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
  /**
   * Mission object that must be rescued: while captive it cannot be targeted or damaged by
   * anyone, so a stray arrow or an AoE cannot silently fail a main objective.
   */
  captive = false;
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

  /** current animation state (idle / walk / attack / death) */
  animState: 'idle' | 'walk' | 'attack' | 'death' | null = null;
  /** visual-only knockback from being hit: offset + timer */
  recoilX = 0;
  recoilY = 0;
  recoilT = 0;

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

  /** Switches the sprite animation, ignoring repeats. */
  playAnim(state: 'idle' | 'walk' | 'attack' | 'death', restart = false): void {
    if (!this.sprite) return;
    if (this.animState === state && !restart) return;
    this.animState = state;
    const key = `u_${this.def.id}_${state}`;
    const anims = this.sprite.scene?.anims;
    if (anims && anims.exists(key)) {
      this.sprite.play(key, restart);
    }
  }

  /** Visual recoil away from an impact (does NOT move the logical position). */
  applyRecoil(fromX: number, fromY: number, strength = 4): void {
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.recoilX = (dx / d) * strength;
    this.recoilY = (dy / d) * strength * 0.6;
    this.recoilT = 0.18;
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
    const spr = this.sprite;
    if (!spr) return;

    // ── hit recoil: visual only, decays fast (0.18s) ──
    let recoil = 0;
    if (this.recoilT > 0) {
      this.recoilT = Math.max(0, this.recoilT - dt);
      recoil = this.recoilT / 0.18;
    }
    spr.setPosition(this.x + this.recoilX * recoil, this.y + this.recoilY * recoil);
    spr.setDepth(100 + this.y * 0.01);
    spr.setFlipX(this.facing < 0);
    spr.setRotation(recoil * 0.16 * (this.facing < 0 ? -1 : 1));

    // ── animation state machine ──
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt);
    if (this.dead) this.playAnim('death');
    else if (this.swing > 0) this.playAnim('attack');
    else if (this.path.length > 0) this.playAnim('walk');
    else this.playAnim('idle');

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      spr.setTintFill(0xffffff);
      if (this.flash === 0) spr.clearTint();
    }
  }
}
