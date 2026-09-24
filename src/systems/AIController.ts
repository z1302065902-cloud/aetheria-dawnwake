import { FACTION, TILE } from '../config/Constants';
import type { Building } from '../world/Building';
import type { Unit } from '../world/Unit';
import type { GameCtx } from './GameCtx';
import type { MovementSystem } from './Movement';
import type { CombatSystem } from './Combat';
import type { MissionDef } from '../data/types';
import { audio } from '../audio/AudioBus';

interface CampState {
  x: number;
  y: number;
  strength: number;
  kind: 'wildborn' | 'voidborn';
  productionCooldown: number;
  authority: Building | null;
}

export type BossPhase = 1 | 2 | 3;

/**
 * Enemy brain. Three layers:
 *   1. Camp AI    — units defend their camp, chase intruders, retreat when hurt
 *   2. Wave AI    — attacks the player base on an escalating timer
 *   3. Boss AI    — three phases with telegraphed attacks
 */
export class AIController {
  camps: CampState[] = [];
  boss: Unit | null = null;
  bossPhase: BossPhase = 1;
  bossSpawned = false;

  private waveIndex = 0;
  private nextWaveAt = 0;
  private bossAbilityAt = 0;
  private bossSummonAt = 0;
  private think = 0;
  private scratch: Unit[] = [];

  constructor(
    private ctx: GameCtx,
    private movement: MovementSystem,
    private combat: CombatSystem,
  ) {}

  init(mission: MissionDef): void {
    const { world } = this.ctx;
    this.camps = mission.enemyCamps.map((c) => {
      const wx = c.x * TILE + TILE / 2;
      const wy = c.y * TILE + TILE / 2;
      return { x: wx, y: wy, strength: c.strength, kind: c.kind, productionCooldown: 12, authority: null };
    });
    this.nextWaveAt = mission.waves.firstAt;

    // initial garrison: a mix of melee / ranged around each camp
    for (const camp of this.camps) {
      // strength 4 used to mean 8 raiders + 5 hunters + a shaman = 14 defenders per camp, so a
      // player who could field 8-10 units could never take a camp. Halved on purpose.
      const raiders = Math.max(2, Math.round(camp.strength * 1.2));
      const hunters = Math.max(1, Math.round(camp.strength * 0.8));
      for (let i = 0; i < raiders; i++) {
        const ang = (i / raiders) * Math.PI * 2;
        const r = 90 + (i % 3) * 40;
        const u = world.spawnEnemyUnit('raider', camp.x + Math.cos(ang) * r, camp.y + Math.sin(ang) * r, camp.kind as any);
        u.aiState = 'defend';
      }
      for (let i = 0; i < hunters; i++) {
        const ang = (i / hunters) * Math.PI * 2 + 0.4;
        const u = world.spawnEnemyUnit('hunter', camp.x + Math.cos(ang) * 150, camp.y + Math.sin(ang) * 150, camp.kind as any);
        u.aiState = 'defend';
      }
      if (camp.strength >= 4) {
        const u = world.spawnEnemyUnit('shaman', camp.x - 70, camp.y - 60, camp.kind as any);
        u.aiState = 'defend';
      }
    }
  }

  /** Registers the enemy camp buildings once they exist so the AI can defend them. */
  bindCampBuilding(b: Building): void {
    let best: CampState | null = null;
    let bestD = Infinity;
    for (const camp of this.camps) {
      const d = (camp.x - b.x) ** 2 + (camp.y - b.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = camp;
      }
    }
    if (best && bestD < 400 * 400) best.authority = b;
  }

  spawnBoss(mission: MissionDef): Unit | null {
    const { world } = this.ctx;
    if (this.bossSpawned) return this.boss;
    this.bossSpawned = true;
    const def = mission.boss;
    const x = def.x * TILE + TILE / 2;
    const y = def.y * TILE + TILE / 2;
    const faction = world.isUnitDef(def.unitId) ? undefined : undefined;
    const boss = world.spawnEnemyUnit(def.unitId, x, y, (faction ?? FACTION.WILDBORN) as any);
    this.boss = boss;
    // one source of truth: the mission's boss objective reads this flag, so set it here
    // instead of relying on the caller to remember
    this.ctx.missions.bossSpawned = true;
    this.bossPhase = 1;
    this.bossAbilityAt = this.ctx.now + 5;
    this.bossSummonAt = this.ctx.now + 8;
    audio.sfx('bossRoar', 0.9);
    this.ctx.fx.levelUp(x, y);
    this.ctx.fx.explosion(x, y, 160, false);
    this.onBossSpawned?.();
    return boss;
  }

  update(dt: number): void {
    const { now } = this.ctx;
    this.think += dt;
    if (this.think >= 0.22) {
      this.think = 0;
      this.tickUnits();
    }
    this.tickCampProduction(dt);
    this.tickWaves();
    this.tickBoss(dt);
  }

  // ────────────────────────── unit behaviour ──────────────────────────

