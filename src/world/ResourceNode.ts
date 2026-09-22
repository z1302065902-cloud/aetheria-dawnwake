import { Entity } from './Entity';

export class ResourceNode extends Entity {
  resourceKind: 'gold' | 'wood' | 'mana';
  amount: number;
  maxAmount: number;
  gatherRate: number;
  /** Number of settlers currently harvesting (soft cap keeps travel time sane). */
  gatherers = 0;

  constructor(x: number, y: number, kind: 'gold' | 'wood' | 'mana', amount: number, gatherRate: number) {
    super('resource', 'neutral', x, y, kind === 'mana' ? 400 : 9999, 20);
    this.resourceKind = kind;
    this.amount = amount;
    this.maxAmount = Math.max(1, amount);
    this.gatherRate = gatherRate;
  }

  get depleted(): boolean {
    return this.resourceKind !== 'mana' && this.amount <= 0;
  }

  updateSprite(_dt = 0): void {
    if (!this.sprite) return;
    this.sprite.setPosition(this.x, this.y);
    const ratio = Math.min(1, this.amount / this.maxAmount);
    this.sprite.setAlpha(0.45 + 0.55 * Math.min(1, ratio * 2.6));
    this.sprite.setScale((this.sprite.scaleX < 0 ? -1 : 1) * (0.72 + 0.28 * Math.min(1, ratio * 2.6)));
  }
}
