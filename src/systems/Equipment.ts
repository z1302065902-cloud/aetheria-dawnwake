import { ITEMS, itemById } from '../data/items';
import type { ItemDef } from '../data/types';
import type { Hero } from '../world/Hero';
import type { SaveData } from '../core/SaveManager';

export type EquipSlot = 'weapon' | 'armor' | 'ring' | 'amulet';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'ring', 'amulet'];
export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: '武器',
  armor: '护甲',
  ring: '戒指',
  amulet: '护符',
};

export interface EquipTotals {
  attack: number;
  armor: number;
  hp: number;
  mana: number;
  crit: number;
  attackSpeed: number;
  skillDamage: number;
}

export interface HeroSheet {
  slots: Array<{ slot: EquipSlot; label: string; item: ItemDef | null }>;
  inventory: ItemDef[];
  totals: EquipTotals;
}

const emptyTotals = (): EquipTotals => ({ attack: 0, armor: 0, hp: 0, mana: 0, crit: 0, attackSpeed: 0, skillDamage: 0 });

/** Everything the hero screen needs to render equipment + inventory in one call. */
export function heroSheet(save: SaveData): HeroSheet {
  const equipment = save.hero.equipment ?? {};
  const slots = EQUIP_SLOTS.map((slot) => {
    const id = equipment[slot];
    return { slot, label: SLOT_LABEL[slot], item: id ? (itemById(id) ?? null) : null };
  });
  const totals = emptyTotals();
  for (const s of slots) {
    if (!s.item) continue;
    for (const [k, v] of Object.entries(s.item.stats)) {
      totals[k as keyof EquipTotals] += v ?? 0;
    }
  }
  const inventory = (save.hero.inventory ?? []).map((id) => itemById(id)).filter((i): i is ItemDef => !!i);
  return { slots, inventory, totals };
}

/** Applies the equipped items to a hero instance at match start. */
export function applyEquipmentToHero(hero: Hero, save: SaveData): EquipTotals {
  const sheet = heroSheet(save);
  hero.equipment.attack = sheet.totals.attack;
  hero.equipment.armor = sheet.totals.armor;
  hero.equipment.crit = sheet.totals.crit;
  hero.equipment.skillDamage = sheet.totals.skillDamage;
  hero.equipment.attackSpeed = sheet.totals.attackSpeed;
  hero.equipment.hp = sheet.totals.hp;
  hero.equipment.mana = sheet.totals.mana;
  if (sheet.totals.hp) {
    hero.maxHp += sheet.totals.hp;
    hero.hp = hero.maxHp;
  }
  if (sheet.totals.mana) {
    hero.maxMana += sheet.totals.mana;
    hero.mana = hero.maxMana;
  }
  return sheet.totals;
}

export function equipFromInventory(save: SaveData, itemId: string): boolean {
  const item = itemById(itemId);
  if (!item) return false;
  if (!save.hero.inventory.includes(itemId)) return false;
  save.hero.equipment = { ...(save.hero.equipment ?? {}), [item.slot]: itemId };
  return true;
}

export function unequipSlot(save: SaveData, slot: EquipSlot): void {
  const next = { ...(save.hero.equipment ?? {}) };
  delete next[slot];
  save.hero.equipment = next;
}

/** Grants an item (used by the victory loot roll). */
export function grantItem(save: SaveData, itemId: string): void {
  if (!itemById(itemId)) return;
  save.hero.inventory.push(itemId);
}

export function allItems(): ItemDef[] {
  return ITEMS;
}
