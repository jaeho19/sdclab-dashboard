import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paper } from './model.ts';
import { STATUS_EN } from './model.ts';
import { esc, renderArchive, renderCard, renderChips, renderKanban, renderKpis, summary } from './view.ts';

const P = (id: string, st: Paper['st'], extra: Partial<Paper> = {}): Paper => ({
  id, kind: '실제', stu: '홍길동', t: `제목 ${id}`, tier: 'KCI', jr: '학회지', st, stEn: STATUS_EN[st], ...extra,
});
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

test('esc: 특수문자 이스케이프', () => {
  assert.equal(esc(`<b>&"'`), '&lt;b&gt;&amp;&quot;&#39;');
  assert.equal(esc(null), '');
});

test('renderCard: 열람 모드 마크업·data 속성·이스케이프·메모 없으면 memo 없음', () => {
  const html = renderCard(P('R01', '심사 중', { t: 'A <b>&</b>', sub: '2026-05', fund: '신진연구', tier: 'SCIE' }));
  assert.match(html, /class="pcard" data-id="R01" data-status="심사 중" data-stu="홍길동" data-tier="SCIE" data-year="2026"/);
  assert.ok(html.includes('A &lt;b&gt;&amp;&lt;/b&gt;'));
  assert.ok(!html.includes('<b>&</b>'));
  assert.ok(html.includes('<span class="tier SCIE">SCI급</span>'));
  assert.ok(html.includes('<span class="sten s-UnderReview">Under Review</span>'));
  assert.ok(html.includes('<span class="fund">사사 신진연구</span>'));
  assert.ok(html.includes('투고 2026.05'));
  assert.ok(!html.includes('draggable'));
  assert.ok(!html.includes('class="memo'));
  assert.ok(!html.includes('data-menu'));
});

test('renderCard: 기입 필요 안내와 메모 열람 표시', () => {
  const html = renderCard(P('R02', '거절', { note: '첫 줄\n둘째 줄' }));
  assert.ok(html.includes('투고 연월 기입 필요'));
  assert.ok(html.includes('<span class="fund none">사사 기입 필요</span>'));
  assert.ok(html.includes('<span class="tier KCI">KCI</span>'));
  assert.ok(html.includes('<div class="memo view">첫 줄\n둘째 줄</div>'));
});

test('renderCard: 편집 모드 → draggable·메뉴 버튼·textarea(메모 내용 포함)', () => {
  const html = renderCard(P('R03', '수정 중', { note: 'x < y' }), { editing: true });
  assert.ok(html.includes('draggable="true"'));
  assert.ok(html.includes('data-menu="R03"'));
  assert.ok(html.includes('<textarea class="memo" data-note="R03"'));
  assert.ok(html.includes('>x &lt; y</textarea>'));
  const empty = renderCard(P('R04', '수정 중'), { editing: true });
  assert.ok(empty.includes('data-note="R04"'), '메모가 없어도 편집 모드에서는 textarea가 있어야 한다');
});

test('renderKanban: 5열, 열별 분배, 빈 열 안내', () => {
  const html = renderKanban([P('A', '투고 완료'), P('B', '심사 중'), P('C', '심사 중'), P('Z', '게재')]);
  assert.equal(count(html, /class="kcol"/g), 5);
  assert.ok(html.includes('data-stage="심사 중"'));
  assert.ok(!html.includes('data-id="Z"'), '아카이브 논문은 칸반에 없어야 한다');
  const cols = html.split('<div class="kcol"').slice(1);
  assert.equal(count(cols[1], /class="pcard"/g), 2);
  assert.ok(cols[1].includes('<span class="n num">2</span>'));
  assert.ok(cols[1].includes('<div class="kempty" hidden>'));
  assert.ok(cols[2].includes('<div class="kempty">'), '빈 열은 kempty가 보여야 한다');
});

test('renderArchive: 게재확정·게재만, 행 마크업, 빈 안내', () => {
  const html = renderArchive([P('R', '거절'), P('A1', '게재확정', { pub: '2026-03' }), P('A2', '게재')], { editing: true });
  assert.ok(!html.includes('data-id="R"'));
  assert.equal(count(html, /class="reqrow"/g), 2);
  assert.ok(html.includes('id="arch-empty" hidden'));
  assert.ok(html.includes('게재 2026.03'));
  assert.ok(html.includes('게재 연월 기입 필요'));
  assert.ok(html.includes('data-menu="A1"'));
  assert.ok(html.includes('data-note="A1"'));
  const none = renderArchive([P('R', '거절')]);
  assert.ok(none.includes('id="arch-empty" style'), '아카이브가 비면 hidden이 아니어야 한다');
});

test('renderKpis: 5타일, 값과 보조 문구', () => {
  const html = renderKpis([
    P('1', '투고 완료'), P('2', '심사 중', { jr: 'Cities' }), P('3', '심사 중', { jr: 'Cities' }),
    P('4', '수정 중'), P('5', '재투고'), P('6', '거절', { jr: 'Urban Climate', stu: '오재인' }), P('7', '게재확정'), P('8', '게재'),
  ]);
  assert.equal(count(html, /class="card kpi"/g), 5);
  const tiles = html.split('<div class="card kpi">').slice(1);
  assert.ok(tiles[0].includes('<div class="v num">6</div>'));
  assert.ok(tiles[0].includes('투고 1 · 심사 2 · 수정 1 · 재투고 1 · 거절 1'));
  assert.ok(tiles[1].includes('<div class="v num">2</div>') && tiles[1].includes('Cities 2'));
  assert.ok(tiles[2].includes('<div class="v num">2</div>') && tiles[2].includes('Under Revision 1 · Resubmitted 1'));
  assert.ok(tiles[3].includes('Urban Climate (오재인)'));
  assert.ok(tiles[4].includes('<div class="v num">2</div>') && tiles[4].includes('Accepted 1 · Published 1'));
});

test('renderChips: 주저자 중복 제거, 연도 파생/폴백, on 상태', () => {
  const a = renderChips([P('1', '거절', { stu: '가' }), P('2', '거절', { stu: '가' }), P('3', '거절', { stu: '나', sub: '2026-01' })]);
  assert.equal(count(a, /data-f="가"/g), 1);
  assert.ok(a.includes('class="fc on" data-f="전체"'));
  assert.ok(a.includes('data-y="2026">2026년</button>'));
  assert.ok(!a.includes('data-y="2025"'));
  const b = renderChips([P('1', '거절')], { f: '홍길동', t: 'KCI', y: '전체' });
  assert.ok(b.includes('class="fc on" data-f="홍길동"'));
  assert.ok(b.includes('class="fc on" data-t="KCI"'));
  assert.ok(b.includes('data-y="2025"'), 'sub가 없으면 2025~2027 폴백');
  assert.ok(b.includes('data-y="전체">전체 연도</button>'));
});

test('summary', () => {
  assert.deepEqual(summary([P('1', '거절'), P('2', '게재확정'), P('3', '게재')]), { act: 1, arch: 2 });
});
