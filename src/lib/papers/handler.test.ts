import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PapersDoc } from './model.ts';
import type { Store, WriteCond } from './handler.ts';
import { createPapersHandler } from './handler.ts';

class MemStore implements Store {
  state: { doc: PapersDoc; etag: string | null } | null = null;
  snaps = new Map<number, PapersDoc>();
  n = 0;
  failWrites = 0; // 앞으로 n번의 write를 조건 불일치로 실패시킨다
  async read() { return this.state ? { doc: structuredClone(this.state.doc), etag: this.state.etag } : null; }
  async write(doc: PapersDoc, cond: WriteCond) {
    if (this.failWrites > 0) { this.failWrites -= 1; return false; }
    if ('ifNew' in cond) { if (this.state) return false; }
    else if ('ifMatch' in cond) { if (!this.state || this.state.etag !== cond.ifMatch) return false; }
    // 'unconditional' → 검사 없음
    this.state = { doc: structuredClone(doc), etag: `"e${++this.n}"` };
    return true;
  }
  async writeSnapshot(rev: number, doc: PapersDoc) { this.snaps.set(rev, structuredClone(doc)); }
  async listSnapshots() { return [...this.snaps.keys()].sort((a, b) => a - b); }
  async readSnapshot(rev: number) { return this.snaps.get(rev) ?? null; }
  async deleteSnapshot(rev: number) { this.snaps.delete(rev); }
}

const SEED = [
  { id: 'R01', kind: '실제', stu: '가', t: 'T1', tier: 'KCI', jr: 'J', st: '거절', stEn: 'Rejected' },
  { id: 'R02', kind: '실제', stu: '나', t: 'T2', tier: 'SCIE', jr: 'J', st: '심사 중', stEn: 'Under Review' },
  { id: 'P01', kind: '계획', stu: '다', t: '계획', tier: 'und', jr: '', st: '거절', stEn: 'Rejected' },
];
const URL_ = 'https://sdclab-dashboard-156.netlify.app/api/papers';
const NOW = '2026-09-28T05:00:00.000Z';
const setup = (extra: Partial<Parameters<typeof createPapersHandler>[0]> = {}) => {
  const store = new MemStore();
  const handler = createPapersHandler({ store, seed: SEED, now: () => NOW, ...extra });
  return { store, handler };
};
const get = (h: (r: Request) => Promise<Response>, qs = '', headers: Record<string, string> = {}) => h(new Request(URL_ + qs, { headers }));
const post = (h: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  h(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));

test('GET: 저장소가 비어 있으면 씨앗(kind 실제만) rev 0', async () => {
  const { handler } = setup();
  const r = await get(handler);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const b = await r.json();
  assert.equal(b.ok, true);
  assert.equal(b.source, 'seed');
  assert.equal(b.rev, 0);
  assert.deepEqual(b.papers.map((p: { id: string }) => p.id), ['R01', 'R02']);
});

test('POST move: 씨앗에서 첫 문서 생성(ifNew), rev 1, 이후 GET은 blob', async () => {
  const { store, handler } = setup();
  const r = await post(handler, { op: 'move', id: 'R01', st: '심사 중' });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.rev, 1);
  assert.equal(b.updatedAt, NOW);
  assert.deepEqual(b.papers.map((p: { id: string }) => p.id), ['R02', 'R01']);
  assert.equal(store.state?.doc.rev, 1);
  assert.deepEqual([...store.snaps.keys()], [0], '직전(씨앗 rev 0) 스냅샷이 남는다');
  const g = await (await get(handler)).json();
  assert.equal(g.source, 'blob');
  assert.equal(g.rev, 1);
});

test('POST: 검증 오류 400, 없는 id 404, JSON 아님 400, 다른 메서드 405', async () => {
  const { handler } = setup();
  assert.equal((await post(handler, { op: 'move', id: 'R01', st: '?' })).status, 400);
  assert.equal((await post(handler, { op: 'note', id: 'zz', note: 'x' })).status, 404);
  assert.equal((await post(handler, '{bad json')).status, 400);
  assert.equal((await handler(new Request(URL_, { method: 'PUT' }))).status, 405);
  const b = await (await post(handler, { op: 'move', id: 'R01', st: '?' })).json();
  assert.equal(b.ok, false);
  assert.equal(typeof b.error, 'string');
});

