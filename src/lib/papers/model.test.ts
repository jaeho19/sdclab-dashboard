import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Paper, PapersDoc } from './model.ts';
import {
  STATUS_EN, KANBAN_STATUSES, ARCHIVE_STATUSES, groupOf, isArchived,
  applyOp, nextId, normalizeFields, normalizeNote, placeInGroup, validatePapers, canonical,
} from './model.ts';

const P = (id: string, st: Paper['st'], extra: Partial<Paper> = {}): Paper => ({
  id, kind: '실제', stu: '홍길동', t: `제목 ${id}`, tier: 'KCI', jr: '학회지', st, stEn: STATUS_EN[st], ...extra,
});
const D = (...papers: Paper[]): PapersDoc => ({ v: 1, rev: 3, updatedAt: '2026-09-28T00:00:00.000Z', papers });
const NOW = '2026-09-28T05:00:00.000Z';
const ids = (d: PapersDoc) => d.papers.map((p) => p.id);
const okDoc = (r: ReturnType<typeof applyOp>): PapersDoc => { assert.equal(r.ok, true, JSON.stringify(r)); return (r as { ok: true; doc: PapersDoc }).doc; };
const fail = (r: ReturnType<typeof applyOp>) => { assert.equal(r.ok, false); return r as { ok: false; status: number; error: string }; };

test('상태 짝 표와 그룹', () => {
  assert.equal(STATUS_EN['투고 완료'], 'Submitted');
  assert.equal(STATUS_EN['심사 중'], 'Under Review');
  assert.equal(STATUS_EN['수정 중'], 'Under Revision');
  assert.equal(STATUS_EN['재투고'], 'Resubmitted');
  assert.equal(STATUS_EN['거절'], 'Rejected');
  assert.equal(STATUS_EN['게재확정'], 'Accepted');
  assert.equal(STATUS_EN['게재'], 'Published');
  assert.deepEqual([...KANBAN_STATUSES], ['투고 완료', '심사 중', '수정 중', '재투고', '거절']);
  assert.deepEqual([...ARCHIVE_STATUSES], ['게재확정', '게재']);
  assert.equal(groupOf('게재확정'), 'archive');
  assert.equal(groupOf('게재'), 'archive');
  assert.equal(groupOf('심사 중'), '심사 중');
  assert.equal(isArchived(P('A1', '게재')), true);
  assert.equal(isArchived(P('R1', '거절')), false);
});

test('move: 다른 열로, index 없음 → 그 열 끝에 붙고 st/stEn·rev·updatedAt 갱신', () => {
  const doc = D(P('A', '투고 완료'), P('B', '심사 중'), P('C', '심사 중'), P('Dd', '거절'));
  const r = okDoc(applyOp(doc, { op: 'move', id: 'A', st: '심사 중' }, NOW));
  assert.deepEqual(ids(r), ['B', 'C', 'A', 'Dd']);
  const a = r.papers.find((p) => p.id === 'A')!;
  assert.equal(a.st, '심사 중');
  assert.equal(a.stEn, 'Under Review');
  assert.equal(r.rev, 4);
  assert.equal(r.updatedAt, NOW);
});

test('move: index 지정 → 그룹 안 그 위치(=놓는 자리 다음 카드의 순번, 드래그 카드 제외)', () => {
  const doc = D(P('B', '심사 중'), P('C', '심사 중'), P('E', '심사 중'));
  assert.deepEqual(ids(okDoc(applyOp(doc, { op: 'move', id: 'E', st: '심사 중', index: 0 }, NOW))), ['E', 'B', 'C']);
  assert.deepEqual(ids(okDoc(applyOp(doc, { op: 'move', id: 'B', st: '심사 중', index: 1 }, NOW))), ['C', 'B', 'E']);
  // 범위 밖 index → 그룹 끝
  assert.deepEqual(ids(okDoc(applyOp(doc, { op: 'move', id: 'B', st: '심사 중', index: 99 }, NOW))), ['C', 'E', 'B']);
});

test('move: 같은 그룹 + index 없음 → 제자리에서 상태만 바뀜(게재확정↔게재)', () => {
  const doc = D(P('A1', '게재확정'), P('A2', '게재'), P('R1', '거절'));
  const r = okDoc(applyOp(doc, { op: 'move', id: 'A1', st: '게재' }, NOW));
  assert.deepEqual(ids(r), ['A1', 'A2', 'R1']);
  assert.equal(r.papers[0].st, '게재');
  assert.equal(r.papers[0].stEn, 'Published');
});

