/**
 * TacTeQ 営業パイプライン用タグを一括作成する。
 * 既に同名タグがある場合はスキップ。
 */
import { harnessFetch } from './lib.ts';

const PIPELINE_TAGS = [
  { name: '見積もり済み', color: '#ABC003' },
  { name: '依頼', color: '#714F9D' },
  { name: '完了', color: '#22C55E' },
  { name: '入金済み', color: '#F59E0B' },
  { name: '失注', color: '#6B7280' },
] as const;

interface TagRow {
  id: string;
  name: string;
  color: string;
}

async function main(): Promise<void> {
  const existing = await harnessFetch<TagRow[]>('/api/tags');
  const byName = new Map((existing ?? []).map((t) => [t.name, t]));

  for (const spec of PIPELINE_TAGS) {
    const found = byName.get(spec.name);
    if (found) {
      console.log(`Skip (exists): ${spec.name} (${found.id})`);
      continue;
    }
    const created = await harnessFetch<TagRow>('/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name: spec.name, color: spec.color }),
    });
    console.log(`Created: ${spec.name} (${created.id})`);
  }

  console.log('\nDone. 管理画面 → 設定 → タグ管理 で確認できます。');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