test('POST: 조건부 쓰기 충돌은 재시도, 3회 모두 실패하면 409', async () => {
  const { store, handler } = setup();
  await post(handler, { op: 'note', id: 'R01', note: 'a' });
  store.failWrites = 1;
  const ok = await post(handler, { op: 'note', id: 'R01', note: 'b' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rev, 2);
  store.failWrites = 3;
  const conflict = await post(handler, { op: 'note', id: 'R01', note: 'c' });
  assert.equal(conflict.status, 409);
  assert.equal(store.state?.doc.rev, 2);
});

test('etag를 주지 않는 저장소(로컬 샌드박스)에서는 조건 없이 써서 성공한다', async () => {
  const store = new MemStore();
  const conds: WriteCond[] = [];
  store.read = async () => (store.state ? { doc: structuredClone(store.state.doc), etag: null } : null);
  const origWrite = store.write.bind(store);
  store.write = async (doc, cond) => { conds.push(cond); return origWrite(doc, cond); };
  const handler = createPapersHandler({ store, seed: SEED, now: () => NOW });
  assert.equal((await post(handler, { op: 'note', id: 'R01', note: 'a' })).status, 200); // 첫 쓰기: ifNew
  assert.equal((await post(handler, { op: 'note', id: 'R01', note: 'b' })).status, 200); // etag 없음 → unconditional
  assert.deepEqual(conds, [{ ifNew: true }, { unconditional: true }]);
  assert.equal(store.state?.doc.rev, 2);
});

test('스냅샷: history·snap 조회, keep 초과분은 rev%10===0 때 정리', async () => {
  const { store, handler } = setup({ snapshotKeep: 3 });
  for (let i = 0; i < 10; i++) await post(handler, { op: 'note', id: 'R01', note: `m${i}` });
  assert.equal(store.state?.doc.rev, 10);
  assert.deepEqual(await store.listSnapshots(), [7, 8, 9], 'rev 10 저장 후 최근 3개만');
  const h = await (await get(handler, '?history=1')).json();
  assert.deepEqual(h.snapshots.map((s: { rev: number }) => s.rev), [7, 8, 9]);
  assert.equal(h.snapshots[0].count, 2);
  const s = await (await get(handler, '?snap=8')).json();
  assert.equal(s.rev, 8);
  assert.equal(s.papers[0].note, 'm7');
  assert.equal((await get(handler, '?snap=999')).status, 404);
});

test('CORS: 허용 origin에만 헤더, OPTIONS 204', async () => {
  const { handler } = setup();
  const ok = await handler(new Request(URL_, { method: 'OPTIONS', headers: { origin: 'https://jaeho19.github.io' } }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://jaeho19.github.io');
  assert.ok(ok.headers.get('access-control-allow-headers')?.includes('x-papers-pin'));
  const no = await get(handler, '', { origin: 'https://evil.example' });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
  const local = await get(handler, '', { origin: 'http://localhost:8888' });
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:8888');
});

test('PIN: 설정되면 POST에 헤더 필요, GET은 자유', async () => {
  const { handler } = setup({ pin: '1234' });
  assert.equal((await get(handler)).status, 200);
  assert.equal((await post(handler, { op: 'note', id: 'R01', note: 'x' })).status, 401);
  assert.equal((await post(handler, { op: 'note', id: 'R01', note: 'x' }, { 'x-papers-pin': '0000' })).status, 401);
  assert.equal((await post(handler, { op: 'note', id: 'R01', note: 'x' }, { 'x-papers-pin': '1234' })).status, 200);
});

test('replace: 전체 교체', async () => {
  const { handler } = setup();
  const r = await post(handler, { op: 'replace', papers: [{ id: 'X1', st: '게재', t: 'T', stu: 'S', jr: 'J', tier: 'KCI' }] });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.papers.map((p: { id: string }) => p.id), ['X1']);
  assert.equal(b.papers[0].stEn, 'Published');
});

test('씨앗이 잘못되면 생성 시점에 throw', () => {
  assert.throws(() => createPapersHandler({ store: new MemStore(), seed: [{ id: 'A', st: '없음' }] }), /검증 실패/);
});
