/**
 * 双语 / Bilingual text (Chinese source + English translation).
 *
 * Design: Chinese stays the source of truth in the code and data. `en()` maps the exact Chinese
 * string to English (with regex templates for the dynamic ones), and the three helpers render
 * both languages:
 *
 *   bi(text)      → "中文 · English"   (labels, one line; multi-line input is handled per line)
 *   biLines(text) → "中文\nEnglish"    (panels and cards, where a second line is affordable)
 *   en(text)      → English only       (for English-only surfaces such as the reference sheet)
 *
 * `bi()` is idempotent: if a string already contains its own English form (many data records are
 * authored as "中文 English"), it is returned unchanged, so wrapping a render helper is safe.
 *
 * tests/bilingual.mjs enforces coverage: every Chinese string literal under src/ must resolve
 * through this file (or be listed as an explicit exemption with a reason).
 */

/** Static translations, keyed by the exact Chinese source string. */
export const EN: Record<string, string> = {
  // bare stat words: the HUD composes them with values ("魔法伤害 +10%"), so the words themselves
  // must resolve for the numeric templates to apply
  魔法伤害: 'Magic damage',
  物理伤害: 'Physical damage',
  采集速度: 'Gathering speed',
  部队移动速度: 'Army movement speed',
  移动速度: 'Movement speed',
  近战单位生命: 'Melee unit HP',
  建筑生命: 'Building HP',
  英雄伤害: 'Hero damage',
  技能冷却: 'Skill cooldown',
  攻击力: 'Attack',
  暴击率: 'Crit chance',
  视野: 'Vision',
  遗物加成: 'Relic bonus',
  光照: 'Lighting',
  建造: 'building',
  闲置: 'idle',
  金: 'G',
  木: 'W',
  晶: 'M',
  攻: 'ATK',
  甲: 'ARM',
  合计: 'Total',
  背包: 'Inventory',
  天赋: 'Talents',
  发现: 'Discovered',
  经验: 'XP',
  宝箱: 'Chest',
  重分配: 'to rebalance',
  本局遗物加成: 'Relic bonuses this run',
  视野外: 'out of sight',
  阶段: 'Phase',
  自动重分配: 'auto-rebalanced',
  金币经验: 'gold / XP',
  声望: 'Renown',
  '　矿脉已耗尽': 'Mine exhausted',
  '　木材已耗尽': 'Timber exhausted',
  '14 秒内大幅提升自身射程、暴击与视野。': 'Massively boosts range, crit chance and vision for 14 seconds.',
  '6 秒内护甲大幅提升、免疫控制，并持续回复生命。': 'Big armour boost, control immunity and healing for 6 seconds.',
  '暗影森林': 'Dark Forest',
  '暗影森林 Dark Forest': 'Dark Forest',
  '暗影森林（薄雾、黄昏）': 'Dark Forest (mist, dusk)',
  '奥术': 'Arcane',
  '奥术法师': 'Arcane Mage',
  '奥术风暴': 'Arcane Storm',
  '白天': 'Day',
  '薄雾': 'Mist',
  '保有至少 3 座自己的金矿': 'Keep at least 3 gold mines of your own',
  '堡垒': 'Fortress',
  '暴': 'CRIT',
  '被荒野氏族囚禁的骑士。把他救出来。': 'A knight imprisoned by the Wildborn. Get him out.',
  '被囚的骑士': 'Captive Knight',
  '本局部队移动速度 +8%': 'Army movement +8% this run',
  '本局采集速度 +15%': 'Gathering +15% this run',
  '本局技能冷却 -10%': 'Skill cooldowns -10% this run',
  '本局没有掉落装备': 'No equipment dropped this run',
  '本局随机祝福': 'Run blessing',
  '本局所有单位攻击 +10%': 'All units +10% attack this run',
  '本局无遗物加成（通关可选目标可获得遗物）': 'No relic bonuses this run (clear optional objectives to earn relics)',
  '本局英雄与近战生命 +15%': 'Hero and melee +15% HP this run',
  '本作全部美术与音效均由代码程序化生成，不含任何第三方素材。': 'All art and audio in this game is generated procedurally in code — no third-party assets.',
  '壁垒祝福': 'Bulwark Blessing',
  '冰霜': 'Frost',
  '兵营': 'Barracks',
  '补给车': 'Supply Caravan',
  '补给车出发了，护送它到地图另一侧': 'The caravan has set out — escort it to the far side of the map',
  '补给箱': 'Supply Cache',
  '布料': 'Cloth',
  '布置陷阱，触发时减速并造成伤害。': 'Lay a trap that slows and damages whatever triggers it.',
  '部队移动速度 +4% / 级': 'Army movement +4% per rank',
  '部队移动速度 +6%。': 'Army movement +6%.',
  '采集 400 金币': 'Gather 400 gold',
  '采集金币与木材，并负责建造与修理建筑。': 'Gathers gold and wood and handles construction and repairs.',
  '采集速度 +12%。': 'Gathering +12%.',
  '采集速度 +8% / 级': 'Gathering +8% per rank',
  '操作说明：A 攻击移动 / H 驻守 / 1-5 编队 / Shift 队列': 'Controls: A attack-move / H hold / 1-5 groups / Shift to queue',
  '草地': 'Grass',
  '超出地图范围': 'Outside the map',
  '城堡不能倒塌': 'The castle must not fall',
  '城堡围城': 'Siege of the Castle',
  '持续 3 秒旋转斩击，对周围敌人反复造成伤害。': 'Spin for 3 seconds, repeatedly damaging nearby enemies.',
  '出 征 准 备': 'D E P L O Y M E N T',
  '传说它曾刺穿虚空潮汐本身。': 'Legend says it once pierced the Void Tide itself.',
  '纯防守。把金币变成塔和墙，撑过八分钟。': 'Pure defence. Turn gold into towers and walls and hold out for eight minutes.',
  '从棘齿巨兽骨架上取下。': 'Taken from Thornmaw\'s skeleton.',
  '摧毁敌方金矿营地': 'Destroy the enemy gold camp',
  '摧毁荒野氏族营地': 'Destroy the Wildborn camp',
  '摧毁矿场': 'Destroy the mine camp',
  '摧毁狼栏': 'Destroy the wolf pen',
  '摧毁两座虚空祭坛': 'Destroy two void altars',
  '摧毁三座氏族帐篷': 'Destroy three clan tents',
  '存档保存在浏览器 LocalStorage（战役进度 / 英雄等级 / 装备 / 天赋 / 遗物 / 设置）。': 'The save lives in browser LocalStorage (campaign progress / hero level / equipment / talents / relics / settings).',
  '戴上它，时间会变得慢一点。': 'Wear it and time slows a little.',
  '单人幻想即时战略 · 英雄成长 · Roguelite 遗物': 'Single-player fantasy RTS · hero progression · roguelite relics',
  '地面无法建造': 'Cannot build on this ground',
  '等级提升 · 属性成长': 'Level up · stat growth',
  '敌方主营': 'Enemy camps',
  '抵挡虚空潮汐的三波冲击': 'Survive three waves of the Void Tide',
  '第二幕 · 森林的盟约': 'Act II · The Forest Pact',
  '第三幕 · 虚空潮汐': 'Act III · Tide of the Void',
  '第一幕 · 绿谷的余火': 'Act I · Embers of the Green Valley',
  '点亮火把，集合部队…': 'Lighting the torches, mustering the army…',
  '盾牌冲锋': 'Shield Charge',
  '多重射击': 'Multi Shot',
  '发现隐藏目标': 'Hidden objective discovered',
  '法力': 'Mana',
  '法力不足': 'Not enough mana',
  '法师塔': 'Mage Tower',
  '返回': 'Back',
  '返回战役': 'Back to campaign',
  '返回主菜单': 'Back to main menu',
  '翡翠谷地': 'Emerald Valley',
  '废墟要塞': 'Ruined Fortress',
  '丰饶': 'Harvest',
  '丰饶遗物': 'Relic of Plenty',
  '丰饶祝福': 'Harvest Blessing',
  '风暴护符': 'Storm Amulet',
  '锋刃祝福': 'Blade Blessing',
  '钢铁意志': 'Iron Will',
  '格林谷地': 'Green Valley',
  '格林谷地的霸主。三个阶段：咆哮召唤狼群、践踏冲击波、狂暴冲刺。': 'Lord of the Green Valley. Three phases: a roar that summons wolves, stomp shockwaves, then an enraged charge.',
  '格林谷地是黎明王国最后的粮仓。荒野氏族在北侧扎营，虚空潮汐的痕迹已经出现在林地深处。': 'The Green Valley is the Dawn Kingdom\'s last granary. The Wildborn camp in the north, and the Void Tide has already reached the deep woods.',
  '格林谷地长大的猎人。她熟悉每一片林子，也熟悉怎么让巨兽在箭雨里流血至死。': 'A hunter raised in the Green Valley. She knows every grove — and how to bleed a great beast to death from inside an arrow storm.',
  '跟随英雄': 'Follow hero',
  '工坊': 'Workshop',
  '弓箭手': 'Archer',
  '攻城单位，对建筑造成巨额伤害，射速极慢。': 'Siege unit: enormous damage against buildings, very slow rate of fire.',
  '攻城器械必须存活': 'The siege engine must survive',
  '攻击移动：点击目标位置': 'Attack-move: click the target position',
  '攻速': 'ASPD',
  '关闭': 'Off',
  '关卡选择': 'Mission Select',
  '还没有战利品。通关会掉落装备（星级与 Boss 影响数量与品质）。': 'No trophies yet. Winning drops equipment (stars and bosses affect quantity and quality).',
  '黑暗堡垒': 'Ruined Fortress',
  '黑暗堡垒 Ruined Fortress': 'Ruined Fortress',
  '黑暗堡垒（灰烬、夜）': 'Ruined Fortress (ash, night)',
  '黑暗堡垒与远古巨龙': 'The Ruined Fortress and the Ancient Dragon',
  '厚重，但确实挡得住。': 'Heavy, but it holds.',
  '护符': 'Amulet',
  '护甲': 'Armour',
  '护送补给车抵达南门': 'Escort the caravan to the south gate',
  '护卫商队': 'Escort the caravan',
  '缓慢横移的全景，无震动': 'Slow panning vista, no shake',
  '唤醒远古战场的记忆…': 'Waking the memory of ancient battlefields…',
  '荒野劫掠者': 'Wildborn Raider',
  '荒野狼': 'Wild Wolf',
  '荒野猎手': 'Wildborn Hunter',
  '荒野萨满': 'Wildborn Shaman',
  '荒野氏族 Wildborn Clans': 'Wildborn Clans',
  '荒野氏族从营地出发': 'The Wildborn march out of their camp',
  '荒野氏族的近战劫掠者，成群冲锋。': 'Wildborn melee raider that charges in packs.',
  '荒野氏族的生产建筑，持续产出劫掠者。': 'Wildborn production building; keeps producing raiders.',
  '荒野氏族营地本部。摧毁它，Boss 就会现身。': 'The Wildborn camp proper. Destroy it and the boss shows himself.',
  '荒野图腾': 'Wildborn Totem',
  '黄昏': 'Dusk',
  '灰烬': 'Ash',
  '绘制王国的城堡与营地…': 'Painting the kingdom\'s castles and camps…',
  '火球术': 'Fireball',
  '火焰': 'Fire',
  '击败棘齿巨兽': 'Defeat Thornmaw',
  '击败远古巨龙': 'Defeat the Ancient Dragon',
  '疾风祝福': 'Swift Blessing',
  '棘齿巨兽': 'Thornmaw',
  '棘齿巨兽 Thornmaw': 'Thornmaw',
  '棘齿巨兽（森林巨兽 · 毒绿）': 'Thornmaw (forest beast · toxic green)',
  '技能': 'Skills',
  '继续上次进度': 'Continue',
  '继续战斗 (Esc)': 'Resume (Esc)',
  '坚守 8 分钟': 'Hold for 8 minutes',
  '建立前哨基地、训练部队、拔掉荒野氏族的据点。营地陷落时，这片谷地的主人会亲自现身。': 'Establish an outpost, train troops and pull out the Wildborn stronghold. When the camp falls, the valley\'s master shows himself.',
  '建造一座兵营': 'Build a barracks',
  '建筑尚未完工': 'Building not finished',
  '建筑生命 +8% / 级': 'Building HP +8% per rank',
  '剑刃上还留着不灭的余火。': 'The blade still carries an undying ember.',
  '剑士': 'Footman',
  '箭雨': 'Arrow Rain',
  '戒指': 'Ring',
  '金币': 'Gold',
  '金属': 'Metal',
  '近景': 'Foreground',
  '近战单位生命 +6% / 级': 'Melee unit HP +6% per rank',
  '近战坦克': 'Melee tank',
  '进度已保存到本地存档。': 'Progress saved to the local save file.',
  '进入战场时随机获得 1 个（Roguelite）': 'One is granted at random when the battle starts (roguelite)',
  '经济战。打断他们的收入，比堆兵更有效。': 'Economic warfare. Cutting their income beats stacking units.',
  '荆棘王冠': 'Thorn Crown',
  '静音': 'Mute',
  '镜头推近 · 准备迎战': 'Camera push-in · prepare for battle',
  '救出被囚禁的同伴': 'Rescue the imprisoned comrade',
  '巨兽现身': 'A great beast appears',
  '开启': 'On',
  '开始战役 · 翡翠谷地': 'Start Campaign · Emerald Valley',
  '可靠的前排近战单位，能扛住荒野氏族的冲锋。': 'A reliable frontline melee unit that can absorb the Wildborn charge.',
  '可挑战': 'Available',
  '可选：发现 3 处冒险地点': 'Optional: discover 3 adventure sites',
  '可选：发现 4 处冒险地点': 'Optional: discover 4 adventure sites',
  '可选：猎杀 4 只荒野野兽': 'Optional: hunt 4 wild beasts',
  '可选：猎杀 4 只林中野兽': 'Optional: hunt 4 forest beasts',
  '可选：猎杀 4 只虚空造物': 'Optional: hunt 4 void creatures',
  '可选：探索西南方的古老立石': 'Optional: explore the ancient standing stones to the south-west',
  '可选：占领一处魔法神龛': 'Optional: capture one mana shrine',
  '可选：占领中央魔法神龛': 'Optional: capture the central mana shrine',
  '可选：指挥官全程未阵亡': 'Optional: the commander never falls',
  '刻着谷地纹章的旧戒指。': 'An old ring engraved with the valley\'s crest.',
  '狼栏': 'Wolf Pen',
  '狼骑兵': 'Wolf Rider',
  '离资源点太近': 'Too close to a resource',
  '黎明': 'Dawn',
  '黎明城堡': 'Dawn Castle',
  '黎明王国 Dawn Kingdom': 'Dawn Kingdom',
  '黎明王国失落已久的王权甲。': 'The Dawn Kingdom\'s long-lost regalia.',
  '黎明王权': 'Dawn Regalia',
  '黎明之盾': 'Shield of Dawn',
  '烈焰精研': 'Pyromancy',
  '烈焰遗物': 'Relic of Flame',
  '林间之眼': 'Eye of the Grove',
  '鳞甲': 'Scale',
  '流浪商人': 'Wandering Merchant',
  '流浪学者': 'Wandering Scholar',
  '流浪学者：他愿意为你指路（揭示附近区域）': 'The scholar offers to guide you (reveals the surrounding map)',
  '绿谷': 'Green Valley',
  '绿谷 Green Valley': 'Green Valley',
  '绿谷（明亮草原）': 'Green Valley (bright grassland)',
  '落点会留下魔力水晶': 'The impact leaves mana crystals',
  '没有出入口': 'No entrance',
  '每个农庄提供 8 点人口上限（上限 60）。': 'Each farm adds 8 population cap (maximum 60).',
  '秘法': 'Arcane',
  '秘能之心': 'Heart of Arcana',
  '魔法': 'Magic',
  '魔法浮粒': 'Magic motes',
  '魔法伤害 +6% / 级': 'Magic damage +6% per rank',
  '魔法神龛': 'Mana Shrine',
  '魔法水晶': 'Mana Crystal',
  '木材': 'Wood',
  '目标时限': 'Time limit',
  '牧师': 'Cleric',
  '那个黄昏，苍穹裂开了。\n你带着残存的骑士团退回绿谷——而荒野深处的氏族正在集结。': 'That dusk, the sky tore open.\nYou fell back to the Green Valley with what is left of the knight order — and the clans deep in the wild are gathering.',
  '内部有微小的雷声。': 'Tiny thunder rumbles inside.',
  '农庄': 'Farm',
  '皮肉': 'Flesh',
  '破  晓  之  誓': 'O A T H   O F   D A W N',
  '破潮之矛': 'Tidepiercer',
  '骑乘冲锋的骑士，移动快、护甲高。': 'A mounted charger: fast and heavily armoured.',
  '骑狼的快速突击单位，专咬后排。': 'A fast wolf-mounted raider that goes for the back line.',
  '骑士指挥官': 'Knight Commander',
  '强敌现身': 'A powerful enemy appears',
  '清空存档并重置': 'Erase save and reset',
  '晴': 'Clear',
  '取消静音': 'Unmute',
  '圈养荒野狼。摧毁它可以阻止狼群增援。': 'Pens wild wolves. Destroy it to stop wolf reinforcements.',
  '让英雄去找他——他会给一件装备': 'Send your hero — he hands over a piece of equipment',
  '人口已满，先造农庄': 'Population capped — build a farm',
  '任务简报': 'Briefing',
  '日': 'Day',
  '入夜后的森林里到处都是伏击。视野受限，荒野狼会在暗处扑上来。': 'After dark the forest is all ambush. Vision is short and wolves lunge out of the dark.',
  '萨满的闪电会溅射，别让部队挤成一团。': 'Shaman lightning splashes — do not bunch your units up.',
  '森林': 'Forest',
  '森林会用伏击教你什么叫视野。': 'The forest teaches you what vision means, with ambushes.',
  '闪现': 'Blink',
  '设置': 'Settings',
  '设置与音频': 'Settings & Audio',
  '射手营地': 'Archery Range',
  '深入暗影森林，营救与被囚者': 'Deep into the Dark Forest: a rescue and a captive',
  '神圣守护': 'Divine Guard',
  '生产队列已满': 'Production queue is full',
  '生命': 'HP',
  '圣光': 'Holy',
  '胜  利': 'V I C T O R Y',
  '失踪的骑士': 'The Lost Knight',
  '石材': 'Stone',
  '石工': 'Masonry',
  '氏族营地': 'Clan Camp',
  '氏族帐篷': 'Clan Tent',
  '侍从骑士': 'Squire',
  '守望板甲': 'Warden Plate',
  '守卫基地': 'Guard base',
  '守卫塔': 'Watch Tower',
  '兽群迁徙': 'Beast Migration',
  '兽群正在向你的基地迁徙': 'A herd is migrating toward your base',
  '水晶': 'Mana',
  '水面': 'Water',
  '瞬间传送到目标位置，脱离危险或抢占高地。': 'Teleport instantly to escape danger or seize high ground.',
  '所有火焰与魔法技能伤害 +10%。': 'All fire and magic skill damage +10%.',
  '所有建筑生命 +10%。': 'All buildings +10% HP.',
  '所有近战单位生命 +8%。': 'All melee units +8% HP.',
  '它们会沿路攻击一切': 'They attack everything on the way',
  '塔盾': 'Tower Shield',
  '拓荒者': 'Settler',
  '提升周围友军 35% 攻击与 20% 移动速度，持续 9 秒。': 'Nearby allies gain 35% attack and 20% movement speed for 9 seconds.',
  '提示：多造农庄提高人口，沿路造塔，让英雄带着部队推进。': 'Tip: build farms for population, towers along the roads, and push with your hero leading the army.',
  '天降陨石': 'Meteor Shower',
  '通往南门的路上全是伏击。别让补给车停下。': 'The road to the south gate is full of ambushes. Do not let the caravan stall.',
  '投石车': 'Catapult',
  '突破虚空祭坛防线': 'Break through the void altar line',
  '突袭敌营': 'Raid the enemy camp',
  '退还全部天赋点（不损失进度）': 'Refund all talent points (no progress lost)',
  '王国': 'Kingdom',
  '王国的心脏。生产拓荒者、复活英雄、存放资源。被摧毁即战败。': 'The heart of the kingdom: trains settlers, revives the hero, stores resources. Lose it and you lose the battle.',
  '王国遗物': 'Relic of the Kingdom',
  '王国铸甲师的杰作。': 'The kingdom\'s master armourer\'s work.',
  '王国最后的骑士指挥官。他能扛住巨兽的正面冲击，也能用战吼把溃散的阵线重新凝聚起来。': 'The kingdom\'s last knight commander. He takes a great beast head-on, and his war cry regroups a broken line.',
  '为附近氏族单位提供治疗光环，并会施放闪电。': 'Heals nearby clan units and casts lightning.',
  '为英雄铸造铠甲与旗帜…': 'Forging armour and banners for the heroes…',
  '未解锁': 'Locked',
  '未选中任何单位': 'Nothing selected',
  '未知技能': 'Unknown skill',
  '未装备（战利品可在「英雄/装备」里装上）': 'Nothing equipped (loot can be equipped in Heroes / Equipment)',
  '无': 'None',
  '无法建造：': 'Cannot build: ',
  '无法施放': 'Cannot cast',
  '武器': 'Weapon',
  '物理': 'Physical',
  '先通关上一关': 'Clear the previous mission first',
  '陷阱': 'Trap',
  '向目标方向冲锋，撞开沿途敌人并造成伤害。': 'Charge toward the target, knocking enemies aside and dealing damage.',
  '橡木指环': 'Oak Ring',
  '消灭林中伏兵': 'Destroy the forest ambushers',
  '消灭沿途伏击者': 'Destroy the ambushers along the way',
  '卸下': 'Unequip',
  '新兵的第一把武器。': 'A recruit\'s first weapon.',
  '行军祝福': 'March Blessing',
  '虚空': 'Void',
  '虚空暗影': 'Void Shade',
  '虚空潮汐': 'Tide of the Void',
  '虚空潮汐的先知，会召唤护盾与暗影新星。': 'Prophet of the Void Tide; summons shields and shadow novas.',
  '虚空潮汐的源头之一，俯冲与龙息能瞬间清空一整条战线。': 'One of the sources of the Void Tide; a dive and a breath can clear an entire battle line.',
  '虚空祭坛': 'Void Altar',
  '虚空裂隙': 'Void Rift',
  '虚空裂隙涌出了暗影！': 'Shadows pour out of the void rift!',
  '虚空侵蚀产生的暗影战士，攻击带魔法伤害。': 'Shadow warriors born of void corruption; their attacks deal magic damage.',
  '虚空巫师 Void Sorcerer': 'Void Sorcerer',
  '虚空巫师（紫 · 电蓝）': 'Void Sorcerer (purple · electric blue)',
  '虚空巫妖': 'Void Lich',
  '虚空印记': 'Void Sigil',
  '虚空族 Voidborn': 'Voidborn',
  '虚空族把破碎的要塞改造成祭坛。 Ancient Dragon 在最高塔之上盘旋。': 'The Voidborn turned the broken fortress into an altar. The Ancient Dragon circles above the highest tower.',
  '虚空族的核心建筑，不断召唤暗影战士。': 'Voidborn core building; keeps summoning shades.',
  '虚空族第一次露面。他们的法术会溅射，散开队形。': 'The Voidborn appear for the first time. Their spells splash — spread your formation.',
  '需要护送的补给车。它自己不会战斗。': 'A supply caravan to escort. It cannot fight.',
  '旋风斩': 'Whirlwind',
  '选择出征英雄': 'Choose your hero',
  '选择此英雄': 'Select this hero',
  '雪': 'Snow',
  '训练 4 名战斗单位': 'Train 4 combat units',
  '训练短剑': 'Training Sword',
  '训练弓箭手。远程火力是消灭萨满与巨兽的关键。': 'Train archers. Ranged fire is the key to killing shamans and great beasts.',
  '训练近战步兵。第一座兵营是任何战术的起点。': 'Train melee infantry. The first barracks is where every strategy starts.',
  '训练牧师，并用法术飞弹溅射敌人。需要魔法水晶。': 'Train clerics to splash enemies with magic bolts. Requires mana crystals.',
  '研究虚空潮汐本质的学者。她的爆炸法术能在一瞬间抹掉一整队劫掠者，前提是别让她被碰到。': 'A scholar studying the nature of the Void Tide. Her explosions erase a whole raider squad — as long as nothing touches her.',
  '夜': 'Night',
  '一次射出多支箭矢，覆盖扇形区域。': 'Fires several arrows in a spread.',
  '一名流浪商人出现在地图上': 'A wandering merchant has appeared on the map',
  '遗物密室': 'Relic Vault',
  '已静音': 'Muted',
  '已取消攻击移动': 'Attack-move cancelled',
  '已选择': 'Selected',
  '已暂停': 'Paused',
  '已装备': 'Equipped',
  '音乐音量': 'Music volume',
  '音效音量': 'SFX volume',
  '隐藏：发现 3 处冒险地点': 'Hidden: discover 3 adventure sites',
  '隐藏：发现 4 处冒险地点': 'Hidden: discover 4 adventure sites',
  '隐藏：猎杀 3 只荒野野兽': 'Hidden: hunt 3 wild beasts',
  '隐藏：猎杀 4 只荒野野兽': 'Hidden: hunt 4 wild beasts',
  '隐藏：猎杀 5 只野兽': 'Hidden: hunt 5 beasts',
  '隐藏：猎杀 6 只虚空造物': 'Hidden: hunt 6 void creatures',
  '隐藏：猎杀森林巨兽': 'Hidden: hunt the forest beast',
  '英魂遗物': 'Relic of Heroes',
  '英雄 · 装备 · 天赋 · 遗物': 'Heroes · Equipment · Talents · Relics',
  '英雄 / 装备 / 遗物': 'Heroes / Equipment / Relics',
  '英雄护卫': 'Hero escort',
  '英雄伤害 +12%。': 'Hero damage +12%.',
  '英雄伤害 +8% / 级': 'Hero damage +8% per rank',
  '英雄已阵亡': 'Hero has fallen',
  '英雄之力': 'Heroic Might',
  '鹰眼': 'Eagle Eye',
  '营救骑士并护送回城堡': 'Rescue the knight and escort him home',
  '营救英雄': 'Rescue the hero',
  '用投石车砸开祭坛。虚空巫妖会阻止你。': 'Smash the altars with the catapult. The Void Lich will try to stop you.',
  '游荡在森林里的野兽，扑击速度快。': 'A beast that roams the forest; its lunge is fast.',
  '游侠': 'Ranger',
  '右键移动与攻击 · 左键拖动框选 · 空格回到英雄': 'Right-click to move and attack · drag to box-select · Space centres on the hero',
  '余烬之刃': 'Ember Blade',
  '与其他建筑重叠': 'Overlaps another building',
  '雨': 'Rain',
  '远程法术 AOE': 'Ranged caster / AoE',
  '远程军': 'Ranged corps',
  '远程输出': 'Ranged damage',
  '远程输出，脆但能在城墙后持续消耗敌人。': 'Ranged damage: fragile, but grinds enemies down behind walls.',
  '远古巨龙': 'Ancient Dragon',
  '远古巨龙 Ancient Dragon': 'Ancient Dragon',
  '远古巨龙（深绯红 · 黑 · 金）': 'Ancient Dragon (deep crimson · black · gold)',
  '远景': 'Background',
  '陨石': 'Meteor',
  '陨石正在坠落，避开落点！': 'A meteor is falling — clear the impact zone!',
  '再打一次': 'Play again',
  '在暗影森林里找到他——然后活着带他回来。': 'Find him in the Dark Forest — then bring him back alive.',
  '在目标区域降下持续箭雨。': 'Rain arrows on the target area.',
  '在目标区域召唤奥术风暴，持续造成伤害。': 'Summon an arcane storm that keeps damaging the target area.',
  '在远处放箭的荒野猎手，注意先手点掉。': 'A Wildborn hunter that shoots from range — pick him off first.',
  '占领后每秒提供魔法水晶。': 'Once captured, produces mana every second.',
  '占领两处魔法神龛': 'Capture two mana shrines',
  '占领森林': 'Claim the Forest',
  '战  败': 'D E F E A T',
  '战场': 'Battlefield',
  '战吼': 'War Cry',
  '战旗': 'Banner',
  '战旗遗物': 'Relic of the Banner',
  '战士遗物': 'Relic of the Warrior',
  '战阵': 'Battle Array',
  '找到失踪骑士的营地': 'Find the lost knight\'s camp',
  '召唤陨石轰击目标区域，造成巨额范围伤害。': 'Call down a meteor for massive area damage.',
  '正在唤醒战场…': 'Waking the battlefield…',
  '指挥官已阵亡，正在复活': 'The commander has fallen and is respawning',
  '指挥官阵亡，30 秒后复活': 'The commander has fallen — respawning in 30s',
  '制造投石车。攻城利器，但需要保护。': 'Build catapults. Great against buildings, but they need protection.',
  '治疗附近友军，并对亡灵造成额外伤害。': 'Heals nearby allies and deals extra damage to undead.',
  '掷出火球，命中后爆炸并点燃范围内敌人。': 'Hurl a fireball that explodes and burns enemies in the area.',
  '中景': 'Midground',
  '中立野兽 Neutral Wildlife': 'Neutral Wildlife',
  '重建前哨，学会带兵': 'Rebuild the outpost, learn to command',
  '重开本关': 'Restart mission',
  '主动出击。拆掉他们的生产建筑，狼群就没有增援。': 'Attack first. Destroy their production and the wolves get no reinforcements.',
  '主力军': 'Main force',
  '驻守此处': 'Hold position',
  '装备': 'Equip',
  '装备（点击卸下）': 'Equipment (click to unequip)',
  '姿态': 'Stance',
  '资源不足，无法训练 ': 'Not enough resources to train ',
  '资源不足：': 'Not enough resources: ',
  '自动攻击范围内敌人。沿路造塔能极大减轻防守压力。': 'Automatically attacks enemies in range. Towers along the roads take the pressure off.',
  '自动集结': 'Rally',
  '自动进攻': 'Attack',
  '自动农民': 'Worker',
  '自动生产': 'Production',
  '自然': 'Nature',
  '最后一战。巨龙不会被城墙挡住。': 'The last battle. A dragon is not stopped by walls.',
  '最终 Boss': 'Final boss',
  '左键框选 · 右键移动/攻击 · A 攻击移动 · S 停止 · H 驻守 · QWER 技能 · 1-5 编队 · 滚轮缩放 · Esc 暂停': 'Drag to box-select · right-click to move/attack · A attack-move · S stop · H hold · QWER skills · 1-5 groups · wheel zoom · Esc pause',
  'Boss 竞技场': 'Boss Arena',
  'Boss 现身': 'BOSS APPEARS',
  'D A W N W A K E   ·   黎 明 觉 醒': 'D A W N W A K E   ·   O A T H   O F   D A W N',
  'THORNMAW · 棘齿巨兽': 'THORNMAW',
};

