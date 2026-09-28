// /api/papers — 투고 논문 웹 편집 백엔드 (설계 문서 §7).
// 요청 처리 로직은 src/lib/papers/handler.ts(테스트 가능), 여기서는 Netlify Blobs를 Store 인터페이스에 맞춰 연결만 한다.
// 강한 일관성: 저장 직후 새로고침해도 방금 바꾼 상태가 보여야 한다(기본 최종 일관성은 최대 60초 지연).
import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';
import { createPapersHandler } from '../../src/lib/papers/handler.ts';
import type { Store, WriteCond } from '../../src/lib/papers/handler.ts';
import type { PapersDoc } from '../../src/lib/papers/model.ts';
import seed from '../../content/dashboard/papers.json';

// @types/node 미설치 상태(설치하면 이 커밋 범위를 벗어나 package.json도 바뀜) → process만 최소 선언.
declare const process: { env: Record<string, string | undefined> };

const STATE_KEY = 'state';
const snapKey = (rev: number) => `snap/${String(rev).padStart(6, '0')}`;

function blobStore(): Store {
  const store = getStore({ name: 'papers', consistency: 'strong' });
  return {
    async read() {
      const r = await store.getWithMetadata(STATE_KEY, { type: 'json' });
      if (!r) return null;
      if (!r.etag) throw new Error('Blobs 응답에 etag가 없습니다 — 조건부 쓰기를 보장할 수 없음');
      return { doc: r.data as PapersDoc, etag: r.etag };
    },
    async write(doc: PapersDoc, cond: WriteCond) {
      const r = await store.setJSON(STATE_KEY, doc, 'ifMatch' in cond ? { onlyIfMatch: cond.ifMatch } : { onlyIfNew: true });
      return r.modified;
    },
    async writeSnapshot(rev, doc) {
      await store.setJSON(snapKey(rev), doc);
    },
    async listSnapshots() {
      const { blobs } = await store.list({ prefix: 'snap/' });
      return blobs.map((b) => Number(b.key.slice('snap/'.length))).filter(Number.isFinite).sort((a, b) => a - b);
    },
    async readSnapshot(rev) {
      return (await store.get(snapKey(rev), { type: 'json' })) as PapersDoc | null;
    },
    async deleteSnapshot(rev) {
      await store.delete(snapKey(rev));
    },
  };
}

export default async (req: Request, _context: Context): Promise<Response> => {
  // Blobs 컨텍스트는 호출마다 주입되므로 store도 호출 시점에 만든다(모듈 상단 금지).
  const handler = createPapersHandler({ store: blobStore(), seed, pin: process.env.PAPERS_EDIT_PIN || undefined });
  return handler(req);
};

// method 필터를 두지 않는다: 두면 PUT 등이 함수에 닿기 전에 정적 404로 빠져 handler의 405가 무의미해진다.
export const config: Config = { path: '/api/papers' };
