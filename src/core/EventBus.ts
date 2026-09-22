type Handler = (payload?: any) => void;

/**
 * Tiny global event bus. Scenes and systems talk through this instead of holding
 * hard references to each other (HUD <-> Battle, Missions -> HUD, ...).
 */
class Bus {
  private map = new Map<string, Set<Handler>>();

  on(evt: string, fn: Handler): () => void {
    let set = this.map.get(evt);
    if (!set) {
      set = new Set();
      this.map.set(evt, set);
    }
    set.add(fn);
    return () => this.off(evt, fn);
  }

  once(evt: string, fn: Handler): void {
    const off = this.on(evt, (p) => {
      off();
      fn(p);
    });
  }

  off(evt: string, fn: Handler): void {
    this.map.get(evt)?.delete(fn);
  }

  emit(evt: string, payload?: any): void {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] handler for "${evt}" threw`, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}

export const bus = new Bus();

export const EV = {
  RESOURCES: 'resources:changed',
  POP: 'pop:changed',
  SELECTION: 'selection:changed',
  HERO: 'hero:changed',
  OBJECTIVES: 'objectives:changed',
  TOAST: 'ui:toast',
  BANNER: 'ui:banner',
  SFX: 'audio:sfx',
  MUSIC: 'audio:music',
  MATCH_END: 'match:end',
  BUILD_MENU: 'ui:buildmenu',
  ABILITY: 'hero:ability',
} as const;