/** Templates for strings that embed numbers or names. Checked after the exact-match table. */
export const EN_TPL: Array<[RegExp, string]> = [
  [/^第[\s\u3000]+(\d+)[\s\u3000]+波进攻[\s\u3000]+\((\d+)[\s\u3000]+单位\)$/, 'Wave $1 ($2 units)'],
  [/^(\d+)[\s\u3000]+级解锁$/, 'Unlocks at level $1'],
  [/^(\d+)[\s\u3000]+秒后复活$/, 'Respawns in $1s'],
  [/^(\d+)[\s\u3000]+秒内/, '$1 seconds: '],
  [/^冷却[\s\u3000]+([\d.]+)s$/, 'CD $1s'],
  [/^法力[\s\u3000]+(\d+)$/, 'Mana $1'],
  [/^(\d+)[\s\u3000]+法力$/, '$1 mana'],
  [/^花费[\s\u3000]+(\d+)[\s\u3000]+金$/, '$1 gold'],
  [/^(\d+)[\s\u3000]+金$/, '$1 gold'],
  [/^(\d+)[\s\u3000]+木$/, '$1 wood'],
  [/^(\d+)[\s\u3000]+晶$/, '$1 mana'],
  [/^人口[\s\u3000]+(\d+)\/(\d+)$/, 'Pop $1/$2'],
  [/^用时[\s\u3000]+(.+)$/, 'Time $1'],
  [/^目标[\s\u3000]+(.+)$/, 'Target $1'],
  [/^用时[\s\u3000]+([\d:]+)[\s\u3000]+\/[\s\u3000]+目标[\s\u3000]+([\d:]+)$/, 'Time $1 / target $2'],
  [/^已完成[\s\u3000]+(\d+)\/(\d+)$/, 'Progress $1/$2'],
  [/^队列[\s\u3000]+(\d+)\.[\s\u3000]+(.+?)[\s\u3000]+(\d+)%$/, 'Queue $1. $2 $3%'],
  [/^可挑战[\s\u3000]+(.+)$/, 'Available: $1'],
  [/^(\d+)[\s\u3000]+座$/, '$1 camps'],
  [/^强度[\s\u3000]+([\d\/]+)$/, 'strength $1'],
  [/^已发现[\s\u3000]+(\d+)$/, 'found $1'],
  [/^剩余[\s\u3000]+(\d+)$/, 'left $1'],
  [/^(\d+)[\s\u3000]+分钟$/, '$1 min'],
  [/^(\d+)[\s\u3000]+次$/, '$1 times'],
  [/^护甲[\s\u3000]+([\d.]+)$/, 'Armor $1'],
  [/^HP[\s\u3000]+([\d.]+)[\s\u3000]+\/[\s\u3000]+攻[\s\u3000]+([\d.]+)[\s\u3000]+\/[\s\u3000]+甲[\s\u3000]+([\d.]+)$/, 'HP $1 / ATK $2 / ARM $3'],
  [/^金[\s\u3000]+([\d.]+)[\s\u3000]+木[\s\u3000]+([\d.]+)[\s\u3000]+晶[\s\u3000]+([\d.]+)$/, 'Gold $1 Wood $2 Mana $3'],
  [/^([\d.]+)[\s\u3000]+\/[\s\u3000]+([\d.]+)[\s\u3000]+\/[\s\u3000]+([\d.]+)$/, '$1 / $2 / $3'],

  // ── line-level templates: biAuto() translates multi-line labels one line at a time ──
  [/^工人 (\d+)[\s\u3000]*金 (\d+) 木 (\d+) 晶 (\d+)(.*)$/, 'Workers $1 · G$2 W$3 M$4 $5'],
  [/^配比 金([\d.]+) 木([\d.]+) 晶([\d.]+)\s*(.*)$/, 'Mix G$1 W$2 M$3  $4'],
  [/^合计：攻 \+(\d+)[\s\u3000]*甲 \+(\d+)[\s\u3000]*生命 \+(\d+)[\s\u3000]*法力 \+(\d+)$/, 'Total: ATK +$1 ARM +$2 HP +$3 Mana +$4'],
  [/^暴击 \+(\d+)%[\s\u3000]*攻速 \+(\d+)%[\s\u3000]*技能 \+(\d+)%$/, 'Crit +$1% Aspd +$2% Skills +$3%'],
  [/^暴击 \+(\d+)%[\s\u3000]*攻速 \+(\d+)%[\s\u3000]*技能 \+(\d+)$/, 'Crit +$1% Aspd +$2% Skills +$3'],

  // ── composed HUD / panel rows found by tests/bilingual.mjs ──
  [/^(\d+)级解锁$/, 'Unlocks at level $1'],
  [/^(\d+)[\s\u3000]+级解锁$/, 'Unlocks at level $1'],
  [/^已选中[\s\u3000]+(\d+)[\s\u3000]+个单位$/, '$1 selected'],
  [/^未选中任何单位$/, 'Nothing selected'],
  [/^本地存档：通关[\s\u3000]+(\d+)\/(\d+)[\s\u3000]+场[\s\u3000]+·[\s\u3000]+英雄等级[\s\u3000]+(\d+)[\s\u3000]+·[\s\u3000]+遗物[\s\u3000]+(\d+)$/, 'Local save: $1/$2 cleared · Hero level $3 · Relics $4'],
  [/^战役[\s\u3000]+·[\s\u3000]+三幕十关\s*已通关[\s\u3000]+(\d+)\/(\d+)$/, 'Campaign · three acts, ten missions · $1/$2 cleared'],
  [/^(.+)\s+(重建前哨，学会带兵|深入暗影森林，营救与被囚者|黑暗堡垒与远古巨龙)$/, '$1 · $2'],
  [/^武器：(.+)$/, 'Weapon: $1'],
  [/^护甲：(.+)$/, 'Armour: $1'],
  [/^戒指：(.+)$/, 'Ring: $1'],
  [/^护符：(.+)$/, 'Amulet: $1'],
  [/^—[\s\u3000]+空[\s\u3000]+—$/, '— empty —'],
  [/^合计：攻 \+(\d+) 甲 \+(\d+) 生命 \+(\d+) 法力 \+(\d+) 暴击 \+(\d+)% 攻速 \+(\d+)% 技能 \+(\d+)$/,
    'Total: ATK +$1 ARM +$2 HP +$3 Mana +$4 Crit +$5% Aspd +$6% Skills +$7'],
  [/^背包（(\d+)[\s\u3000]+件）$/, 'Inventory ($1 items)'],
  [/^天赋（剩余[\s\u3000]+(\d+)[\s\u3000]+点）$/, 'Talents ($1 points left)'],
  [/^遗物（(\d+)\/(\d+)）$/, 'Relics ($1/$2)'],
  [/^音乐音量：(\d+)%$/, 'Music volume: $1%'],
  [/^音效音量：(\d+)%$/, 'SFX volume: $1%'],
  [/^总开关：(.+)$/, 'Everything: $1'],
  [/^(\d+)[\s\u3000]+分钟（越快星级越高）$/, '$1 minutes (faster clears earn more stars)'],
  [/^(\d+)[\s\u3000]+座（强度[\s\u3000]+([\d\/]+)）$/, '$1 camp(s), strength $2'],
  [/^光照：(\S+)$/, 'Lighting: $1'],
  [/^等级[\s\u3000]+(\d+)$/, 'Level $1'],
  [/^出征[\s\u3000]+·[\s\u3000]+(.+)$/, 'Deploy · $1'],
  [/^工人 (\d+) 金 (\d+) 木 (\d+) 晶 (\d+)\s*配比 金([\d.]+) 木([\d.]+) 晶([\d.]+)\s*−\/\+ 重分配$/,
    'Workers $1 · G$2 W$3 M$4 · mix $5/$6/$7 (−/+ to rebalance)'],
  [/^冒险：已发现[\s\u3000]+(\d+)[\s\u3000]+剩余[\s\u3000]+(\d+)\s*(.*)$/, 'Adventure: $1 found · $2 left · $3'],
  // worker panel: "工人 4 金 3 木 0 晶 0 [闲置 1] [建造 3] 配比 金0.7 木0.3 晶0 −/+ 重分配"
  [/^工人 (\d+) 金 (\d+) 木 (\d+) 晶 (\d+)([\s\S]*?)配比 金([\d.]+) 木([\d.]+) 晶([\d.]+)\s*−\/\+ 重分配$/,
    'Workers $1 · G$2 W$3 M$4 · mix $6/$7/$8 (−/+ to rebalance)$5'],
  // combat feed lines
  [/^发现\s*(.+?)\s*（\+(\d+)\s*金\s*\/\s*\+(\d+)\s*经验）$/, 'Discovered $1 (+$2 gold / +$3 XP)'],
  [/^发现[\s\u3000]+(.+)$/, 'Discovered $1'],
  [/^(.+?)\s*被击败$/, '$1 defeated'],
  [/^(.+?)\s*被摧毁$/, '$1 destroyed'],
  [/^(\d+)[\s\u3000]+(主力军|远程军|英雄护卫)[\s\u3000]+(\d+)$/, '$1 $2 $3'],
  [/^([✔✘])\s*(.+)$/, '$1 $2'],
  // objective rows in their DONE / FAILED state carry a ✔ / ✘ marker with a progress counter —
  // only the active (▶) and pending (·) markers had templates, so finished objectives rendered
  // Chinese-only in the finished panel
  [/^([✔✘]) (.+?) \((\d+)\/(\d+)\)$/, '$1 $2 ($3/$4)'],
  [/^([✔✘]) (.+)$/, '$1 $2'],
  // boss bar
  [/^(.+?)（视野外）$/, '$1 (out of sight)'],
  [/^视野外$/, 'out of sight'],
  [/^阶段 (\d+) \/ (\d+)$/, 'Phase $1 / $2'],
  // result panel lines (composed from counters, so they need templates)
  [/^完成任务：(\d+)[\s\u3000]*可选完成：(\d+)[\s\u3000]*失败：(\d+)$/, 'Main $1 · Optional $2 · Failed $3'],
  [/^获得金币：(\d+)[\s\u3000]*英雄经验：(\d+)[\s\u3000]*遗物：(.+)$/, 'Gold $1 · Hero XP $2 · Relic $3'],
  [/^获得金币：(\d+)[\s\u3000]*英雄经验：(\d+)$/, 'Gold $1 · Hero XP $2'],
  [/^战利品：(.+?)（可在「英雄 \/ 装备」里换上）$/, 'Loot: $1 (equip it in Heroes / Equipment)'],
  [/^战利品：(.+)$/, 'Loot: $1'],
  [/^用时 ([\d:]+) \/ 目标 ([\d:]+)$/, 'Time $1 / target $2'],

  // Generic "+N%" modifier lines ("魔法伤害 +10%"). Safe as a catch-all because the engine refuses
  // a template whose captured group it cannot translate, so it only fires when the Chinese prefix
  // is known.
  [/^(.+?) \+(\d+(?:\.\d+)?)%$/, '$1 +$2%'],
  [/^(.+?) \+(\d+(?:\.\d+)?)$/, '$1 +$2'],
  [/^(\d+)[\s\u3000]+金[\s\u3000]+(\d+)[\s\u3000]+木[\s\u3000]+(\d+)[\s\u3000]+晶$/, 'G$1 W$2 M$3'],
  [/^近战坦克[\s\u3000]+等级[\s\u3000]+(\d+)$/, 'Melee tank · level $1'],
  [/^远程输出[\s\u3000]+等级[\s\u3000]+(\d+)$/, 'Ranged damage · level $1'],
  [/^远程法术[\s\u3000]+AOE[\s\u3000]+等级[\s\u3000]+(\d+)$/, 'Ranged caster / AoE · level $1'],
  [/^战阵·(.+)[\s\u3000]+(\d+)\/(\d+)$/, 'Battle · $1 $2/$3'],
  [/^秘法·(.+)[\s\u3000]+(\d+)\/(\d+)$/, 'Arcane · $1 $2/$3'],
  [/^王国·(.+)[\s\u3000]+(\d+)\/(\d+)$/, 'Kingdom · $1 $2/$3'],
  [/^○[\s\u3000]+(.+)[\s\u3000]+—[\s\u3000]+(.+)$/, '$1 — $2'],
  [/^▶[\s\u3000]+(.+?)[\s\u3000]+\((\d+)\/(\d+)\)$/, '$1 ($2/$3)'],
  [/^·[\s\u3000]+(.+?)[\s\u3000]+\((\d+)\/(\d+)\)$/, '$1 ($2/$3)'],
  [/^▶[\s\u3000]+(.+)$/, '$1'],
  [/^·[\s\u3000]+(.+)$/, '$1'],
  [/^可选：(.+)$/, 'Optional: $1'],
  [/^隐藏：(.+)$/, 'Hidden: $1'],
];

