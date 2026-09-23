import type { Unit } from '../world/Unit';
import type { Building } from '../world/Building';
import type { GameCtx } from './GameCtx';
import type { MissionDef, ObjectiveDef } from '../data/types';
import { HERO_XP_TABLE } from '../data/heroes';
import { audio } from '../audio/AudioBus';

export type ObjectiveState = 'pending' | 'active' | 'done' | 'failed';

export interface ObjectiveView {
  def: ObjectiveDef;
  state: ObjectiveState;
  progress: number;
  total: number;
  /** hidden objectives are not listed in the HUD until revealed */
  hidden: boolean;
}

export interface MatchResult {
  victory: boolean;
  seconds: number;
  stars: number;
  goldEarned: number;
  xpEarned: number;
  relic?: string;
  item?: string;
  objectivesDone: number;
  objectivesFailed: number;
  optionalDone: number;
  /** item names dropped by this match (filled in by the battle scene) */
  loot: string[];
}

/**
 * Mission logic: sequential objectives, counters fed by the battle scene events,
 * win/lose resolution and end-of-match scoring (stars + rewards).
 */
export class MissionSystem {
  mission: MissionDef;
  objectives: ObjectiveView[] = [];
  victory = false;
  defeat = false;
  ended = false;

  // counters
  goldDeposited = 0;
  producedCombatUnits = 0;
  unitsKilledByPlayer = 0;
  buildingsDestroyed = new Map<string, number>();
  shrineCaptured = false;
  heroDied = false;

  onObjectiveDone: ((o: ObjectiveView) => void) | null = null;
  onObjectiveStart: ((o: ObjectiveView) => void) | null = null;
  onObjectiveRevealed: ((o: ObjectiveView) => void) | null = null;
  onEnd: ((result: MatchResult) => void) | null = null;

  private cacheTimer = 0;

  constructor(
    private ctx: GameCtx,
    mission: MissionDef,
  ) {
    this.mission = mission;
    this.objectives = mission.objectives.map((def, i) => ({
      def,
      state: i === 0 || def.optional ? 'active' : 'pending',
      progress: 0,
      total: this.totalOf(def),
      hidden: !!def.hidden,
    }));
  }

  private totalOf(def: ObjectiveDef): number {
    switch (def.kind) {
      case 'gather':
        return def.target?.total ?? 100;
      case 'produce':
        return def.target?.count ?? 1;
      case 'destroy':
        return def.target?.count ?? 1;
      case 'defend':
        return def.target?.count ?? 1;
      case 'escort':
        return def.target?.count ?? 1;
      case 'rescue':
        return def.target?.count ?? 1;
      case 'collect':
        return def.target?.count ?? 1;
      case 'survive':
        return def.target?.total ?? 1;
      default:
        return 1;
    }
  }

  get mainObjectives(): ObjectiveView[] {
    return this.objectives.filter((o) => !o.def.optional);
  }

  get activeObjective(): ObjectiveView | null {
    return this.mainObjectives.find((o) => o.state === 'active') ?? null;
  }

  update(dt: number): void {
    if (this.ended) return;
    this.cacheTimer += dt;
    if (this.cacheTimer < 0.25) return;
    this.cacheTimer = 0;

    for (const o of this.objectives) {
      if (o.state !== 'active' || o.hidden) continue;
      this.checkObjective(o);
    }

    // hidden objectives become visible when their reveal condition is met
    for (const o of this.objectives) {
      if (!o.hidden) continue;
      const ready = !o.def.revealAfter || this.objectives.find((x) => x.def.id === o.def.revealAfter)?.state === 'done';
      if (ready) {
        o.hidden = false;
        this.onObjectiveRevealed?.(o);
      }
    }

    // sequential main objectives: when the active one completes, start the next
    const main = this.mainObjectives;
    for (let i = 0; i < main.length; i++) {
      if (main[i].state === 'done' && i + 1 < main.length && main[i + 1].state === 'pending') {
        main[i + 1].state = 'active';
        this.onObjectiveStart?.(main[i + 1]);
      }
    }

    if (main.length > 0 && main.every((o) => o.state === 'done')) this.finish(true);
  }

