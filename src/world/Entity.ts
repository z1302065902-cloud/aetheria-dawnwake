import type Phaser from 'phaser';
import type { FactionId } from '../config/Constants';
import { TEAM_OF } from '../config/Constants';

export type EntityKind = 'unit' | 'building' | 'resource' | 'corpse';

export interface MoveOrder {
  x: number;
  y: number;
  attackMove: boolean;
}

let nextId = 1;

export abstract class Entity {
  readonly id: number = nextId++;
  readonly kind: EntityKind;
  faction: FactionId;
  team: number;

  x: number;
  y: number;
  radius: number;

  hp: number;
  maxHp: number;
  armor = 0;

  dead = false;
  selected = false;
  sprite: Phaser.GameObjects.Image | null = null;

  /** Visual hit flash timer (seconds). */
  flash = 0;
  /** Last time this entity dealt / received damage, used by the AI to disengage. */
  lastCombatAt = 0;

  constructor(kind: EntityKind, faction: FactionId, x: number, y: number, hp: number, radius: number) {
    this.kind = kind;
    this.faction = faction;
    this.team = TEAM_OF[faction] ?? 3;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = hp;
    this.radius = radius;
  }

  get hpRatio(): number {
    return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
  }

  /** Syncs the sprite transform from the logical position. */
  syncSprite(): void {
    if (!this.sprite) return;
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(100 + this.y * 0.01);
  }

  abstract updateSprite(dt: number): void;

  destroySprite(): void {
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
