import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
export const WORKER_DIR = join(REPO_ROOT, 'apps/worker');

export interface HarnessConfig {
  projectName: string;
  accountId: string;
  workerUrl: string;
  d1DatabaseName: string;
  d1DatabaseId: string;
}

export interface McpConfig {
  mcpServers?: {
    'line-harness'?: {
      env?: {
        LINE_HARNESS_API_URL?: string;
        LINE_HARNESS_API_KEY?: string;
      };
    };
  };
}

export function loadHarnessConfig(): HarnessConfig {
  const path = join(REPO_ROOT, '.line-harness-config.json');
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run create-line-harness setup first.`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  return {
    projectName: raw.projectName,
    accountId: raw.accountId ?? raw.cfAccountId,
    workerUrl: raw.workerUrl ?? raw.workerPublicUrl,
    d1DatabaseName: raw.d1DatabaseName,
    d1DatabaseId: raw.d1DatabaseId,
  };
}

export function loadHarnessApiCredentials(): { apiUrl: string; apiKey: string } {
  const mcpPath = join(REPO_ROOT, '.mcp.json');
  if (existsSync(mcpPath)) {
    const mcp = JSON.parse(readFileSync(mcpPath, 'utf8')) as McpConfig;
    const env = mcp.mcpServers?.['line-harness']?.env;
    if (env?.LINE_HARNESS_API_URL && env?.LINE_HARNESS_API_KEY) {
      return { apiUrl: env.LINE_HARNESS_API_URL, apiKey: env.LINE_HARNESS_API_KEY };
    }
  }
  const apiUrl = process.env.LINE_HARNESS_API_URL;
  const apiKey = process.env.LINE_HARNESS_API_KEY ?? process.env.API_KEY;
  if (apiUrl && apiKey) return { apiUrl, apiKey };
  throw new Error('Set LINE_HARNESS_API_URL + LINE_HARNESS_API_KEY (or .mcp.json).');
}

export async function harnessFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { apiUrl, apiKey } = loadHarnessApiCredentials();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: T;
  };
  if (!res.ok || body.success === false) {
    throw new Error(body.error ?? `Harness API ${res.status}: ${path}`);
  }
  return body.data as T;
}

async function runWrangler(args: string[]): Promise<string> {
  const cfg = loadHarnessConfig();
  const { stdout, stderr } = await execFileAsync(
    'npx',
    ['wrangler', ...args],
    {
      cwd: WORKER_DIR,
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: cfg.accountId,
        FORCE_COLOR: '0',
      },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (stderr && stderr.includes('ERROR')) {
    throw new Error(stderr);
  }
  return stdout;
}

export async function d1Query<T extends Record<string, unknown>>(
  sql: string,
  config?: HarnessConfig,
): Promise<T[]> {
  const cfg = config ?? loadHarnessConfig();
  const out = await runWrangler([
    'd1',
    'execute',
    cfg.d1DatabaseName,
    '--remote',
    '--command',
    sql,
  ]);
  const jsonStart = out.indexOf('[');
  if (jsonStart < 0) throw new Error('Unexpected wrangler d1 output');
  const parsed = JSON.parse(out.slice(jsonStart)) as Array<{ results: T[] }>;
  return parsed[0]?.results ?? [];
}

export async function d1ExecuteFile(filePath: string, config?: HarnessConfig): Promise<void> {
  const cfg = config ?? loadHarnessConfig();
  await runWrangler(['d1', 'execute', cfg.d1DatabaseName, '--remote', '--file', filePath]);
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function jstNow(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60_000);
  return `${jst.toISOString().slice(0, -1)}+09:00`;
}

export async function loadLineAccessTokenFromD1(channelId?: string): Promise<string> {
  const sql = channelId
    ? `SELECT channel_access_token FROM line_accounts WHERE channel_id = ${sqlString(channelId)} LIMIT 1`
    : 'SELECT channel_access_token FROM line_accounts LIMIT 1';
  const rows = await d1Query<{ channel_access_token: string }>(sql);
  const token = rows[0]?.channel_access_token?.trim();
  if (!token) throw new Error('channel_access_token not found in line_accounts (D1).');
  return token;
}
