/**
 * Enable the default friend_add welcome scenario and ensure step 1 exists.
 *
 * Usage:
 *   pnpm tacteq:activate-welcome
 *   WELCOME_MESSAGE="..." pnpm tacteq:activate-welcome
 */
import { harnessFetch, d1Query, sqlString } from './lib.ts';

const DEFAULT_WELCOME = `友だち追加ありがとうございます！
TacTeQです。

ご不明点がございましたら、お気軽にメッセージをお送りください。`;

const WELCOME_MESSAGE = process.env.WELCOME_MESSAGE?.trim() || DEFAULT_WELCOME;

interface ScenarioRow {
  id: string;
  name: string;
  is_active: number;
}

interface StepRow {
  id: string;
}

async function main(): Promise<void> {
  const scenarios = await d1Query<ScenarioRow>(
    `SELECT id, name, is_active FROM scenarios WHERE trigger_type = 'friend_add' ORDER BY created_at ASC`,
  );
  if (scenarios.length === 0) {
    throw new Error('No friend_add scenario found. Create one in the admin UI first.');
  }

  const scenario = scenarios.find((s) => s.name.includes('ウェルカム')) ?? scenarios[0];
  console.log(`Target scenario: ${scenario.name} (${scenario.id})`);

  await harnessFetch(`/api/scenarios/${scenario.id}`, {
    method: 'PUT',
    body: JSON.stringify({ isActive: true }),
  });
  console.log('Scenario activated.');

  const steps = await d1Query<StepRow>(
    `SELECT id FROM scenario_steps WHERE scenario_id = ${sqlString(scenario.id)}`,
  );

  if (steps.length === 0) {
    await harnessFetch(`/api/scenarios/${scenario.id}/steps`, {
      method: 'POST',
      body: JSON.stringify({
        stepOrder: 1,
        delayMinutes: 0,
        messageType: 'text',
        messageContent: WELCOME_MESSAGE,
      }),
    });
    console.log('Welcome step created (immediate text on friend add).');
  } else {
    console.log(`Scenario already has ${steps.length} step(s); skipped step creation.`);
  }

  console.log('\nDone. New friends will receive the welcome message via Harness.');
  console.log('LINE あいさつメッセージはオフのままにしてください（二重送信防止）。');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
