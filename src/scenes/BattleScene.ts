import Phaser from 'phaser';
import { CFG, DEPTH, FACTION, TILE, WORLD_H, WORLD_W } from '../config/Constants';
import { bus, EV } from '../core/EventBus';
import { audio } from '../audio/AudioBus';
import { ensureTextures, metaOf } from '../art/SpriteFactory';
import { paintMinimapBase, paintTerrain } from '../art/TerrainPainter';
import { FxSystem } from '../fx/FxSystem';
import { World } from '../world/World';
import { buildGreenValley, generateMapForMission, type GeneratedMap } from '../world/MapGen';
import { setupMatch } from '../world/MatchSetup';
import { MovementSystem } from '../systems/Movement';
import { CombatSystem } from '../systems/Combat';
import { OrderSystem } from '../systems/Orders';
import { EconomySystem } from '../systems/Economy';
import { BuildSystem } from '../systems/Build';
import { ProductionSystem } from '../systems/Production';
import { AIController } from '../systems/AIController';
import { HeroAbilities } from '../systems/HeroAbilities';
import { MissionSystem } from '../systems/Mission';
import { SelectionSystem } from '../systems/Selection';
import type { GameCtx, ProjectilePoolApi } from '../systems/GameCtx';
import type { Building } from '../world/Building';
import type { Hero } from '../world/Hero';
import type { ResourceNode } from '../world/ResourceNode';
import type { Unit } from '../world/Unit';
import { getMission } from '../data/missions';
import { getBuilding, BUILD_ORDER, BUILDINGS } from '../data/buildings';
import { getUnit } from '../data/units';
import { SKILLS } from '../data/heroes';
import { save } from '../core/SaveManager';
import { buildModifiers, describeModifiers } from '../systems/Relics';
import { FOG_TEX, VisionGrid } from '../systems/Vision';
import { applyEquipmentToHero } from '../systems/Equipment';
import { EnvironmentSystem } from '../systems/Environment';
import { AutomationSystem } from '../systems/Automation';
import { ArmyGroupSystem, STANCE_LABEL, type Stance } from '../systems/ArmyGroups';
import { AdventureSystem } from '../systems/Adventure';
import { MapEventsSystem } from '../systems/MapEvents';
import { LightingSystem } from '../systems/Lighting';
import { CAMERA, REGION } from '../art/VisualBible';
import { Rng } from '../core/Rng';
import { rollLoot } from '../data/items';
import type { MissionDef } from '../data/types';

export interface HudAbilityView {
  id: string;
  key: string;
  name: string;
  cooldown: number;
  cooldownLeft: number;
  locked: boolean;
  manaOk: boolean;
  manaCost: number;
  requiredLevel: number;
}

export interface HudState {
  gold: number;
  wood: number;
  mana: number;
  popUsed: number;
  popMax: number;
  elapsed: number;
  wave: { index: number; nextIn: number };
  hero: {
    present: boolean;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    xp: number;
    xpNext: number;
    respawn: number;
    abilities: HudAbilityView[];
  };
  selection: {
    units: Array<{ name: string; hp: number; maxHp: number; role: string }>;
    building: {
      id: string;
      name: string;
      hp: number;
      maxHp: number;
      building: boolean;
      construction: number;
      produces: string[];
      queue: Array<{ unitId: string; progress: number }>;
    } | null;
    hasWorker: boolean;
    buildable: Array<{ id: string; name: string; cost: string; ok: boolean }>;
  };
  objectives: Array<{ text: string; state: string; progress: number; total: number; optional: boolean }>;
  minimap: { units: Array<{ x: number; y: number; team: number; hero: boolean }>; buildings: Array<{ x: number; y: number; team: number }> };
  paused: boolean;
  ended: boolean;
  fps: number;
  /** live boss readout (null when no boss is on the field) */
  boss: { name: string; hp: number; maxHp: number; phase: number; visible: boolean } | null;
  /** recent combat events, newest first */
  feed: Array<{ text: string; kind: 'kill' | 'skill' | 'boss' | 'loss'; age: number }>;
  /** worker automation panel (single-player: no farmer babysitting) */
  workers: {
    total: number;
    assigned: { gold: number; wood: number; mana: number; idle: number; building: number };
    mix: { gold: number; wood: number; mana: number };
    /** live nodes per resource (0 = exhausted, the automation will not send anyone there) */
    available: { gold: number; wood: number; mana: number };
    autoWorker: boolean;
    autoProduction: boolean;
    autoAttack: boolean;
    autoRally: boolean;
  };
  /** army groups with their stance */
  armies: Array<{ id: number; name: string; stance: string; count: number }>;
  /** adventure progress + the run blessing */
  adventure: { found: number; remaining: number; blessing: string; events: string[] };
  /** Human readable list of the live relic bonuses (shown in the pause overlay). */
  relicLines: string[];
}

/** The playable match: world + every system + input. One instance per mission. */
export class BattleScene extends Phaser.Scene implements GameCtx {
  world!: World;
  fx!: FxSystem;
  path!: import('../systems/Pathfinder').Pathfinder;
  now = 0;
  projectiles!: ProjectilePoolApi;

  map!: GeneratedMap;
  mission!: MissionDef;
  movement!: MovementSystem;
  combat!: CombatSystem;
  orders!: OrderSystem;
  economy!: EconomySystem;
  build!: BuildSystem;
  production!: ProductionSystem;
  ai!: AIController;
  abilities!: HeroAbilities;
  missions!: MissionSystem;
  selection!: SelectionSystem;
  vision!: VisionGrid;
  environment!: EnvironmentSystem;
  automation!: AutomationSystem;
  armies!: ArmyGroupSystem;
  adventure!: AdventureSystem;
  /** map-level random events (named mapEvents: `events` is Phaser's own Scene EventEmitter) */
  mapEvents!: MapEventsSystem;
  lighting!: LightingSystem;
  /** per-run random blessing (Roguelite: maps and main objectives stay fixed) */
  runBlessing!: { id: string; name: string; desc: string };
  private fogImage!: Phaser.GameObjects.Image;
  private visionTimer = 0;

  paused = false;
  /** Simulation speed multiplier (used by the automated soak/playtest harness). */
  speed = 1;
  private ended = false;
  private elapsedReal = 0;
  private hudTimer = 0;
  private fpsSamples: number[] = [];
  private feed: Array<{ text: string; kind: 'kill' | 'skill' | 'boss' | 'loss'; age: number }> = [];

  // input state
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragCurrent = { x: 0, y: 0 };
  private dragGraphics!: Phaser.GameObjects.Graphics;
  private drawGraphics!: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Image | null = null;
  private placementId: string | null = null;
  private placementValid = false;
  private pendingAbility: string | null = null;
  private attackMoveArmed = false;
  private controlGroups: Unit[][] = [[], [], [], [], []];
  private unsubs: Array<() => void> = [];

  constructor() {
    super('Battle');
  }

