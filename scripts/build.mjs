import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await mkdir(join(dist, 'lib'), { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css', 'cortex-3d.js']) {
  await cp(join(root, file), join(dist, file));
}

await cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
await cp(join(root, 'lib', 'trading.js'), join(dist, 'lib', 'trading.js'));

console.log('PARALLAX static build written to dist/');
