// /api/papers 요청 처리기 (설계 문서 §6-3). Netlify에 묶이지 않도록 Store를 주입받는다 → node --test로 검증 가능.
// 흐름(POST): read → (없으면 씨앗 rev 0) → applyOp → 직전 문서 스냅샷 → 조건부 write → 실패 시 재시도 → 409.
import type { PapersDoc } from './model.ts';
import { applyOp, seedDoc, validatePapers } from './model.ts';

export type WriteCond = { ifMatch: string } | { ifNew: true };

export interface Store {
  read(): Promise<{ doc: PapersDoc; etag: string } | null>;
  /** 조건이 맞지 않으면 false(아무것도 쓰지 않음). */
  write(doc: PapersDoc, cond: WriteCond): Promise<boolean>;
  writeSnapshot(rev: number, doc: PapersDoc): Promise<void>;
  /** 오름차순 rev 목록 */
  listSnapshots(): Promise<number[]>;
  readSnapshot(rev: number): Promise<PapersDoc | null>;
  deleteSnapshot(rev: number): Promise<void>;
}

export interface HandlerOptions {
  store: Store;
  /** 빌드에 포함된 papers.json 전체 배열(kind 무관). kind==='실제'만 쓴다. */
  seed: unknown;
  now?: () => string;
  /** 설정되면 POST에 x-papers-pin 헤더 일치를 요구한다. 미설정이면 검사하지 않는다(현재). */
  pin?: string;
  allowedOrigins?: readonly string[];
  snapshotKeep?: number;
  maxRetries?: number;
}

export const DEFAULT_ORIGINS: readonly string[] = [
  'https://sdclab-dashboard-156.netlify.app',
  'https://jaeho19.github.io',
  'http://localhost:4321',
  'http://localhost:8888',
];

export function createPapersHandler(o: HandlerOptions): (req: Request) => Promise<Response> {
  const now = o.now ?? (() => new Date().toISOString());
  const origins = o.allowedOrigins ?? DEFAULT_ORIGINS;
  const keep = o.snapshotKeep ?? 30;
  const retries = o.maxRetries ?? 3;
  const seedRaw = Array.isArray(o.seed) ? (o.seed as { kind?: string }[]).filter((p) => p.kind === undefined || p.kind === '실제') : o.seed;
  const seedV = validatePapers(seedRaw);
  if (!seedV.ok) throw new Error(`씨앗 papers.json 검증 실패: ${seedV.error}`);
  const seedPapers = seedV.papers;

  const cors = (req: Request): Record<string, string> => {
    const origin = req.headers.get('origin');
    const h: Record<string, string> = { vary: 'Origin' };
    if (origin && origins.includes(origin)) {
      h['access-control-allow-origin'] = origin;
      h['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      h['access-control-allow-headers'] = 'content-type, x-papers-pin';
      h['access-control-max-age'] = '86400';
    }
    return h;
  };
  const json = (req: Request, status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(req) },
    });
  const docBody = (doc: PapersDoc, source: 'blob' | 'seed') => ({ ok: true, source, rev: doc.rev, updatedAt: doc.updatedAt, papers: doc.papers });

  async function prune(): Promise<void> {
    const revs = await o.store.listSnapshots();
    const extra = revs.length - keep;
    for (let i = 0; i < extra; i++) await o.store.deleteSnapshot(revs[i]);
  }

  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

      if (req.method === 'GET') {
        if (url.searchParams.get('history') === '1') {
          const snapshots: { rev: number; updatedAt: string; count: number }[] = [];
          for (const rev of await o.store.listSnapshots()) {
            const d = await o.store.readSnapshot(rev);
            if (d) snapshots.push({ rev, updatedAt: d.updatedAt, count: d.papers.length });
          }
          return json(req, 200, { ok: true, snapshots });
        }
        const snap = url.searchParams.get('snap');
        if (snap !== null) {
          const d = await o.store.readSnapshot(Number(snap));
          return d ? json(req, 200, docBody(d, 'blob')) : json(req, 404, { ok: false, error: `스냅샷 없음: ${snap}` });
        }
        const cur = await o.store.read();
        return json(req, 200, cur ? docBody(cur.doc, 'blob') : docBody(seedDoc(seedPapers, now()), 'seed'));
      }

      if (req.method !== 'POST') return json(req, 405, { ok: false, error: '허용되지 않는 메서드' });
      if (o.pin && req.headers.get('x-papers-pin') !== o.pin) return json(req, 401, { ok: false, error: 'PIN이 올바르지 않습니다' });

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json(req, 400, { ok: false, error: '본문이 JSON이 아닙니다' });
      }

      for (let attempt = 0; attempt < retries; attempt++) {
        const cur = await o.store.read();
        const base = cur ? cur.doc : seedDoc(seedPapers, now());
        const res = applyOp(base, body, now());
        if (!res.ok) return json(req, res.status, { ok: false, error: res.error });
        await o.store.writeSnapshot(base.rev, base);
        const written = await o.store.write(res.doc, cur ? { ifMatch: cur.etag } : { ifNew: true });
        if (written) {
          if (res.doc.rev % 10 === 0) await prune();
          return json(req, 200, docBody(res.doc, 'blob'));
        }
      }
      return json(req, 409, { ok: false, error: '동시에 수정되어 저장하지 못했습니다. 다시 시도해 주세요' });
    } catch (err) {
      return json(req, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
