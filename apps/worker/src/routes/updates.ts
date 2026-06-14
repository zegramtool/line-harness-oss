import { Hono } from 'hono';
import { listRecent, type D1Like } from '@line-harness/update-engine';
import type { Env } from '../index.js';

const updates = new Hono<Env>();

function adaptD1(db: D1Database): D1Like {
  return {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        bind: (...args: unknown[]) => {
          const bound = stmt.bind(...args);
          return {
            run: () => bound.run() as Promise<unknown>,
            first: <T = unknown>() => bound.first<T>() as Promise<T | null>,
            all: <T = unknown>() =>
              bound.all<T>() as Promise<{ results: T[] }>,
          };
        },
      };
    },
  };
}

/** Staff-authenticated update history (fork ops use manual deploy, not self-update). */
updates.get('/api/updates/history', async (c) => {
  try {
    const d1 = adaptD1(c.env.DB);
    const history = await listRecent(d1, 20);
    return c.json({ success: true, data: { history } });
  } catch (err) {
    console.error('GET /api/updates/history error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export default updates;