  private checkObjective(o: ObjectiveView): void {
    const { world } = this.ctx;
    switch (o.def.kind) {
      case 'gather':
        o.progress = Math.min(o.total, this.goldDeposited);
        break;
      case 'produce':
        o.progress = Math.min(o.total, this.producedCombatUnits);
        break;
      case 'destroy': {
        if (o.def.target?.buildingId) {
          o.progress = Math.min(o.total, this.buildingsDestroyed.get(o.def.target.buildingId) ?? 0);
        } else {
          o.progress = Math.min(o.total, this.unitsKilledByPlayer);
        }
        break;
      }
      case 'collect': {
        if (o.def.target?.tag === 'neutral_shrine') {
          const count = world.buildings.filter((b) => !b.dead && b.captured && b.def.id === 'neutral_shrine').length;
          o.progress = Math.min(o.total, count);
          if (count > 0) this.shrineCaptured = true;
        } else {
          o.progress = o.total;
        }
        break;
      }
      case 'build': {
        const id = o.def.target?.buildingId;
        const has = world.buildings.some((b) => !b.dead && b.team === 1 && b.def.id === id && !b.building);
        o.progress = has ? 1 : 0;
        break;
      }
      case 'boss': {
        const id = o.def.target?.unitId;
        const alive = world.units.some((u) => !u.dead && u.def.id === id);
        const everSpawned = this.bossSpawned;
        o.progress = everSpawned && !alive ? 1 : 0;
        break;
      }
      case 'survive': {
        if (o.def.optional) {
          // "the commander never died" can only be judged at the end of the match
          if (this.heroDied) {
            o.state = 'failed';
            return;
          }
        } else {
          o.progress = Math.min(o.total, Math.floor(world.elapsed));
        }
        break;
      }
      case 'defend': {
        const id = o.def.target?.buildingId;
        if (id) {
          const target = world.buildings.find((b) => b.team === 1 && b.def.id === id);
          const ok = !!target && !target.dead;
          o.progress = ok ? o.total : 0;
          if (!ok && id === 'castle') {
            this.finish(false);
            return;
          }
        } else if (o.def.target?.unitId) {
          // "this unit must survive"
          const alive = world.units.some((u) => !u.dead && u.def.id === o.def.target?.unitId);
          o.progress = alive ? o.total : 0;
        } else {
          // survive N attack waves
          o.progress = Math.min(o.total, this.wavesSurvived);
        }
        break;
      }
      case 'escort': {
        const escort = world.units.find((u) => !u.dead && u.def.id === 'caravan');
        if (!escort) {
          o.state = 'failed';
          return;
        }
        const goal = world.map.landings[world.map.landings.length - 1] ?? world.map.playerStart;
        const d = Math.hypot(escort.x - goal.x, escort.y - goal.y);
        o.progress = d < 160 ? o.total : 0;
        break;
      }
      case 'rescue': {
        const prisoner = world.units.find((u) => !u.dead && u.def.id === 'prisoner');
        if (!prisoner) {
          // only a real loss fails the objective; a target that never existed (spawn failure)
          // leaves it open instead of hard-failing the mission
          if (this.rescueTargetSpawned) o.state = 'failed';
          return;
        }
        const hero = world.hero;
        // freed once the hero reaches the prisoner, then it must reach the castle
        if (!this.prisonerFreed && hero && !hero.dead && Math.hypot(hero.x - prisoner.x, hero.y - prisoner.y) < 90) {
          this.prisonerFreed = true;
          prisoner.captive = false; // now a real unit: it can be hurt on the way home
          prisoner.faction = 'dawn' as never;
          prisoner.team = 1;
          prisoner.aiState = 'idle';
        }
        if (this.prisonerFreed) {
          const castle = world.buildings.find((b) => !b.dead && b.team === 1 && b.def.id === 'castle');
          const home = castle ?? world.map.playerStart;
          o.progress = Math.hypot(prisoner.x - home.x, prisoner.y - home.y) < 190 ? o.total : 0;
        }
        break;
      }
      case 'explore': {
        // with fog of war, "explore" means: get the search point into your vision
        const point = world.map.searchPoints[0];
        if (!point) {
          o.progress = o.total;
          break;
        }
        const vision = world.vision;
        // "find X" is satisfied by discovery: walking past it counts, you do not have to keep
        // a unit parked on it (which was impossible to satisfy after moving on)
        o.progress = !vision || vision.isExploredWorld(point.x, point.y) ? 1 : 0;
        break;
      }

      default:
        break;
    }
    if (o.progress >= o.total && o.state === 'active') {
      o.state = 'done';
      this.onObjectiveDone?.(o);
      audio.sfx(o.def.optional ? 'levelUp' : 'buildDone', 0.6);
    }
  }

