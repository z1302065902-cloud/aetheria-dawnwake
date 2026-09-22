import type { World } from '../world/World';
import type { FxSystem } from '../fx/FxSystem';
import type { Pathfinder } from './Pathfinder';
import type { Unit } from '../world/Unit';
import type { Building } from '../world/Building';
import type { Projectile } from '../world/Projectile';

/** Everything a system needs from the battle scene, without importing the scene class. */
export interface GameCtx {
  world: World;
  fx: FxSystem;
  path: Pathfinder;
  /** Seconds since the match started. */
  now: number;
  projectiles: ProjectilePoolApi;
  onUnitKilled?(unit: Unit, killerTeam: number): void;
  onBuildingKilled?(b: Building, killerTeam: number): void;
  onResourceGathered?(kind: 'gold' | 'wood' | 'mana', amount: number): void;
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
