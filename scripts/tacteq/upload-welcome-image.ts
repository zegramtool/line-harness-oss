import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadHarnessConfig, WORKER_DIR } from './lib.ts';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const IMAGE_R2_KEY = 'welcome-estimate-photo-guide.png';

async function main(): Promise<void> {
  const cfg = loadHarnessConfig();
  const imagePath = join(SCRIPT_DIR, 'assets/estimate-photo-guide.png');
  readFileSync(imagePath);
  await execFileAsync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${cfg.r2BucketName}/${IMAGE_R2_KEY}`,
      '--file',
      imagePath,
      '--content-type',
      'image/png',
      '--remote',
    ],
    {
      cwd: WORKER_DIR,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: cfg.accountId },
    },
  );
  console.log(`Uploaded → ${cfg.workerUrl}/images/${IMAGE_R2_KEY}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
