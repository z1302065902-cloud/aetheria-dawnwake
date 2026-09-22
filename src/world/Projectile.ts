import type Phaser from 'phaser';
import type { DamageType } from '../data/types';

/** Pooled projectile. Not an Entity: it never needs HP, selection or AI. */
export class Projectile {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  speed = 0;
  damage = 0;
  damageType: DamageType = 'physical';
  splash = 0;
  team = 0;
  ownerId = -1;
  targetId = -1;
  targetX = 0;
  targetY = 0;
  life = 3;
  arc = 0;
  startX = 0;
  startY = 0;
  active = false;
  texture = 'p_arrow';
  sprite: Phaser.GameObjects.Image | null = null;
  /** Straight-line melee-to-ranged specials (hero abilities) reuse this too. */
  trail = true;
}

export class Corpse {
  x = 0;
  y = 0;
  life = 0;
  texture = '';
  sprite: Phaser.GameObjects.Image | null = null;
  rotation = 0;
  scale = 1;
}

export class FloatingText {
  x = 0;
  y = 0;
  life = 0;
  maxLife = 1;
  vy = -34;
  text = '';
  color = '#ffffff';
  label: Phaser.GameObjects.Text | null = null;
  size = 15;
  active = false;
}