  create(data: { missionId?: string; heroId?: string }): void {
    // Phaser reuses the scene instance on restart(): every piece of state must be
    // reset here, otherwise a second match inherits the first match's flags.
    this.now = 0;
    this.paused = false;
    this.ended = false;
    this.speed = 1;
    this.elapsedReal = 0;
    this.hudTimer = 0;
    this.fpsSamples = [];
    this.dragging = false;
    this.placementId = null;
    this.placementValid = false;
    this.pendingAbility = null;
    this.attackMoveArmed = false;
    this.controlGroups = [[], [], [], [], []];
    this.unsubs = [];
    this.ghost = null;
    this.visionTimer = 0;
    this.feed = [];

    const missionId = data?.missionId ?? 'm01';
    this.mission = getMission(missionId);
    // m01 keeps its hand-tuned layout; every other mission is generated from its data
    this.map = missionId === 'm01' ? buildGreenValley() : generateMapForMission(this.mission);
    ensureTextures(this);
    paintTerrain(this, this.map, 'terrain', this.mission.map.biome);
    paintMinimapBase(this, this.map, this.mission.map.biome);

    this.add.image(0, 0, 'terrain').setOrigin(0, 0).setDepth(DEPTH.TERRAIN);

    this.fx = new FxSystem(this);
    this.world = new World(this, this.map, this.fx);
    this.path = this.world.pathfinder;
    // Roguelite progression: the permanent relics bought in previous runs are turned
    // into live match modifiers before anything is spawned.
    this.world.mods = buildModifiers(save.current.hero.relics, save.current.hero.talents);
    this.vision = new VisionGrid(this, this.map.w, this.map.h);
    this.world.vision = this.vision;
    this.vision.update(this.world);
    this.vision.paint();
    this.fogImage = this.add
      .image(0, 0, FOG_TEX)
      .setOrigin(0, 0)
      .setDisplaySize(this.map.w * 40, this.map.h * 40)
      .setDepth(DEPTH.FOG);

    this.selection = new SelectionSystem(this.world);
    this.movement = new MovementSystem(this);
    this.combat = new CombatSystem(this);
    this.projectiles = this.combat;
    this.orders = new OrderSystem(this, this.movement);
    this.economy = new EconomySystem(this, this.orders);
    this.build = new BuildSystem(this, this.orders);
    this.production = new ProductionSystem(this, this.orders);
    this.abilities = new HeroAbilities(this, this.combat);
    this.missions = new MissionSystem(this, this.mission);
    this.ai = new AIController(this, this.movement, this.combat);
    this.automation = new AutomationSystem(this, this.orders, this.production);
    this.armies = new ArmyGroupSystem(this, this.movement);
    this.ai.missionRef = this.mission;

    // hero
    const heroId = data?.heroId ?? save.current.hero.id ?? this.mission.hero;
    const start = this.map.playerStart;
    const hero = this.world.spawnUnit(heroId, start.x + 90, start.y + 70, FACTION.PLAYER) as Hero;
    this.selection.setUnits([hero], true);
    this.world.hero = hero;
    // permanent progression: equipment bought/earned in earlier runs applies here
    applyEquipmentToHero(hero, save.current);

    const setup = setupMatch(this.world, this.mission);
    // keep the hero on top of the starting units
    hero.x = setup.castle.x + 96;
    hero.y = setup.castle.y + 74;
    this.ai.init(this.mission);
    for (const b of setup.enemyBuildings) this.ai.bindCampBuilding(b);

    // ── animated battlefield decoration ──
    this.environment = new EnvironmentSystem(this, this.map);
    const torches: Array<{ x: number; y: number }> = [];
    const banners: Array<{ x: number; y: number; color: number }> = [];
    const ruins: Array<{ x: number; y: number }> = [];
    for (const b of this.world.buildings) {
      const fp = b.def.footprint;
      if (b.def.faction === 'dawn') {
        torches.push(...EnvironmentSystem.torchesForBuilding(b.x, b.y, fp.w, fp.h, 0xffd257));
        banners.push({ x: b.x + (fp.w * 40) / 2 + 10, y: b.y + 12, color: b.def.art.banner ?? 0x4b6cc1 });
      } else if (b.team === 2) {
        torches.push({ x: b.x - (fp.w * 40) / 2 - 8, y: b.y + 14 });
        banners.push({ x: b.x + (fp.w * 40) / 2 + 10, y: b.y + 12, color: 0xc24a2a });
      }
    }
    for (const sp of this.map.searchPoints) ruins.push({ x: sp.x, y: sp.y });
    for (const land of this.map.landings) ruins.push({ x: land.x + 26, y: land.y - 30 });
    // Visual Bible §6: the region's ambient wash, applied to the ground only (below entities)
    this.lighting = new LightingSystem(this);
    this.lighting.build(this.mission.map.biome, WORLD_W, WORLD_H, this.mission.timeOfDay ?? 'day');

    // region-tinted smoke/residue so impacts belong to the biome they happen in
    this.fx.regionTint = {
      smoke: this.lighting.impactTint('smoke'),
      residue: this.lighting.impactTint('residue'),
      debris: this.lighting.impactTint('debris'),
    };

    this.vision.fogColor = REGION[this.mission.map.biome]?.fog ?? 0x060912;
    this.environment.vision = this.vision;
    this.environment.build({ torches, banners, ruins });

    // ── hero adventures: chests, NPCs, rifts and relic vaults ──
    this.adventure = new AdventureSystem(this, this.mission.map.seed + this.mission.index * 131);
    this.adventure.vision = this.vision;
    this.adventure.build(this.map.playerStart, this.map.searchPoints, 1 + this.mission.index * 0.35);
    this.adventure.onReward = (r) => {
      this.missions.adventureFound++;
      this.pushFeed(`发现 ${r.name}（+${r.gold} 金 / +${r.xp} 经验）`, 'skill');
      bus.emit(EV.TOAST, `发现：${r.name}`);
    };
    this.adventure.onReveal = (spot) => this.pushFeed(`发现 ${spot.name}`, 'skill');
    this.adventure.onRift = (x, y, unitId, count) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const u = this.world.spawnUnit(unitId, x + Math.cos(a) * 60, y + Math.sin(a) * 60, 'voidborn');
        u.aiState = 'chase';
        u.homeX = x;
        u.homeY = y;
      }
      this.pushFeed('虚空裂隙涌出了暗影！', 'boss');
    };

    // ── map-level random events: something happens TO the player on a timer ──
    this.mapEvents = new MapEventsSystem(this, this.adventure, this.combat, this.mission.map.seed + this.mission.index * 313);
    this.mapEvents.onWarn = (text, sub) => {
      bus.emit(EV.BANNER, { text, sub });
      this.pushFeed(text, 'boss');
    };
    this.mapEvents.onFired = (kind, name) => {
      if (kind !== 'meteor') this.pushFeed(`${name} 出现`, 'skill');
    };
    // early missions get fewer, later events: m01 should teach, not punish
    this.mapEvents.build(2 + Math.floor(this.mission.index / 3), 240 + this.mission.index * 20, 200);

    // ── mission objects: escort caravan / rescue prisoner ──
    const needsEscort = this.mission.objectives.some((o) => o.kind === 'escort');
    const needsRescue = this.mission.objectives.some((o) => o.kind === 'rescue');
    /** Mission objects must land on walkable in-bounds ground (a camp at the map edge would
     *  otherwise push them off the map and the objective becomes unsatisfiable). */
    const safeSpot = (x: number, y: number): { x: number; y: number } => {
      const tx = Math.max(1, Math.min(this.map.w - 2, Math.floor(x / TILE)));
      const ty = Math.max(1, Math.min(this.map.h - 2, Math.floor(y / TILE)));
      // a camp in a corner can sit inside a dense forest: widen the search before giving up
      for (const r of [8, 16, 28, 44]) {
        const free = this.path.nearestFree(tx, ty, r);
        if (free) return { x: free.tx * TILE + TILE / 2, y: free.ty * TILE + TILE / 2 };
      }
      const castle = this.world.buildings.find((b) => b.team === 1 && b.def.id === 'castle');
      const base = castle ?? this.map.playerStart;
      const free = this.path.nearestFree(Math.floor(base.x / TILE), Math.floor(base.y / TILE), 12);
      return free ? { x: free.tx * TILE + TILE / 2, y: free.ty * TILE + TILE / 2 } : { x: base.x, y: base.y };
    };
    if (needsEscort) {
      const spot = safeSpot(this.map.playerStart.x + 40, this.map.playerStart.y + 140);
      const c = this.world.spawnUnit('caravan', spot.x, spot.y, FACTION.PLAYER);
      c.team = 1;
      const goal = this.map.landings[this.map.landings.length - 1] ?? this.map.playerStart;
      this.orders.move([c], goal.x, goal.y, false);
      this.pushFeed('补给车出发了，护送它到地图另一侧', 'skill');
    }
    if (needsRescue) {
      const camp = this.world.buildings.find((b) => b.team === 2);
      const spot = safeSpot(camp ? camp.x - 90 : this.map.playerStart.x + 900, camp ? camp.y + 60 : this.map.playerStart.y + 300);
      const p = this.world.spawnUnit('prisoner', spot.x, spot.y, FACTION.WILDBORN);
      if (!p) {
        // never `return` here: create() still has to wire the automation and army groups
        console.warn('[mission] failed to spawn the rescue target — objective will stay open');
      } else {
        this.missions.rescueTargetSpawned = true;
        p.team = 2;
        p.captive = true;
        p.aiState = 'idle';
        p.homeX = p.x;
        p.homeY = p.y;
      }
    }

    // ── automation + army groups ──
    this.automation.onRally = (u) => this.armies.assignNewUnit(u);
    this.automation.groupAnchorOf = (u) => this.armies.anchorOf(u);
    this.armies.update(0);

    // ── Roguelite: one random blessing per run (fixed map + fixed main objectives) ──
    // Visual Bible §12: the boss arrival gets a push-in and a short hold (the camera is the
    // cheapest way to say "this matters")
    this.ai.onBossSpawned = () => this.bossIntroCamera();
    this.runBlessing = this.rollBlessing();
    this.world.mods = { ...this.world.mods, ...this.blessingMods(this.runBlessing.id) };
    this.environment.attachWaterShimmer(this.map.w * 40, this.map.h * 40);
    this.environment.smokePuff = (x, y) =>
      this.fx.spawn({ texture: 'fx_smoke', x, y, vy: -14, vx: (Math.random() - 0.5) * 8, life: 1.4, scale0: 0.4, scale1: 1.1, alpha0: 0.28, alpha1: 0, additive: false, tint: 0x9a9488 });

    // events: mission -> hud/audio
    // "gather N gold" objectives count deposits. This hook existed on GameCtx and was called
    // by the economy, but nobody ever assigned it — so the counter stayed 0 and mission 1 was
    // impossible to complete in a real game (the campaign test forced the counter and hid it).
    this.world.onKilled = (entity, killerTeam) => {
      this.missions.onKilled(entity, killerTeam);
      if (entity.kind === 'unit') {
        const u = entity as Unit;
        if (u.isHero) {
          audio.sfx('heroDown', 0.8);
          this.pushFeed('指挥官阵亡，30 秒后复活', 'loss');
        } else if (u.def.ai?.kind === 'boss') {
          this.pushFeed(`${u.def.name} 被击败`, 'boss');
          this.bossDeathCinematic(u.x, u.y);
        } else if (killerTeam === 1) {
          this.pushFeed(`击杀了 ${u.def.name}`, 'kill');
        } else if (u.team === 1) {
          this.pushFeed(`损失了 ${u.def.name}`, 'loss');
        }
      } else {
        const b = entity as Building;
        if (killerTeam === 1) this.pushFeed(`摧毁了 ${b.def.name}`, 'kill');
        else if (b.team === 1) this.pushFeed(`${b.def.name} 被摧毁`, 'loss');
      }
      this.checkBossSpawn();
      this.world.recomputePop();
    };
    this.missions.onEnd = (result) => this.finishMatch(result);
    this.missions.onObjectiveDone = (o) => {
      bus.emit(EV.TOAST, o.def.optional ? `可选目标完成：${o.def.text}` : `目标完成：${o.def.text}`);
      if (o.def.reward?.gold) this.world.addResource('gold', o.def.reward.gold);
      if (o.def.reward?.xp && this.world.hero) this.world.hero.xp += o.def.reward.xp;
      this.checkBossSpawn();
    };
    this.missions.onObjectiveStart = (o) => bus.emit(EV.TOAST, `新目标：${o.def.text}`);
    this.missions.onHeroLevel = (lvl) => bus.emit(EV.BANNER, { text: `指挥官升到 ${lvl} 级`, sub: '等级提升 · 属性成长' });
    this.missions.onObjectiveRevealed = (o) =>
      bus.emit(EV.BANNER, { text: '发现隐藏目标', sub: o.def.text });
    // Visual Bible §12: victory pushes in on the hero, defeat stays wide so the loss reads
    this.missions.onResolved = (victory) => {
      if (victory) this.victoryCamera();
      else this.cameras.main.zoomTo(0.9, 1200, 'Sine.easeOut');
    };
    this.ai.onWave = (index, count) => {
      this.missions.wavesSurvived = index;
      bus.emit(EV.BANNER, { text: `第 ${index} 波进攻 (${count} 单位)`, sub: '荒野氏族从营地出发' });
      audio.sfx('bossRoar', 0.4);
    };

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setZoom(CFG.BASE_ZOOM);
    cam.centerOn(hero.x, hero.y);
    cam.setBackgroundColor(0x0a0d14);

    this.dragGraphics = this.add.graphics().setDepth(DEPTH.DRAG).setScrollFactor(0);
    this.drawGraphics = this.add.graphics().setDepth(DEPTH.HEALTHBAR);

    this.setupInput();

    if (!this.scene.isActive('Hud')) this.scene.launch('Hud', { battle: this });
    else (this.scene.get('Hud') as any).bind?.(this);

    audio.playMusic('battle');
    bus.emit(EV.TOAST, this.mission.name + ' · ' + this.mission.brief);
    const relicLines = describeModifiers(this.world.mods);
    if (relicLines.length > 0) {
      bus.emit(EV.BANNER, { text: `遗物生效 ×${relicLines.length}`, sub: relicLines.join(' · ') });
    }
    // Debug hook (also used by the automated smoke test / bot playtest).
    (window as unknown as { __AETHERIA_BATTLE__?: BattleScene }).__AETHERIA_BATTLE__ = this;
  }

  // ────────────────────────── lifecycle ──────────────────────────

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05) * (this.paused || this.ended ? 1 : this.speed);
    this.fpsSamples.push(delta);
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();

    if (!this.paused && !this.ended) {
      this.elapsedReal += dt;
      this.now += dt;
      this.path.update(dt);
      this.world.update(dt);
      // fog recompute is throttled: it is a 6-7 Hz concern, not a per-frame one
      this.visionTimer += dt;
      if (this.visionTimer >= 0.15) {
        this.visionTimer = 0;
        this.vision.update(this.world);
        this.vision.paint();
      }
      // while the player is deciding where to put a building, automation must not spend
      if (this.placementId) this.automation.holdProduction(0.5);
      this.lighting.update(dt, this.cameras.main.worldView);
      this.environment.update(dt);
      this.automation.update(dt);
      this.armies.update(dt);
      this.adventure.update(dt);
      this.mapEvents.update(dt);
      this.orders.update(dt);
      this.ai.update(dt);
      this.movement.update(dt);
      this.combat.update(dt);
      this.economy.update(dt);
      this.build.update(dt);
      this.production.update(dt);
      this.abilities.update(dt);
      this.missions.update(dt);
      this.missions.updateHero();
      this.updateFacing();
    }
    this.fx.update(dt);
    for (let i = this.feed.length - 1; i >= 0; i--) {
      this.feed[i].age += dt;
      if (this.feed[i].age > 6) this.feed.splice(i, 1);
    }
    this.selection.refresh();
    this.drawOverlay();
    this.updateGhost();
    this.hudTimer += dt;
    if (this.hudTimer > 0.12) {
      this.hudTimer = 0;
      bus.emit(EV.SELECTION);
      bus.emit(EV.RESOURCES);
      bus.emit(EV.OBJECTIVES);
      bus.emit(EV.HERO);
    }
    void this.elapsedReal;
  }

  private updateFacing(): void {
    // keeps sprites oriented without doing it in the movement loop
    void 0;
  }

  // ────────────────────────── overlay (rings + bars) ──────────────────────────

  private drawOverlay(): void {
    const g = this.drawGraphics;
    g.clear();
    // selection rings
    if (this.selection.units.length > 0) {
      g.lineStyle(2, 0x7fffb0, 0.95);
      for (const u of this.selection.units) {
        g.strokeEllipse(u.x, u.y, (u.radius + 9) * 2, (u.radius + 9) * 1.15);
      }
    }
    if (this.selection.building) {
      const b = this.selection.building;
      g.lineStyle(2, 0x7fffb0, 0.95);
      g.strokeRect(b.x - (b.def.footprint.w * TILE) / 2 - 3, b.y - (b.def.footprint.h * TILE) / 2 - 8, b.def.footprint.w * TILE + 6, b.def.footprint.h * TILE + 12);
    }
    // target indicator: a reticle on whatever the primary selected unit is attacking
    const primary = this.selection.primary;
    const target = primary && primary.targetId >= 0 ? this.world.entityById(primary.targetId) : undefined;
    if (target && !target.dead) {
      const r = Math.max(12, target.radius + 6);
      const pulse = 1 + Math.sin(this.now * 6) * 0.08;
      g.lineStyle(2, 0xff6a5a, 0.95);
      g.strokeCircle(target.x, target.y - 8, r * pulse);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        g.lineBetween(target.x + dx * r * pulse, target.y - 8 + dy * r * pulse, target.x + dx * (r * pulse + 6), target.y - 8 + dy * (r * pulse + 6));
      }
    }

    // health bars for damaged / selected entities
    const drawBar = (x: number, y: number, w: number, ratio: number, team: number, building: boolean) => {
      const h = building ? 6 : 4;
      g.fillStyle(0x000000, 0.62);
      g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      const color = ratio > 0.55 ? 0x5ada7a : ratio > 0.25 ? 0xf0c04a : 0xe4564a;
      g.fillStyle(color, 1);
      g.fillRect(x - w / 2, y, w * ratio, h);
      if (team !== 1) {
        g.lineStyle(1, 0xff6a5a, 0.5);
        g.strokeRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      }
    };
    for (const u of this.world.units) {
      if (u.dead) continue;
      const damaged = u.hpRatio < 0.999;
      const sel = u.selected || this.selection.units.includes(u);
      if (!damaged && !sel && !u.isHero) continue;
      drawBar(u.x, u.y - metaOf(`u_${u.def.id}`).sy * 0 - u.radius * 2.2 - 10, u.isHero ? 34 : 22, u.hpRatio, u.team, false);
      if (u.isHero) {
        const hero = u as Hero;
        g.fillStyle(0x0a0f1c, 0.7);
        g.fillRect(u.x - 17, u.y - u.radius * 2.2 - 5, 34, 4);
        g.fillStyle(0x4aa8ff, 1);
        g.fillRect(u.x - 17, u.y - u.radius * 2.2 - 5, 34 * (hero.mana / Math.max(1, hero.maxMana)), 4);
      }
    }
    for (const b of this.world.buildings) {
      if (b.dead) continue;
      const sel = this.selection.building === b;
      if (b.hpRatio > 0.999 && !sel) continue;
      drawBar(b.x, b.y - b.radius - 22, Math.max(34, b.def.footprint.w * 20), b.hpRatio, b.team, true);
      if (b.building) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(b.x - 22, b.y + 6, 44, 5);
        g.fillStyle(0xffd257, 1);
        g.fillRect(b.x - 22, b.y + 6, 44 * b.construction, 5);
      }
      if (b.def.id === 'neutral_shrine' && !b.captured) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(b.x - 20, b.y + 6, 40, 5);
        g.fillStyle(0x7fd8ff, 1);
        g.fillRect(b.x - 20, b.y + 6, 40 * b.captureProgress, 5);
      }
    }
    for (const r of this.world.resources) {
      if (r.dead || r.amount <= 0) continue;
      const ratio = Math.min(1, r.amount / r.maxAmount);
      if (ratio > 0.35) continue;
      g.fillStyle(0x000000, 0.55);
      g.fillRect(r.x - 13, r.y - 30, 26, 4);
      g.fillStyle(r.resourceKind === 'gold' ? 0xffd257 : 0x9ec46a, 1);
      g.fillRect(r.x - 13, r.y - 30, 26 * ratio, 4);
    }
  }

  // ────────────────────────── input ──────────────────────────

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.init();
      if (this.ended) return;
      if (p.rightButtonDown()) {
        this.handleRightClick(p);
        return;
      }
      if (p.middleButtonDown()) {
        return;
      }
      if (p.leftButtonDown()) {
        if (this.placementId) {
          this.tryPlaceBuilding(p);
          return;
        }
        if (this.pendingAbility) {
          this.castPendingAt(p);
          return;
        }
        this.dragging = true;
        this.dragStart = { x: p.x, y: p.y };
        this.dragCurrent = { x: p.x, y: p.y };
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.dragCurrent = { x: p.x, y: p.y };
      if (p.isDown && p.middleButtonDown()) {
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
      if (this.dragging && p.isDown) {
        const dist = Phaser.Math.Distance.Between(this.dragStart.x, this.dragStart.y, p.x, p.y);
        if (dist > 8) {
          const g = this.dragGraphics;
          g.clear();
          const x1 = Math.min(this.dragStart.x, p.x);
          const y1 = Math.min(this.dragStart.y, p.y);
          g.fillStyle(0x7fffb0, 0.12);
          g.fillRect(x1, y1, Math.abs(p.x - this.dragStart.x), Math.abs(p.y - this.dragStart.y));
          g.lineStyle(1.5, 0x7fffb0, 0.9);
          g.strokeRect(x1, y1, Math.abs(p.x - this.dragStart.x), Math.abs(p.y - this.dragStart.y));
        }
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dragGraphics.clear();
      const dist = Phaser.Math.Distance.Between(this.dragStart.x, this.dragStart.y, p.x, p.y);
      const cam = this.cameras.main;
      const worldStart = cam.getWorldPoint(this.dragStart.x, this.dragStart.y);
      if (dist > 8) {
        const worldEnd = cam.getWorldPoint(p.x, p.y);
        this.selection.pickInRect(worldStart.x, worldStart.y, worldEnd.x, worldEnd.y, 1, p.event?.shiftKey === true);
        if (this.selection.count > 0 && this.attackMoveArmed) {
          this.orders.move(this.selection.units, worldEnd.x, worldEnd.y, true);
          this.attackMoveArmed = false;
        }
      } else {
        if (this.attackMoveArmed) {
          this.orders.move(this.selection.units, worldStart.x, worldStart.y, true);
          this.attackMoveArmed = false;
          return;
        }
        this.selection.pickAt(worldStart.x, worldStart.y);
      }
      bus.emit(EV.SELECTION);
    });

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0016, CFG.MIN_ZOOM, CFG.MAX_ZOOM));
    });

    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.unsubs.push(
      bus.on('ui:build-request', (id: string) => this.beginPlacement(id)),
      bus.on('ui:produce-request', (unitId: string) => this.requestProduction(unitId)),
      bus.on('ui:cancel-queue', () => this.selection.building && this.production.cancelLast(this.selection.building)),
      bus.on(EV.ABILITY, (id: string) => this.requestAbility(id)),
      bus.on('ui:minimap-click', (p: { x: number; y: number }) => {
        this.cameras.main.centerOn(p.x * WORLD_W, p.y * WORLD_H);
      }),
      bus.on('ui:worker-mix', (p: { kind: 'gold' | 'wood' | 'mana'; delta: number }) => {
        this.automation.setMix(p.kind, p.delta);
        bus.emit(EV.TOAST, `工人配比：金 ${this.automation.mix.gold} · 木 ${this.automation.mix.wood} · 晶 ${this.automation.mix.mana}`);
      }),
      bus.on('ui:automation-toggle', (key: 'autoWorker' | 'autoProduction' | 'autoAttack' | 'autoRally') => {
        this.automation.toggle(key);
        const on = this.automation.settings[key];
        bus.emit(EV.TOAST, `${key} → ${on ? '开启' : '关闭'}`);
      }),
      bus.on('ui:army-stance-cycle', (groupId: number) => {
        const order: Stance[] = ['followHero', 'guardBase', 'autoAttack', 'holdPoint'];
        const cur = this.armies.group(groupId).stance;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        this.armies.setStance(groupId, next);
        bus.emit(EV.TOAST, `编队 ${groupId}：${STANCE_LABEL[next]}`);
      }),
      bus.on('ui:army-select', (groupId: number) => {
        const members = this.armies.membersOf(groupId);
        if (members.length === 0) {
          // empty group: assign the current selection
          const sel = this.selection.units.filter((u) => !u.isHero);
          if (sel.length === 0) {
            bus.emit(EV.TOAST, `编队 ${groupId} 为空（先框选部队再点编号）`);
            return;
          }
          this.armies.assign(groupId, sel);
          bus.emit(EV.TOAST, `${sel.length} 个单位编入编队 ${groupId}（${this.armies.group(groupId).name}）`);
          return;
        }
        this.selection.setUnits(members);
        bus.emit(EV.SELECTION);
      }),
      bus.on('ui:toggle-pause', () => this.togglePause()),
      bus.on('ui:return-menu', () => this.returnToMenu()),
      bus.on('ui:retry', () => this.restartMission()),
      bus.on('ui:next-mission', () => this.returnToMenu()),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const u of this.unsubs) u();
      this.unsubs.length = 0;
      this.fx?.clear();
      this.combat?.dispose();
      this.environment?.dispose();
      this.world?.dispose();
    });
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.placementId) return this.cancelPlacement();
      if (this.pendingAbility) return this.cancelAbility();
      this.togglePause();
      return;
    }
    if (this.paused || this.ended) {
      if (k === 'escape') this.togglePause();
      return;
    }
    if (k === 'a') {
      this.attackMoveArmed = !this.attackMoveArmed;
      bus.emit(EV.TOAST, this.attackMoveArmed ? '攻击移动：点击目标位置' : '已取消攻击移动');
      return;
    }
    if (k === 's') {
      this.orders.stop(this.selection.units);
      return;
    }
    if (k === 'h') {
      this.orders.hold(this.selection.units);
      return;
    }
    if (k === 'q' || k === 'w' || k === 'e' || k === 'r') {
      const hero = this.world.hero;
      if (!hero) return;
      const skillId = hero.heroDef.skills['qwer'.indexOf(k)];
      if (skillId) this.requestAbility(skillId);
      return;
    }
    if (k === ' ') {
      const hero = this.world.hero;
      if (hero) this.cameras.main.centerOn(hero.x, hero.y);
      return;
    }
    if (k >= '1' && k <= '5') {
      const idx = Number(k) - 1;
      const group = this.controlGroups[idx];
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        this.controlGroups[idx] = this.selection.groupSnapshot();
        bus.emit(EV.TOAST, `编队 ${k} 已保存 (${this.controlGroups[idx].length} 单位)`);
      } else {
        const alive = group.filter((u) => !u.dead);
        this.controlGroups[idx] = alive;
        if (alive.length > 0) {
          this.selection.setUnits(alive);
          bus.emit(EV.SELECTION);
        }
      }
    }
  }

  private handleRightClick(p: Phaser.Input.Pointer): void {
    if (this.placementId) return this.cancelPlacement();
    if (this.pendingAbility) return this.cancelAbility();
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(p.x, p.y);
    const units = this.selection.units;
    if (units.length === 0) return;
    this.markManual(units, 6);
    this.markManual(units, 6);

    const enemyUnit = this.world.nearestEnemy(wp.x, wp.y, 34, 1);
    if (enemyUnit) {
      this.orders.attack(units, enemyUnit);
      bus.emit(EV.SFX, 'click');
      return;
    }
    const enemyBuilding = this.world.buildings.find((b) => {
      if (b.dead || b.team === 1 || b.team === 3) return false;
      return Math.abs(b.x - wp.x) < (b.def.footprint.w * TILE) / 2 + 10 && Math.abs(b.y - wp.y) < (b.def.footprint.h * TILE) / 2 + 14;
    });
    if (enemyBuilding) {
      this.orders.attack(units, enemyBuilding);
      return;
    }
    const node = this.world.resources.find((r) => !r.dead && !r.depleted && Math.hypot(r.x - wp.x, r.y - wp.y) < 40);
    const workers = units.filter((u) => u.def.role === 'worker');
    if (node && workers.length > 0) {
      this.orders.gather(workers, node, node.resourceKind);
      if (workers.length < units.length) this.orders.move(units.filter((u) => u.def.role !== 'worker'), wp.x, wp.y, false);
      return;
    }
    const site = this.world.buildings.find(
      (b) => !b.dead && b.team === 1 && b.building && Math.abs(b.x - wp.x) < (b.def.footprint.w * TILE) / 2 + 14 && Math.abs(b.y - wp.y) < (b.def.footprint.h * TILE) / 2 + 18,
    );
    if (site && workers.length > 0) {
      this.orders.build(workers, site);
      return;
    }
    const px = (p.event as MouseEvent | undefined)?.shiftKey;
    if (px && units.length > 0) {
      const u = units[0];
      u.queue.push({ type: this.attackMoveArmed ? 'attackMove' : 'move', x: wp.x, y: wp.y });
      return;
    }
    this.orders.move(units, wp.x, wp.y, this.attackMoveArmed);
    this.attackMoveArmed = false;
  }

  // ────────────────────────── building placement ──────────────────────────

  /** Player actions mark a manual hold so automation backs off for a few seconds. */
  private markManual(units: Unit[], seconds = 8): void {
    this.automation?.holdUnits(units, seconds);
  }

  beginPlacement(buildingId: string): void {
    const def = getBuilding(buildingId);
    if (!this.world.canAfford(def.cost)) {
      bus.emit(EV.TOAST, '资源不足：' + this.costText(def.cost));
      audio.sfx('error', 0.4);
      return;
    }
    this.placementId = buildingId;
    this.pendingAbility = null;
    // stop auto-spending so the player's building is always affordable
    this.automation?.holdProduction(1);
    const key = `b_${buildingId}`;
    if (this.ghost) this.ghost.destroy();
    this.ghost = this.add.image(0, 0, key).setOrigin(0.5, metaOf(key).sy).setAlpha(0.6).setScale(metaOf(key).sx).setDepth(DEPTH.FX);
    bus.emit(EV.TOAST, `放置 ${def.name}（右键取消）`);
  }

  private updateGhost(): void {
    if (!this.ghost || !this.placementId) return;
    const def = getBuilding(this.placementId);
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    this.ghost.setPosition(wp.x, wp.y);
    const check = this.world.canPlaceBuilding(def, wp.x, wp.y);
    this.placementValid = check.ok;
    this.ghost.setTint(check.ok ? 0x7fffb0 : 0xff6a5a);
    this.ghost.setAlpha(check.ok ? 0.65 : 0.4);
  }

  /**
   * Places a building at a world position, validating exactly like the mouse path does.
   * Public so tests (and a future scripted player) can build without synthesising pointers.
   */
  placeBuildingAt(buildingId: string, worldX: number, worldY: number, keepPlacing = false): { ok: boolean; reason?: string } {
    const def = getBuilding(buildingId);
    const check = this.world.canPlaceBuilding(def, worldX, worldY);
    if (!check.ok) {
      bus.emit(EV.TOAST, '无法建造：' + check.reason);
      audio.sfx('error', 0.4);
      return { ok: false, reason: check.reason };
    }
    if (!this.world.canAfford(def.cost)) {
      bus.emit(EV.TOAST, '资源不足：' + this.costText(def.cost));
      audio.sfx('error', 0.4);
      if (!keepPlacing) this.cancelPlacement();
      return { ok: false, reason: 'cost' };
    }
    this.world.spend(def.cost);
    const site = this.world.spawnBuilding(buildingId, worldX, worldY, FACTION.PLAYER, false);
    audio.sfx('build', 0.6);
    this.build.startConstruction(site, (assigned) => this.markManual(assigned, 30));
    if (!keepPlacing) this.cancelPlacement();
    return { ok: true };
  }

  private tryPlaceBuilding(pointer: Phaser.Input.Pointer): void {
    const id = this.placementId;
    if (!id) return;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    // keep placing while shift is held (classic RTS)
    const shift = (pointer.event as MouseEvent | undefined)?.shiftKey;
    const res = this.placeBuildingAt(id, wp.x, wp.y, !!shift);
    if (!res.ok && res.reason === 'cost') return; // placeBuildingAt already cancelled
  }

  private cancelPlacement(): void {
    this.placementId = null;
    this.ghost?.destroy();
    this.ghost = null;
    bus.emit(EV.TOAST, '');
  }

  private costText(cost: { gold?: number; wood?: number; mana?: number }): string {
    const parts: string[] = [];
    if (cost.gold) parts.push(`${cost.gold}金`);
    if (cost.wood) parts.push(`${cost.wood}木`);
    if (cost.mana) parts.push(`${cost.mana}晶`);
    return parts.join(' ');
  }

  // ────────────────────────── hero abilities ──────────────────────────

  private requestAbility(skillId: string): void {
    const hero = this.world.hero;
    if (!hero || hero.dead) {
      bus.emit(EV.TOAST, '指挥官已阵亡，正在复活');
      return;
    }
    const skill = SKILLS[skillId];
    if (!skill) return;
    if (hero.level < skill.levelRequired) {
      bus.emit(EV.TOAST, `${skill.name} 需要 ${skill.levelRequired} 级`);
      audio.sfx('error', 0.4);
      return;
    }
    if (!this.abilities.canCast(hero, skillId)) {
      bus.emit(EV.TOAST, hero.mana < skill.manaCost ? '法力不足' : `${skill.name} 冷却中 (${Math.ceil(hero.cooldowns[skillId])}s)`);
      audio.sfx('error', 0.4);
      return;
    }
    const needsTarget = ['charge', 'meteor', 'arrow-rain', 'summon-trap', 'teleport', 'projectile-storm'].includes(skill.kind);
    if (needsTarget) {
      this.pendingAbility = skillId;
      bus.emit(EV.TOAST, `${skill.name}：点击目标位置（右键取消）`);
      return;
    }
    const res = this.abilities.cast(hero, skillId, hero.x, hero.y);
    if (!res.ok) bus.emit(EV.TOAST, res.reason ?? '无法施放');
  }

  private castPendingAt(p: Phaser.Input.Pointer): void {
    const id = this.pendingAbility;
    if (!id) return;
    this.pendingAbility = null;
    const hero = this.world.hero;
    if (!hero) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const res = this.abilities.cast(hero, id, wp.x, wp.y);
    if (!res.ok) bus.emit(EV.TOAST, res.reason ?? '无法施放');
  }

  private cancelAbility(): void {
    this.pendingAbility = null;
    bus.emit(EV.TOAST, '');
  }

  // ────────────────────────── production ──────────────────────────

  private requestProduction(unitId: string): void {
    const b = this.selection.building;
    if (!b) return;
    if (b.building) {
      bus.emit(EV.TOAST, '建筑尚未完工');
      audio.sfx('error', 0.4);
      return;
    }
    const res = this.production.enqueue(b, unitId);
    if (res === 'cost') bus.emit(EV.TOAST, '资源不足，无法训练 ' + getUnit(unitId).name);
    else if (res === 'pop') bus.emit(EV.TOAST, '人口已满，先造农庄');
    else if (res === 'maxed') bus.emit(EV.TOAST, '生产队列已满');
  }

  // ────────────────────────── match flow ──────────────────────────

  private checkBossSpawn(): void {
    if (this.ai.bossSpawned) return;
    const spawnOn = this.mission.boss.spawnOn;
    if (spawnOn === 'time') {
      if (this.world.elapsed > 300) this.ai.spawnBoss(this.mission);
      return;
    }
    const obj = this.missions.objectives.find((o) => o.def.id === spawnOn);
    if (obj && obj.state === 'done') {
      this.ai.spawnBoss(this.mission);
      bus.emit(EV.BANNER, { text: '巨兽现身', sub: this.mission.boss.unitId === 'thornmaw' ? 'THORNMAW · 棘齿巨兽' : 'BOSS' });
      audio.playMusic('boss');
    }
  }

  private finishMatch(result: import('../systems/Mission').MatchResult): void {
    if (this.ended) return;
    this.ended = true;
    const hero = this.world.hero;
    if (save && hero) {
      save.current.hero.level = Math.max(save.current.hero.level, hero.level);
      save.current.hero.id = hero.heroDef.id;
    }
    if (result.victory) {
      save.completeMission(this.mission.id, result.stars, Math.round(result.seconds), result.stars * 1000 + Math.round(Math.max(0, this.mission.parTime - result.seconds)));
      save.current.hero.talentPoints += result.stars;
      if (result.relic) save.addRelic(result.relic);
      save.current.stats.victories++;
      // ── loot roll: victory always drops something, stars and the boss add more.
      //    The inventory holds unique items, so a drop must not roll a duplicate. ──
      const rng = new Rng(Date.now() & 0xffffffff);
      const drops = 1 + (result.stars >= 3 ? 1 : 0) + (this.ai.bossSpawned ? 1 : 0);
      const tier = result.stars >= 3 ? 2 : 1;
      const rolled = new Set<string>();
      for (let i = 0; i < drops; i++) {
        let item = rollLoot(rng, tier);
        for (let tries = 0; tries < 6 && (rolled.has(item.id) || save.current.hero.inventory.includes(item.id)); tries++) {
          item = rollLoot(rng, tier);
        }
        if (rolled.has(item.id) || save.current.hero.inventory.includes(item.id)) continue; // pool exhausted
        rolled.add(item.id);
        save.addItem(item);
        result.loot.push(item.name);
      }
    }
    save.current.stats.matches++;
    save.addPlaytime(Math.round(result.seconds * 1000));
    // dedicated end-of-match tracks (the jingle still plays on top)
    audio.playMusic(result.victory ? 'victory' : 'defeat');
    bus.emit(EV.MATCH_END, { ...result, missionId: this.mission.id, missionName: this.mission.name, parTime: this.mission.parTime });
  }

  private togglePause(): void {
    if (this.ended) return;
    this.paused = !this.paused;
    bus.emit('ui:paused', this.paused);
    audio.sfx('click', 0.3);
  }

  private returnToMenu(): void {
    this.scene.stop('Hud');
    this.scene.start('Menu');
  }

  private restartMission(): void {
    this.scene.stop('Hud');
    this.scene.restart({ missionId: this.mission.id, heroId: this.world.hero?.heroDef.id });
  }

  // ────────────────────────── HUD data ──────────────────────────

  getHudState(): HudState {
    const w = this.world;
    const hero = w.hero;
    const b = this.selection.building;
    const fps = this.fpsSamples.length > 0 ? 1000 / (this.fpsSamples.reduce((a, c) => a + c, 0) / this.fpsSamples.length) : 0;
    const abilities: HudAbilityView[] = hero
      ? hero.skillList.map((s) => ({
          id: s.id,
          key: s.key,
          name: s.name,
          cooldown: s.cooldown,
          cooldownLeft: hero.cooldowns[s.id] ?? 0,
          locked: hero.level < s.levelRequired,
          manaOk: hero.mana >= s.manaCost,
          manaCost: s.manaCost,
          requiredLevel: s.levelRequired,
        }))
      : [];
    return {
      gold: Math.floor(w.wallet.gold),
      wood: Math.floor(w.wallet.wood),
      mana: Math.floor(w.wallet.mana),
      popUsed: w.popUsed,
      popMax: w.popMax,
      elapsed: w.elapsed,
      wave: { index: this.ai ? this.waveIndexSafe() : 0, nextIn: Math.max(0, (this.ai?.nextWaveAtPublic ?? 0) - this.now) },
      hero: {
        present: !!hero,
        name: hero?.heroDef.name ?? '—',
        level: hero?.level ?? 0,
        hp: hero?.hp ?? 0,
        maxHp: hero?.maxHp ?? 0,
        mana: hero?.mana ?? 0,
        maxMana: hero?.maxMana ?? 0,
        xp: hero?.xp ?? 0,
        xpNext: this.xpNextOf(hero),
        respawn: this.production ? this.production.heroRespawnSeconds : 0,
        abilities,
      },
      selection: {
        units: this.selection.units.slice(0, 12).map((u) => ({ name: u.def.name, hp: u.hpRatio, maxHp: u.maxHp, role: u.def.role })),
        building: b
          ? {
              id: b.def.id,
              name: b.def.name,
              hp: b.hpRatio,
              maxHp: b.maxHp,
              building: b.building,
              construction: b.construction,
              produces: b.def.produces ?? [],
              queue: b.production.map((p) => ({ unitId: p.unitId, progress: 1 - p.timeLeft / p.total })),
            }
          : null,
        hasWorker: this.selection.units.some((u) => u.def.role === 'worker'),
        buildable: BUILD_ORDER.map((id) => {
          const def = BUILDINGS[id];
          const unlocked = def.unlockedAt === 'm01' || save.current.campaign.unlockedMissions.length > 1;
          return { id, name: def.name, cost: this.costText(def.cost), ok: unlocked && w.canAfford(def.cost) };
        }),
      },
      objectives: this.missions.objectives.map((o) => ({ text: o.def.text, state: o.state, progress: o.progress, total: o.total, optional: !!o.def.optional })),
      minimap: {
        units: w.units.map((u) => ({ x: u.x / WORLD_W, y: u.y / WORLD_H, team: u.team, hero: u.isHero })),
        buildings: w.buildings.map((bb) => ({ x: bb.x / WORLD_W, y: bb.y / WORLD_H, team: bb.team })),
      },
      paused: this.paused,
      ended: this.ended,
      fps,
      // pure progression view: relics + talents, excluding the per-run blessing
      relicLines: describeModifiers(buildModifiers(save.current.hero.relics, save.current.hero.talents)),
      boss: this.bossView(),
      feed: this.feed.slice(0, 5),
      workers: {
        total: this.automation.view.total,
        assigned: this.automation.view.assigned,
        mix: this.automation.view.mix,
        available: this.automation.view.available,
        autoWorker: this.automation.settings.autoWorker,
        autoProduction: this.automation.settings.autoProduction,
        autoAttack: this.automation.settings.autoAttack,
        autoRally: this.automation.settings.autoRally,
      },
      armies: this.armies.view.map((g) => ({ id: g.id, name: g.name, stance: g.stance, count: g.count })),
      adventure: {
        found: this.adventure.collected.length,
        remaining: this.adventure.remaining,
        events: this.mapEvents.view.map((e) => e.name),
        blessing: this.runBlessing ? `${this.runBlessing.name}：${this.runBlessing.desc}` : '',
      },
    };
  }

  private bossView(): HudState['boss'] {
    const boss = this.ai?.boss;
    if (!boss || boss.dead) return null;
    return {
      name: boss.def.name,
      hp: boss.hp,
      maxHp: boss.maxHp,
      phase: this.ai.bossPhase,
      visible: this.world.canSee(boss.x, boss.y, 1),
    };
  }

  /** Pushes a line into the combat feed (谁击杀了谁 / 技能命中 / Boss 动作). */
  pushFeed(text: string, kind: 'kill' | 'skill' | 'boss' | 'loss' = 'kill'): void {
    this.feed.unshift({ text, kind, age: 0 });
    if (this.feed.length > 6) this.feed.length = 6;
  }

  /** Boss death: staggered explosions, dust, screen shake and a short slow-motion beat. */
  private bossDeathCinematic(x: number, y: number): void {
    audio.sfx('bossRoar', 0.9);
    this.fx.shake(14, 0.7, 'ultimate');
    this.fx.scorch(x, y, 150, false);
    for (let i = 0; i < 7; i++) {
      this.time.delayedCall(i * 130, () => {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 90;
        this.fx.explosion(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, 70 + Math.random() * 50, false);
        audio.sfx('explosion', 0.5);
      });
    }
    this.time.delayedCall(500, () => {
      this.fx.explosion(x, y, 190, true);
      this.fx.levelUp(x, y);
    });
    // slow motion: the world keeps moving, just slower, then snaps back
    const prev = this.speed;
    this.speed = Math.min(prev, 0.35);
    this.time.delayedCall(1100, () => {
      this.speed = prev;
    });
  }

  /** GameCtx: every unit produced is routed through the automation/army-group pipeline. */
  onUnitProduced(unit: Unit): void {
    if (unit.isHero || unit.team !== 1) return;
    // "train N combat units" objectives count here. Forgetting this made mission 1 impossible
    // to finish even after the barracks produced a whole army.
    this.missions.onProduced(unit);
    this.automation.rallyNewUnit(unit);
  }

  /** GameCtx: deposits feed "gather N gold" objectives. */
  onResourceDeposited(kind: 'gold' | 'wood' | 'mana', amount: number): void {
    this.missions.onDeposit(kind, amount);
  }

  /** Boss push-in: zoom to the bible's boss value, hold on the boss, then hand control back. */
  private bossIntroCamera(): void {
    const boss = this.ai.boss;
    if (!boss) return;
    // a boss can appear in the same frame the match resolves (spawn -> killed by the last hit);
    // the victory camera owns the frame in that case
    if (this.ended || this.missions.victory) return;
    const cam = this.cameras.main;
    const prevZoom = cam.zoom;
    cam.stopFollow();
    cam.pan(boss.x, boss.y, CAMERA.boss.panMs, 'Sine.easeInOut', false);
    cam.zoomTo(CAMERA.boss.zoom, CAMERA.boss.panMs, 'Sine.easeInOut');
    bus.emit(EV.BANNER, { text: this.mission.boss.unitId ? 'Boss 现身' : '强敌现身', sub: '镜头推近 · 准备迎战' });
    this.time.delayedCall(CAMERA.boss.panMs + CAMERA.boss.holdMs, () => {
      // the match may have ended inside the hold window (a boss intro can be interrupted by
      // victory): restoring the camera then would fight the victory push-in
      if (this.ended) return;
      cam.zoomTo(prevZoom, 600, 'Sine.easeOut');
      const hero = this.world.hero;
      if (hero && !hero.dead) cam.startFollow(hero, true, CAMERA.battle.follow, CAMERA.battle.follow);
    });
  }

  /** Victory push-in: slow zoom toward the hero/castle, then hold (Visual Bible §12). */
  private victoryCamera(): void {
    const cam = this.cameras.main;
    // Phaser drives zoomTo/pan through Camera effects, NOT tweens, so `killTweensOf` does not
    // cancel them — a boss push-in that started in the same frame would sail past the victory
    // zoom and leave the camera at the boss value. Reset the effects explicitly.
    cam.zoomEffect?.reset();
    cam.panEffect?.reset();
    this.tweens.killTweensOf(cam);
    cam.stopFollow();
    const hero = this.world.hero;
    const focus = hero && !hero.dead ? { x: hero.x, y: hero.y } : this.map.playerStart;
    cam.pan(focus.x, focus.y, CAMERA.victory.panMs, 'Sine.easeInOut', false);
    cam.zoomTo(CAMERA.victory.zoom, CAMERA.victory.panMs, 'Sine.easeInOut');
  }

  /** Per-run random blessing. Map layout and main objectives never change. */
  private rollBlessing(): { id: string; name: string; desc: string } {
    const pool = [
      { id: 'blade', name: '锋刃祝福', desc: '本局所有单位攻击 +10%' },
      { id: 'swift', name: '疾风祝福', desc: '本局技能冷却 -10%' },
      { id: 'bulwark', name: '壁垒祝福', desc: '本局英雄与近战生命 +15%' },
      { id: 'harvest', name: '丰饶祝福', desc: '本局采集速度 +15%' },
      { id: 'march', name: '行军祝福', desc: '本局部队移动速度 +8%' },
    ];
    const rng = new Rng((Date.now() ^ (this.mission.index * 7919)) & 0xffffffff);
    return rng.pick(pool);
  }

  private blessingMods(id: string): Partial<typeof this.world.mods> {
    switch (id) {
      case 'blade':
        return { heroDamage: this.world.mods.heroDamage + 0.1 };
      case 'swift':
        return { cooldownMul: 0.9 };
      case 'bulwark':
        return { meleeHp: this.world.mods.meleeHp + 0.15 };
      case 'harvest':
        return { harvestRate: this.world.mods.harvestRate + 0.15 };
      case 'march':
        return { unitSpeed: this.world.mods.unitSpeed + 0.08 };
      default:
        return {};
    }
  }

  private waveIndexSafe(): number {
    return this.ai?.waveCount ?? 0;
  }

  private xpNextOf(hero: Hero | null): number {
    if (!hero) return 0;
    const table = [0, 120, 300, 560, 900, 1320, 1840, 2480, 3240, 4120];
    return table[Math.min(9, hero.level)] ?? table[9];
  }

  get currentSelection(): { units: Unit[]; building: Building | null; hero: Hero | null } {
    return { units: this.selection.units, building: this.selection.building, hero: this.world.hero };
  }

  get resourceNodes(): ResourceNode[] {
    return this.world.resources;
  }

  get isEnded(): boolean {
    return this.ended;
  }
}
