import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { BattleScene } from './scenes/BattleScene';
import { HudScene } from './scenes/HudScene';

/**
 * Aetheria: Dawnwake — single player fantasy RTS.
 * Phaser 3 + TypeScript, 100% procedurally generated art/audio (no third party assets).
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#070a13',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  fps: { target: 60, min: 30 },
  input: { mouse: { preventDefaultWheel: true } },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, BattleScene, HudScene],
};

export function bootGame(): Phaser.Game {
  const game = new Phaser.Game(gameConfig);
  (window as unknown as { __AETHERIA__?: Phaser.Game }).__AETHERIA__ = game;
  return game;
}

bootGame();