/** Chinese→English lookups for the parts of a joined string (e.g. "名字 · 称号"). */
const JOINERS = [' · ', ' — ', '　', ' / ', '：', '、'];

/**
 * Composite rule: a string joined from parts we can each translate ("骑士指挥官 · 黎明之盾") is
 * translated part by part. This is what keeps menu cards and stat lines bilingual without an
 * entry for every possible combination.
 */
function enComposite(text: string, depth: number): string {
  if (depth > 2) return '';
  for (const j of JOINERS) {
    if (!text.includes(j)) continue;
    const parts = text.split(j);
    if (parts.length < 2) continue;
    const done = parts.map((p) => {
      const t = p.trim();
      if (!t) return '';
      if (!/[\u4e00-\u9fa5]/.test(t)) return t;
      return enDepth(t, depth + 1);
    });
    if (done.every((d) => d !== '')) {
      // English punctuation: the composite rule must not carry a full-width colon into English
      const sep = j === '：' ? ': ' : j === '、' ? ', ' : j.trim() === '' ? ' ' : j;
      return done.join(sep);
    }
  }
  return '';
}

/** English for a Chinese string, or '' when there is no translation. */
export function en(text: string): string {
  return enDepth(text, 0);
}

function enDepth(text: string, depth: number): string {
  if (!text) return '';
  const exact = EN[text];
  if (exact) return exact;
  for (const [re, rep] of EN_TPL) {
    const m = text.match(re);
    if (!m) continue;
    // Resolve any captured group that is still Chinese (e.g. "▶ 采集 400 金币 (0/400)" captures the
    // objective text, "武器：— 空 —" captures the slot value) before applying the template.
    const groups = [...m];
    let ok = true;
    for (let i = 1; i < groups.length; i++) {
      const g = groups[i];
      if (g === undefined || !/[\u4e00-\u9fa5]/.test(g)) continue;
      const e2 = enDepth(g.trim(), depth + 1);
      if (!e2) {
        ok = false;
        break;
      }
      groups[i] = e2;
    }
    if (!ok) continue;
    const out = rep.replace(/\$(\d)/g, (_, n) => groups[Number(n)] ?? '');
    if (!/[\u4e00-\u9fa5]/.test(out)) return out;
  }
  const comp = enComposite(text, depth);
  if (comp) return comp;
  // token level fallback: replace any run of CJK that we do know
  const tokens = text.match(/[\u4e00-\u9fa5]+/g);
  if (tokens) {
    let out = text;
    let replaced = false;
    for (const t of tokens) {
      const key = t.trim();
      const e2 = EN[key] ?? EN[key.replace(/\s+/g, ' ')];
      if (e2) {
        out = out.replace(t, e2);
        replaced = true;
      }
    }
    if (replaced && !/[\u4e00-\u9fa5]/.test(out)) return out;
  }
  return '';
}

