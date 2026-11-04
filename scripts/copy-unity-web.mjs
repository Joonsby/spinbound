// Vercel only: serves the Unity WebGL prototype (unity-web/, built from unity/) at /unity/ next to the web game.
// The Apps in Toss and Android builds use `npm run build` alone, so the prototype never ships in them.
import { cpSync, existsSync } from 'node:fs';

if (existsSync('unity-web/index.html')) {
  cpSync('unity-web', 'dist/unity', { recursive: true });
  console.log('Unity prototype copied to dist/unity');
}
