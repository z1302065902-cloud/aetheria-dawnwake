import type { World } from '../world/World';
import type { FxSystem } from '../fx/FxSystem';
import type { Pathfinder } from './Pathfinder';
import type { Unit } from '../world/Unit';
import type { Building } from '../world/Building';
import type { Projectile } from '../world/Projectile';
import type { MissionSystem } from './Mission';

/** Everything a system needs from the battle scene, without importing the scene class. */
export interface GameCtx {
  /** objective tracking — systems report progress straight to it (single source of truth) */
  missions: MissionSystem;
  world: World;
  fx: FxSystem;
  path: Pathfinder;
  /** Seconds since the match started. */
  now: number;
  projectiles: ProjectilePoolApi;
  // NOTE: dead optional hooks were removed here (onUnitKilled / onBuildingKilled /
  // onResourceGathered were declared but never called anywhere) — a hook that looks wired but
  // never fires is worse than no hook. Keep this list to things that are actually invoked.
  onUnitProduced?(unit: Unit): void;
  onResourceDeposited?(kind: 'gold' | 'wood' | 'mana', amount: number): void;
}

export interface ProjectilePoolApi {
  fire(config: {
    x: number;
    y: number;
    target: Unit | Building | null;
    tx: number;
    ty: number;
    speed: number;
    damage: number;
    damageType: 'physical' | 'magic' | 'siege';
    splash: number;
    texture: string;
    team: number;
    ownerId: number;
    arc?: number;
  }): void;
}