  bossSpawned = false;
  /** enemy attack waves that have been survived (drives "hold out" objectives) */
  wavesSurvived = 0;
  /** set by the battle scene once the rescue target actually exists on the map */
  rescueTargetSpawned = false;
  private prisonerFreed = false;

  // ────────────────────────── event feeds ──────────────────────────

  onDeposit(kind: string, amount: number): void {
    if (kind === 'gold') this.goldDeposited += amount;
  }

  onProduced(unit: Unit): void {
    if (unit.team === 1 && unit.def.role !== 'worker') this.producedCombatUnits++;
  }

  onKilled(entity: Unit | Building, killerTeam: number): void {
    const { world } = this.ctx;
    if (entity.kind === 'unit') {
      const u = entity as Unit;
      if (u.isHero) {
        this.heroDied = true;
        return;
      }
      if (u.team === 2 && killerTeam === 1) {
        this.unitsKilledByPlayer++;
        world.grantXp(u.def.xp, u.x, u.y);
      }
      if (u.def.ai?.kind === 'boss') {
        // boss death is tracked through the objective
        audio.sfx('victory', 0.8);
      }
    } else {
      const b = entity as Building;
      if (b.team === 2 && killerTeam === 1) {
        this.buildingsDestroyed.set(b.def.id, (this.buildingsDestroyed.get(b.def.id) ?? 0) + 1);
        world.grantXp(24, b.x, b.y);
      }
      if (b.team === 1 && b.def.id === 'castle') {
        this.finish(false);
      }
    }
  }

  // ────────────────────────── hero progression ──────────────────────────

  updateHero(): void {
    const hero = this.ctx.world.hero;
    if (!hero) return;
    while (hero.level < 10 && hero.xp >= HERO_XP_TABLE[hero.level]) {
      hero.addLevel();
      audio.sfx('levelUp', 0.7);
      this.ctx.fx.levelUp(hero.x, hero.y);
      this.ctx.fx.damageText(hero.x, hero.y - 40, hero.level, 'crit');
      this.onHeroLevel?.(hero.level);
    }
  }

  onHeroLevel: ((level: number) => void) | null = null;

  // ────────────────────────── resolution ──────────────────────────

  finish(victory: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.victory = victory;
    this.defeat = !victory;
    const world = this.ctx.world;
    const seconds = world.elapsed;
    if (victory) {
      // settle end-of-match optional objectives
      for (const o of this.objectives) {
        if (o.def.optional && o.state === 'active' && o.def.kind === 'survive' && !this.heroDied) o.state = 'done';
      }
    }
    const optionalDone = this.objectives.filter((o) => o.def.optional && o.state === 'done').length;
    const optionalFailed = this.objectives.filter((o) => o.def.optional && o.state === 'failed').length;
    const par = this.mission.parTime;
    let stars = 1;
    if (victory) {
      if (seconds <= par) stars++;
      if (optionalFailed === 0) stars++;
      if (seconds <= par * 0.75 && optionalDone === this.objectives.filter((o) => o.def.optional).length) stars = 3;
    } else {
      stars = 0;
    }
    const goldEarned = victory ? 150 + Math.round(Math.max(0, par - seconds) / 10) : 40;
    const xpEarned = victory ? 120 : 20;
    const relic = victory ? this.objectives.find((o) => o.def.optional && o.state === 'done' && o.def.reward?.relic)?.def.reward?.relic : undefined;
    audio.sfx(victory ? 'victory' : 'defeat', 0.9);
    this.onEnd?.({
      victory,
      seconds,
      stars,
      goldEarned,
      xpEarned,
      relic,
      objectivesDone: this.objectives.filter((o) => o.state === 'done').length,
      objectivesFailed: this.objectives.filter((o) => o.state === 'failed').length,
      optionalDone,
      loot: [],
    });
  }
}
