import 'server-only';
import pg from 'pg';
import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
// Compatible with D1's parameterized prepare/bind/first/all/run interface.
type Query = { sql: string; params: unknown[] };
function translate(sql: string): string {
  let out = sql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
  let quote: string | null = null, n = 0, result = '';
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if ((c === "'" || c === '"') && !quote) { quote = c; result += c; continue; }
    if (quote && c === quote) { if (out[i+1] === quote) { result += c + out[++i]; continue; } quote = null; result += c; continue; }
    result += c === '?' && !quote ? '$' + (++n) : c;
  }
  if (/^\s*INSERT OR IGNORE INTO/i.test(sql) && !/ON CONFLICT/i.test(result)) result += ' ON CONFLICT DO NOTHING';
  return result;
}
function prepared(sql: string, params: unknown[] = []) {
  const query: Query = { sql, params };
  return {
    _query: query,
    bind(...args: unknown[]) { return prepared(sql, args); },
    async first() { const r = await pool.query(translate(sql), params); return r.rows[0] || null; },
    async all() { const r = await pool.query(translate(sql), params); return { results: r.rows }; },
    async run() { const r = await pool.query(translate(sql), params); return { success: true, meta: { changes: r.rowCount || 0 } }; }
  };
}
export const database = {
  prepare: prepared,
  async batch(statements: ReturnType<typeof prepared>[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const statement of statements) {
        const q = statement._query;
        const result = await client.query(translate(q.sql), q.params);
        results.push({ results: result.rows, success: true });
      }
      await client.query('COMMIT');
      return results;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
};

// Local development file storage; for multi-instance production replace with S3/R2.
const root = path.join(process.cwd(), '.local-uploads');
function filePath(key: string) { if (!/^[a-f0-9-]{36}$/.test(key)) throw Error('Invalid media key'); return path.join(root, key); }
export const mediaBucket = {
  async put(key: string, body: ReadableStream<Uint8Array>, _options?: unknown) {
    await mkdir(root, { recursive: true });
    const chunks: Uint8Array[] = [];
    for await (const c of Readable.fromWeb(body as any)) chunks.push(c);
    await writeFile(filePath(key), Buffer.concat(chunks));
  },
  async delete(key: string) { await unlink(filePath(key)).catch(e => { if (e.code !== 'ENOENT') throw e; }); },
  async get(key: string, options?: {range?: Headers}) {
    let content: Buffer;
    try { content = await readFile(filePath(key)); } catch (e:any) { if (e.code === 'ENOENT') return null; throw e; }
    const total = content.length;
    const header = options?.range?.get('range') || '';
    const m = /^bytes=(\d+)-(\d*)$/.exec(header);
    let range: {offset: number;length: number} | undefined;
    if (m) { const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]),total - 1) : total - 1; if (start < total && end >= start) { range = {offset:start,length:end-start+1}; content = content.subarray(start,end+1); } }
    return { size: total, range, body: new ReadableStream({start(controller) { controller.enqueue(content); controller.close(); }}) };
  }
};