  private tickUnits(): void {
    const { world } = this.ctx;
    const castle = world.buildings.find((b) => b.dead === false && b.team === 1 && b.def.id === 'castle');
    for (const u of world.units) {
      if (u.dead || u.team === 1) continue; // teams 2 and 3 are AI driven
      if (u.def.ai?.kind === 'boss') continue;
      u.aiThink -= 0.22;
      if (u.aiThink > 0) continue;
      u.aiThink = 0.35 + Math.random() * 0.35;

      const home = { x: u.homeX, y: u.homeY };
      const distHome = Math.hypot(u.x - home.x, u.y - home.y);
      const hpRatio = u.hpRatio;

      // 1. retreat when badly hurt
      if (hpRatio < 0.3 && u.aiState !== 'retreat') {
        u.aiState = 'retreat';
        u.targetId = -1;
        const shelter = world.nearestFriendlyBuilding(u.x, u.y, u.team, 900);
        const target = shelter ?? home;
        this.movement.moveGroup([u], target.x, target.y, () => u.setState('move'));
      }
      if (u.aiState === 'retreat') {
        if (hpRatio > 0.62) u.aiState = 'idle';
        else if (u.path.length === 0) {
          const shelter = world.nearestFriendlyBuilding(u.x, u.y, u.team, 900);
          const target = shelter ?? home;
          this.movement.moveGroup([u], target.x, target.y, () => u.setState('move'));
        }
        continue;
      }

      // 2. acquire a target: player units first, then buildings
      const aggro = u.aiState === 'chase' ? 520 : 300;
      let target: Unit | Building | null = world.nearestEnemy(u.x, u.y, aggro, u.team);
      if (!target) target = world.nearestEnemyBuilding(u.x, u.y, aggro, u.team);

      if (target) {
        u.targetId = target.id;
        u.aiState = 'chase';
        u.lastCombatAt = this.ctx.now;
        const dist = Math.hypot(target.x - u.x, target.y - u.y);
        if (dist > u.rangeTotal + target.radius + 8 && u.path.length === 0) {
          this.movement.moveGroup([u], target.x, target.y, () => u.setState('attack'));
        } else {
          u.setState('attack');
        }
        continue;
      }

      // 3. no target: hold near home, or keep pushing toward the player base during a wave
      if (u.aiState === 'chase' && !target && distHome > 700) {
        u.aiState = 'defend';
      }
      if (u.aiState === 'defend' && distHome > 220) {
        if (u.path.length === 0 && Math.random() < 0.25 && u.team === 2) {
          this.movement.moveGroup([u], home.x + (Math.random() - 0.5) * 120, home.y + (Math.random() - 0.5) * 120, () => u.setState('move'));
        }
        continue;
      }
      if (u.aiState === 'patrol') {
        if (u.path.length === 0) {
          const p = u.patrolPoint ?? { x: home.x + (Math.random() - 0.5) * 320, y: home.y + (Math.random() - 0.5) * 320 };
          u.patrolPoint = p;
          this.movement.moveGroup([u], p.x, p.y, () => u.setState('move'));
        }
        continue;
      }
      if (u.aiState === 'idle') {
        u.aiState = 'defend';
      }
      if (castle && u.aiState === 'chase' && distHome > 900) {
        this.movement.moveGroup([u], castle.x, castle.y, () => u.setState('attackMove'));
      }
    }
  }

  // ────────────────────────── waves ──────────────────────────

  private tickCampProduction(dt: number): void {
    const { world } = this.ctx;
    for (const camp of this.camps) {
      camp.productionCooldown -= dt;
      if (camp.productionCooldown > 0) continue;
      camp.productionCooldown = 22 + Math.random() * 10;
      if (camp.kind === 'voidborn') {
        const u = world.spawnEnemyUnit('shade', camp.x + (Math.random() - 0.5) * 120, camp.y + (Math.random() - 0.5) * 120, 'voidborn');
        u.aiState = 'defend';
      } else {
        const id = Math.random() < 0.6 ? 'raider' : 'hunter';
        const u = world.spawnEnemyUnit(id, camp.x + (Math.random() - 0.5) * 120, camp.y + (Math.random() - 0.5) * 120, 'wildborn');
        u.aiState = 'defend';
      }
    }
  }

  private tickWaves(): void {
    const { world, now } = this.ctx;
    const mission = this.missionRef;
    if (!mission) return;
    if (now < this.nextWaveAt) return;
    this.waveIndex++;
    this.nextWaveAt = now + mission.waves.interval;
    const count = Math.min(mission.waves.max, Math.round(3 + this.waveIndex * mission.waves.growth));
    const castle = world.buildings.find((b) => !b.dead && b.team === 1 && b.def.id === 'castle');
    const target = castle ?? { x: world.map.playerStart.x, y: world.map.playerStart.y };
    const camp = this.camps[this.camps.length - 1] ?? this.camps[0];
    if (!camp) return;
    for (let i = 0; i < count; i++) {
      const id = mission.waves.units[i % mission.waves.units.length];
      const ang = (i / count) * Math.PI * 2;
      const u = world.spawnEnemyUnit(id, camp.x + Math.cos(ang) * 70, camp.y + Math.sin(ang) * 70, camp.kind as any);
      u.aiState = 'chase';
      u.patrolPoint = { x: target.x, y: target.y };
      this.movement.moveGroup([u], target.x + (Math.random() - 0.5) * 120, target.y + (Math.random() - 0.5) * 120, () => u.setState('attackMove'));
    }
    this.ctx.fx.explosion(camp.x, camp.y, 90, true, true);
    audio.sfx('bossRoar', 0.35);
    this.wavesSent = this.waveIndex;
    this.onWave?.(this.waveIndex, count);
  }