export function hasEn(text: string): boolean {
  return en(text) !== '';
}

/**
 * Words that are English but appear inside Chinese game copy ("Boss 现身", "Roguelite 遗物"), so
 * their presence must NOT be read as "this string is already bilingual".
 */
const LATIN_IN_CHINESE = new Set(['boss', 'roguelite', 'aoe', 'hp', 'atk', 'arm', 'dps', 'xp', 'ai', 'npc', 'mvp', 'rts', 'ui', 'hud', 'ceo']);

/**
 * Already bilingual? Needed because labels pass through more than one layer (a Button caption is
 * wrapped by the constructor, then again by setLabel/setText), and wrapping twice must be a no-op
 * rather than appending the English a second time.
 */
export function looksBilingual(text: string): boolean {
  if (!/[\u4e00-\u9fa5]/.test(text)) return false;
  // normal words, ignoring the ones that legitimately sit inside Chinese copy
  const words = text.match(/[A-Za-z]{2,}/g) ?? [];
  if (words.some((w) => w.length >= 3 && !LATIN_IN_CHINESE.has(w.toLowerCase()))) return true;
  // letter-spaced display type: "D A W N W A K E"
  return /(?:\b[A-Za-z]\s+){3,}[A-Za-z]\b/.test(text);
}

/** "中文 · English" — labels and one-line UI. Multi-line input is handled per line. */
export function bi(text: string, sep = ' · '): string {
  if (!text) return text;
  if (looksBilingual(text)) return text; // already carries both languages: never append again
  const whole = en(text);
  if (text.includes('\n')) {
    // a multi-line block with its own entry (loading lore) is translated as a block: Chinese lines
    // first, then the English block, instead of interleaving line by line
    if (whole) return `${text}\n${whole}`;
    return text
      .split('\n')
      .map((line) => bi(line, sep))
      .join('\n');
  }
  const e = en(text);
  if (!e) return text;
  // idempotent: data records are often authored as "中文 English" already
  if (text.includes(e)) return text;
  // symbols/numbers only
  if (!/[\u4e00-\u9fa5]/.test(text)) return text;
  return `${text}${sep}${e}`;
}

