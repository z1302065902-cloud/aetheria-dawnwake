import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoadingScene } from './scenes/LoadingScene';
import { save } from './core/SaveManager';
import { MenuScene } from './scenes/MenuScene';
import { BattleScene } from './scenes/BattleScene';
import { HudScene } from './scenes/HudScene';
import { audio } from './audio/AudioBus';
import { IS_DEMO_BUILD, PLAYABLE_MISSIONS } from './data/missions';

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
  scene: [BootScene, LoadingScene, MenuScene, BattleScene, HudScene],
};

export function bootGame(): Phaser.Game {
  const game = new Phaser.Game(gameConfig);
  // test/debug handles: the game, and the save manager (product tests verify per-hero
  // progression through it rather than by reading localStorage)
  (window as unknown as { __AETHERIA__?: Phaser.Game }).__AETHERIA__ = game;
  (window as unknown as { __AETHERIA__: Phaser.Game & { __save?: unknown } }).__AETHERIA__.__save = save;
  // build identity: lets the release checks assert that the free demo really is limited to two
  // missions and that the paid build really unlocks all ten
  (window as unknown as { __AETHERIA__: Phaser.Game & { __build?: unknown } }).__AETHERIA__.__build = {
    demo: IS_DEMO_BUILD,
    playable: [...PLAYABLE_MISSIONS].sort(),
  };
  (window as unknown as { __AETHERIA_AUDIO__?: typeof audio }).__AETHERIA_AUDIO__ = audio;
  return game;
}

bootGame();