  onWave: ((index: number, count: number) => void) | null = null;
  /** fired the moment a boss appears, for the camera push-in */
  onBossSpawned: (() => void) | null = null;
  /** waves that have been sent (used by "survive N waves" objectives) */
  wavesSent = 0;

  missionRef: MissionDef | null = null;

  /** HUD read-outs (kept public so the HUD never reaches into private state). */
  get waveCount(): number {
    return this.waveIndex;
  }

  get nextWaveAtPublic(): number {
    return this.nextWaveAt;
  }

  // ────────────────────────── boss ──────────────────────────

  private tickBoss(dt: number): void {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    const { world, now } = this.ctx;
    const ratio = boss.hpRatio;
    const newPhase: BossPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (newPhase !== this.bossPhase) {
      this.bossPhase = newPhase;
      audio.sfx('bossRoar', 0.9);
      this.ctx.fx.explosion(boss.x, boss.y, 180, true);
      this.ctx.fx.telegraph(boss.x, boss.y, 150, 900, 0xffb04a);
      this.combat.areaDamage(boss.x, boss.y, 150, 18, 'magic', boss.team, boss.id, 30);
      boss.addBuff({ id: 'enrage', until: now + 9999, speedMul: 1 + (newPhase - 1) * 0.14, attackMul: 1 + (newPhase - 1) * 0.18 });
    }

    // chase the closest player unit
    const target = world.nearestEnemy(boss.x, boss.y, 900, boss.team) ?? (world.nearestEnemyBuilding(boss.x, boss.y, 900, boss.team) as unknown as Unit | null);
    if (target) {
      boss.targetId = target.id;
      const dist = Math.hypot(target.x - boss.x, target.y - boss.y);
      if (dist > boss.rangeTotal + target.radius + 6 && boss.path.length === 0) {
        this.movement.moveGroup([boss], target.x, target.y, () => boss.setState('attack'));
      }
    }

    // ability 1: telegraphed ground slam
    if (now >= this.bossAbilityAt) {
      const slamRadius = this.bossPhase === 1 ? 120 : this.bossPhase === 2 ? 145 : 170;
      const dmg = 34 + this.bossPhase * 12;
      const telegraphMs = this.bossPhase === 3 ? 700 : 950;
      const tx = boss.x + (target ? (target.x - boss.x) * 0.6 : 0);
      const ty = boss.y + (target ? (target.y - boss.y) * 0.6 : 0);
      this.ctx.fx.telegraph(tx, ty, slamRadius, telegraphMs);
      const dmgType = 'siege' as const;
      world.scene.time.delayedCall(telegraphMs, () => {
        if (boss.dead) return;
        audio.sfx('bossSlam', 0.8);
        this.ctx.fx.explosion(tx, ty, slamRadius, false);
        for (const u of world.units) {
          if (u.dead || u.team !== 1) continue;
          if (Math.hypot(u.x - tx, u.y - ty) <= slamRadius + u.radius) this.combat.applyDamage(u, dmg, dmgType, boss.team, boss.id, false);
        }
        for (const b of world.buildings) {
          if (b.dead || b.team !== 1) continue;
          if (Math.hypot(b.x - tx, b.y - ty) <= slamRadius + b.radius) this.combat.applyDamage(b, dmg * 0.7, dmgType, boss.team, boss.id, false);
        }
      });
      this.bossAbilityAt = now + (this.bossPhase === 1 ? 9 : this.bossPhase === 2 ? 7.5 : 6);
    }

    // ability 2: summon minions
    if (now >= this.bossSummonAt) {
      const count = this.bossPhase === 1 ? 3 : this.bossPhase === 2 ? 4 : 6;
      const id = boss.def.faction === 'wildborn' ? 'direwolf' : 'shade';
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const u = world.spawnEnemyUnit(id, boss.x + Math.cos(ang) * 60, boss.y + Math.sin(ang) * 60, boss.faction as any);
        u.aiState = 'chase';
        u.homeX = boss.x;
        u.homeY = boss.y;
      }
      audio.sfx('bossRoar', 0.6);
      this.ctx.fx.explosion(boss.x, boss.y, 100, true, true);
      this.bossSummonAt = now + (this.bossPhase === 3 ? 12 : 18);
      void dt;
    }
  }
}
