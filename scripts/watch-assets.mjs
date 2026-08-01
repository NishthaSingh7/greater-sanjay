import { watch } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererDir = path.join(root, 'src/renderer');

function copyAssets() {
  execSync('npm run copy:assets', { cwd: root, stdio: 'inherit' });
}

copyAssets();
console.log('[watch-assets] Watching src/renderer for HTML/CSS changes…');

watch(rendererDir, (_event, filename) => {
  if (filename && /\.(html|css)$/i.test(filename)) {
    console.log(`[watch-assets] ${filename} changed`);
    copyAssets();
  }
});