test('move: 아카이브로 보내고 다시 복원', () => {
  const doc = D(P('R1', '수정 중'), P('R2', '수정 중'), P('A1', '게재'));
  const arch = okDoc(applyOp(doc, { op: 'move', id: 'R1', st: '게재확정' }, NOW));
  assert.deepEqual(ids(arch), ['R2', 'A1', 'R1']);
  assert.equal(isArchived(arch.papers[2]), true);
  const back = okDoc(applyOp(arch, { op: 'move', id: 'R1', st: '수정 중' }, NOW));
  assert.deepEqual(ids(back), ['R2', 'R1', 'A1']);
  assert.equal(back.papers[1].stEn, 'Under Revision');
});

test('placeInGroup: 그룹이 비어 있으면 배열 끝', () => {
  const rest = [P('A', '투고 완료'), P('B', '거절')];
  const moved = P('C', '심사 중');
  assert.deepEqual(placeInGroup(rest, moved).map((p) => p.id), ['A', 'B', 'C']);
});

test('오류: 없는 id → 404, 나쁜 상태·op → 400', () => {
  const doc = D(P('A', '거절'));
  assert.equal(fail(applyOp(doc, { op: 'move', id: 'zz', st: '거절' }, NOW)).status, 404);
  assert.equal(fail(applyOp(doc, { op: 'move', id: 'A', st: '없는상태' }, NOW)).status, 400);
  assert.equal(fail(applyOp(doc, { op: 'move', id: 'A', st: '거절', index: 1.5 }, NOW)).status, 400);
  assert.equal(fail(applyOp(doc, { op: 'nope' }, NOW)).status, 400);
  assert.equal(fail(applyOp(doc, null, NOW)).status, 400);
});

test('note: 설정·공백이면 제거·길이 제한', () => {
  const doc = D(P('A', '거절', { note: '옛 메모' }));
  const r = okDoc(applyOp(doc, { op: 'note', id: 'A', note: '  첫 줄\r\n둘째 줄  ' }, NOW));
  assert.equal(r.papers[0].note, '첫 줄\n둘째 줄');
  const cleared = okDoc(applyOp(r, { op: 'note', id: 'A', note: '   ' }, NOW));
  assert.equal('note' in cleared.papers[0], false);
  assert.equal(fail(applyOp(doc, { op: 'note', id: 'A', note: 'x'.repeat(2001) }, NOW)).status, 400);
  assert.equal(normalizeNote(undefined).ok && (normalizeNote(undefined) as { note: string | null }).note, null);
});

test('update: 허용 키·형식 검증, 빈 값은 필드 제거, st 그룹 변경 시 이동', () => {
  const doc = D(P('A', '투고 완료', { fund: '신진연구', sub: '2026-01' }), P('B', '심사 중'));
  const r = okDoc(applyOp(doc, { op: 'update', id: 'A', fields: { t: ' 새 제목 ', fund: '', sub: '', pub: '2026-12', tier: 'SCIE' } }, NOW));
  const a = r.papers[0];
  assert.equal(a.t, '새 제목');
  assert.equal('fund' in a, false);
  assert.equal('sub' in a, false);
  assert.equal(a.pub, '2026-12');
  assert.equal(a.tier, 'SCIE');
  assert.equal(fail(applyOp(doc, { op: 'update', id: 'A', fields: { id: 'X' } }, NOW)).status, 400);
  assert.equal(fail(applyOp(doc, { op: 'update', id: 'A', fields: { sub: '2026-13' } }, NOW)).status, 400);
  assert.equal(fail(applyOp(doc, { op: 'update', id: 'A', fields: { t: '' } }, NOW)).status, 400);
  assert.equal(fail(applyOp(doc, { op: 'update', id: 'A', fields: { tier: 'ABC' } }, NOW)).status, 400);
  // st가 다른 그룹이면 그 그룹 끝으로
  const moved = okDoc(applyOp(doc, { op: 'update', id: 'A', fields: { st: '심사 중' } }, NOW));
  assert.deepEqual(ids(moved), ['B', 'A']);
  assert.equal(moved.papers[1].stEn, 'Under Review');
  // 같은 그룹이면 제자리
  const same = okDoc(applyOp(doc, { op: 'update', id: 'A', fields: { st: '투고 완료', jr: 'Cities' } }, NOW));
  assert.deepEqual(ids(same), ['A', 'B']);
});

