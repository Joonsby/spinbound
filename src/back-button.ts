import { App } from '@capacitor/app';
import type Phaser from 'phaser';
import { confirmDialog } from './confirm-dialog';

// Android back key: closes dialogs and pauses or resumes a run like Escape, steps back out of
// menus, and asks before leaving the app from the lobby.
export function bindBackButton(game: Phaser.Game) {
  void App.addListener('backButton', () => {
    if (document.querySelector('.confirm-overlay, .attendance-overlay') || document.documentElement.dataset.screen === 'game') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    } else if (game.scene.isActive('MenuScreenScene')) {
      (document.querySelector<HTMLButtonElement>('#menu-root .prepare-actions [data-action="stages"]')
        ?? document.querySelector<HTMLButtonElement>('#menu-root [data-action="home"]'))?.click();
    } else {
      void confirmDialog({ title: '게임 종료', message: '스핀바운드를 종료할까요?', confirm: '종료' })
        .then((leave) => { if (leave) void App.exitApp(); });
    }
  });
}
