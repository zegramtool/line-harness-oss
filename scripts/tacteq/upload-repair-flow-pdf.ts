/**
 * 傷リペア作業フロー PDF を R2 にアップロード（期限なし・固定キー）
 * フォーム送信後の自動返信から参照する。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadHarnessConfig, WORKER_DIR } from './lib.ts';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** R2 / GET /images/:key 用の固定キー（files/ 配下にしない＝チャットPDF期限削除の対象外） */
export const REPAIR_FLOW_PDF_R2_KEY = 'tacteq-repair-flow.pdf';

async function main(): Promise<void> {
  const cfg = loadHarnessConfig();
  const pdfPath = join(SCRIPT_DIR, 'assets/repair-flow.pdf');
  const bytes = readFileSync(pdfPath);
  await execFileAsync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${cfg.r2BucketName}/${REPAIR_FLOW_PDF_R2_KEY}`,
      '--file',
      pdfPath,
      '--content-type',
      'application/pdf',
      '--remote',
    ],
    {
      cwd: WORKER_DIR,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: cfg.accountId },
    },
  );
  console.log(`Uploaded ${bytes.byteLength} bytes → ${cfg.workerUrl}/images/${REPAIR_FLOW_PDF_R2_KEY}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
