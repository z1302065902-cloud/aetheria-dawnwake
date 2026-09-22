import Phaser from 'phaser';
import { ensureTextures } from '../art/SpriteFactory';
import { audio } from '../audio/AudioBus';
import { save } from '../core/SaveManager';

/** Generates every texture, wires the audio unlock, then hands over to the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    ensureTextures(this);
    audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);

    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('hidden');
      window.setTimeout(() => splash.remove(), 450);
    }

    // Any first interaction unlocks the WebAudio context (browser autoplay policy).
    const unlock = () => {
      audio.init();
      audio.setVolumes(save.current.settings.music, save.current.settings.sfx, save.current.settings.muted);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.scene.start('Menu');
  }
}
