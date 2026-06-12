/**
 * TacTeQ 友だち追加ウェルカム（4通）をセットアップする。
 *
 * 1. 挨拶テキスト
 * 2. お見積り用写真撮影ガイド（画像）
 * 3. オレンジのお問合せフォームボタン（Flex）
 * 4. 注意書き（テキスト・URL なし）
 *
 * Usage:
 *   pnpm tacteq:activate-welcome
 *   pnpm tacteq:upload-welcome-image   # 初回 or 画像差し替え時
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  harnessFetch,
  d1Query,
  sqlString,
  loadHarnessConfig,
  WORKER_DIR,
} from './lib.ts';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const SCENARIO_ID = 'ed6b2fb7-3372-49c6-ab1d-113b3fc82fc0';
const ACCOUNT_NAME = process.env.TACTEQ_ACCOUNT_NAME?.trim() || 'TacTeQ';
const FORM_URL =
  process.env.TACTEQ_FORM_URL?.trim() ||
  'https://graceful-robe-1ed.notion.site/1bbec524d682805c87f9dda6b34801a9?pvs=105';
const IMAGE_R2_KEY = 'welcome-estimate-photo-guide.png';

const WELCOME_TEXT = `{Nickname}さん、はじめまして👋！
友だち追加ありがとうございます。{AccountName}です。

リペア（補修）のお見積りやお問い合わせの方はお手数ですが以下のオレンジの『お問合せフォーム入力』ボタンにて質問にできる限りお答えいただけますとスムーズなご案内が可能です。見積り用のお写真の撮り方は
👇をご確認お願いいたします。

LINEでのやり取りをご希望の方は
⚠️公式LINEの仕様上友達追加のみでは通知が来ず返信する事が出来ません⚠️のでお手数ですが

【問合せ】や【見積り希望】

とメッセージ送信の上、問合せフォームの入力をお願いいたします。`;

const CLOSING_TEXT = `上記の問合せフォームに入力のご協力をいただけない場合はお見積りなどの対応が出来ない場合がございます。

スムーズなご案内をさせて頂く為
お手数おかけしますがご協力お願い致します💡`;

interface ScenarioStep {
  id: string;
  stepOrder: number;
}

interface ScenarioDetail {
  id: string;
  name: string;
  steps: ScenarioStep[];
}

function formButtonFlex(formUrl: string): string {
  return JSON.stringify({
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: [
        {
          type: 'text',
          text: 'お問合せフォーム',
          weight: 'bold',
          size: 'md',
          align: 'center',
          color: '#333333',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#FF8C00',
          height: 'md',
          action: {
            type: 'uri',
            label: 'お問合せフォーム入力',
            uri: formUrl,
          },
        },
      ],
    },
  });
}

function imageStepContent(workerUrl: string): string {
  const imageUrl = `${workerUrl}/images/${IMAGE_R2_KEY}`;
  return JSON.stringify({
    originalContentUrl: imageUrl,
    previewImageUrl: imageUrl,
  });
}

async function uploadWelcomeImage(): Promise<void> {
  const cfg = loadHarnessConfig();
  const imagePath = join(SCRIPT_DIR, 'assets/estimate-photo-guide.png');
  const file = readFileSync(imagePath);
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
  console.log(`Uploaded ${imagePath} → R2 ${IMAGE_R2_KEY} (${file.byteLength} bytes)`);
}

async function main(): Promise<void> {
  const cfg = loadHarnessConfig();

  await d1Query(
    `UPDATE line_accounts SET name = ${sqlString(ACCOUNT_NAME)}, updated_at = datetime('now') WHERE id = (SELECT id FROM line_accounts LIMIT 1)`,
  );
  console.log(`LINE account display name → ${ACCOUNT_NAME}`);

  try {
    await uploadWelcomeImage();
  } catch (err) {
    console.warn('Image upload skipped (run pnpm tacteq:upload-welcome-image):', err);
  }

  await harnessFetch(`/api/scenarios/${SCENARIO_ID}`, {
    method: 'PUT',
    body: JSON.stringify({ isActive: true, name: '友だち追加ウェルカム' }),
  });

  const scenario = await harnessFetch<ScenarioDetail>(`/api/scenarios/${SCENARIO_ID}`);
  for (const step of scenario.steps ?? []) {
    await harnessFetch(`/api/scenarios/${SCENARIO_ID}/steps/${step.id}`, {
      method: 'DELETE',
    });
  }
  console.log(`Removed ${scenario.steps?.length ?? 0} old step(s).`);

  const steps = [
    {
      stepOrder: 1,
      delayMinutes: 0,
      messageType: 'text' as const,
      messageContent: WELCOME_TEXT,
    },
    {
      stepOrder: 2,
      delayMinutes: 0,
      messageType: 'image' as const,
      messageContent: imageStepContent(cfg.workerUrl),
    },
    {
      stepOrder: 3,
      delayMinutes: 0,
      messageType: 'flex' as const,
      messageContent: formButtonFlex(FORM_URL),
    },
    {
      stepOrder: 4,
      delayMinutes: 0,
      messageType: 'text' as const,
      messageContent: CLOSING_TEXT,
    },
  ];

  for (const step of steps) {
    await harnessFetch(`/api/scenarios/${SCENARIO_ID}/steps`, {
      method: 'POST',
      body: JSON.stringify(step),
    });
    console.log(`Created step ${step.stepOrder} (${step.messageType})`);
  }

  console.log('\nDone. New friends receive 4 messages on add (text → image → button → closing).');
  console.log('Variables: {Nickname} = display name, {AccountName} =', ACCOUNT_NAME);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
