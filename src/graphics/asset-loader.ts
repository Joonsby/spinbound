import Phaser from 'phaser';
import { registerExternal } from './art';
import { MANIFEST_URL, type RuntimeManifest } from './asset-manifest';

const MANIFEST_KEY = 'asset-manifest';
export const loadedAssets: string[] = [];
export const failedAssets: string[] = [];

// Queue the runtime manifest, then every PNG it lists. Keys that fail to load keep their
// code-painted fallback, so a missing file never breaks the game.
export function queueExternalAssets(scene: Phaser.Scene) {
  const load = scene.load;
  load.json(MANIFEST_KEY, MANIFEST_URL);
  load.once(`filecomplete-json-${MANIFEST_KEY}`, (_key: string, _type: string, data: RuntimeManifest | undefined) => {
    for (const [key, path] of Object.entries(data?.textures ?? {})) load.image(key, `assets/${path}`);
  });
  load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string, type: string) => {
    if (type !== 'image') return;
    registerExternal(key);
    loadedAssets.push(key);
  });
  load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    failedAssets.push(file.key);
    console.warn(`[assets] ${file.key} 를 불러오지 못해 임시 그림을 사용합니다 (${file.url})`);
  });
}