/** "中文\nEnglish" — panels and cards where a second line is affordable. */
export function biLines(text: string): string {
  if (!text) return text;
  if (looksBilingual(text)) return text; // idempotent, same reason as bi()
  const whole = en(text);
  if (whole) return text.includes(whole) ? text : `${text}\n${whole}`;
  if (text.includes('\n')) {
    return text
      .split('\n')
      .map((line) => biLines(line))
      .join('\n');
  }
  if (!/[\u4e00-\u9fa5]/.test(text)) return text;
  return text;
}

/**
 * Picks the right shape automatically: short labels stay on one line ("兵营 · Barracks"), while
 * sentences and long descriptions get their own second line, because inlining a full Chinese
 * sentence with its English would overflow every panel in the game.
 */
export function biAuto(text: string): string {
  if (!text) return text;
  if (looksBilingual(text)) return text; // idempotent: this is the entry point everything uses
  if (text.includes('\n')) {
    // A multi-line block that has its own dictionary entry (the loading lore) is translated as a
    // whole, keeping the two languages in separate blocks; otherwise it is a stack of independent
    // labels (HUD panels) and each line is resolved on its own.
    if (en(text)) return biLines(text);
    return text
      .split('\n')
      .map((l) => biAuto(l))
      .join('\n');
  }
  const e = en(text);
  if (!e) return text;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const long = cjk > 16 || /。|，|；|！|\.$/.test(text) || text.length > 26;
  return long ? biLines(text) : bi(text);
}

/** A bilingual name pair from a data record (falls back to the Chinese name). */
export function biName(cn: string, alreadyEn?: string): string {
  if (alreadyEn) return `${cn} · ${alreadyEn}`;
  const e = en(cn);
  return e ? `${cn} · ${e}` : cn;
}