test('add: id 자동(R·A 최댓값+1), 기본값, 끝에 추가, 필수 검증', () => {
  const doc = D(P('R01', '거절'), P('R11', '심사 중'), P('A06', '게재'));
  const r = okDoc(applyOp(doc, { op: 'add', paper: { t: '새 논문', stu: '김철수', jr: 'Cities' } }, NOW));
  const n = r.papers[3];
  assert.equal(n.id, 'R12');
  assert.equal(n.kind, '실제');
  assert.equal(n.tier, 'und');
  assert.equal(n.st, '투고 완료');
  assert.equal(n.stEn, 'Submitted');
  assert.equal('sub' in n, false);
  const r2 = okDoc(applyOp(r, { op: 'add', paper: { t: 'x', stu: 'y', jr: 'z', st: '심사 중', sub: '2026-09', fund: '워케이션' } }, NOW));
  assert.equal(r2.papers[4].id, 'R13');
  assert.equal(r2.papers[4].stEn, 'Under Review');
  assert.equal(r2.papers[4].sub, '2026-09');
  assert.equal(fail(applyOp(doc, { op: 'add', paper: { t: '제목만' } }, NOW)).status, 400);
  assert.equal(nextId([P('R99', '거절')]), 'R100');
  assert.equal(nextId([]), 'R01');
});

test('delete', () => {
  const doc = D(P('A', '거절'), P('B', '거절'));
  assert.deepEqual(ids(okDoc(applyOp(doc, { op: 'delete', id: 'A' }, NOW))), ['B']);
  assert.equal(fail(applyOp(doc, { op: 'delete', id: 'zz' }, NOW)).status, 404);
});

test('replace: 검증 통과 시 정규화(stEn 재계산·키 순서), 실패 시 400', () => {
  const doc = D(P('A', '거절'));
  const raw = [{ note: 'n', id: 'X1', st: '심사 중', stEn: 'Rejected', t: 'T', stu: 'S', jr: 'J', tier: 'SCIE', kind: '실제', sub: '2026-02' }];
  const r = okDoc(applyOp(doc, { op: 'replace', papers: raw }, NOW));
  assert.deepEqual(Object.keys(r.papers[0]), ['id', 'kind', 'stu', 't', 'tier', 'jr', 'st', 'stEn', 'sub', 'note']);
  assert.equal(r.papers[0].stEn, 'Under Review');
  assert.equal(fail(applyOp(doc, { op: 'replace', papers: [{ id: 'X1', st: '심사 중', t: 'T', stu: 'S' }, { id: 'X1', st: '거절', t: 'T', stu: 'S' }] }, NOW)).error.includes('중복'), true);
  assert.equal(fail(applyOp(doc, { op: 'replace', papers: 'no' }, NOW)).status, 400);
});

test('입력 문서는 바뀌지 않는다(불변)', () => {
  const doc = D(P('A', '투고 완료'), P('B', '심사 중'));
  const before = JSON.stringify(doc);
  applyOp(doc, { op: 'move', id: 'A', st: '심사 중', index: 0 }, NOW);
  applyOp(doc, { op: 'note', id: 'A', note: 'm' }, NOW);
  applyOp(doc, { op: 'update', id: 'A', fields: { t: 'z' } }, NOW);
  applyOp(doc, { op: 'add', paper: { t: 'a', stu: 'b', jr: 'c' } }, NOW);
  applyOp(doc, { op: 'delete', id: 'A' }, NOW);
  assert.equal(JSON.stringify(doc), before);
});

test('normalizeFields(partial:false)는 제목·주저자·저널 필수', () => {
  assert.equal(normalizeFields({ t: 'a', stu: 'b' }, { partial: false }).ok, false);
  const r = normalizeFields({ t: 'a', stu: 'b', jr: 'c' }, { partial: false });
  assert.equal(r.ok, true);
});

test('canonical: fund null·빈값 제거, 키 순서 고정', () => {
  const p = canonical({ ...P('A', '거절'), fund: null, pub: '2026-01' });
  assert.deepEqual(Object.keys(p), ['id', 'kind', 'stu', 't', 'tier', 'jr', 'st', 'stEn', 'pub']);
});

test('실제 papers.json이 검증을 통과한다', async () => {
  const raw = JSON.parse(await readFile(new URL('../../../content/dashboard/papers.json', import.meta.url), 'utf8'));
  const v = validatePapers(raw);
  assert.equal(v.ok, true, (v as { error?: string }).error);
  assert.equal((v as { papers: Paper[] }).papers.length, raw.length);
});
