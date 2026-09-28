# 투고 논문 탭 웹 편집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/papers` 페이지에서 카드 드래그 이동·메모·아카이브·기본정보 수정·새 논문 추가를 웹에서 바로 하고, 결과가 재배포 없이 Netlify Blobs에 저장되어 모든 방문자에게 보이게 한다.

**Architecture:** 도메인 규칙(`src/lib/papers/model.ts`)과 HTML 템플릿(`src/lib/papers/view.ts`)을 순수 TS 모듈 한 벌로 두고 Astro 빌드(SSR)·브라우저·Netlify 함수가 공유한다. Netlify Function `/api/papers`가 Blobs 문서(`{v, rev, updatedAt, papers}`)를 읽기→검증·적용→조건부 쓰기로 갱신하고 전체 최신 문서를 돌려준다. 브라우저는 낙관적 반영 후 서버 응답으로 다시 그린다. `scripts/papers-sync.mjs pull`이 빌드 전에 최신본을 `papers.json`으로 내려받아 git 이력·학생 상세 페이지를 맞춘다.

**Tech Stack:** Astro 5 + Tailwind 4(기존), TypeScript(브라우저·함수 공용, 지울 수 있는 문법만), Netlify Functions v2(`.mts`, `config.path`), `@netlify/blobs` 11.x(`getStore({consistency:'strong'})`, `setJSON` + `onlyIfMatch/onlyIfNew`), Node 24 내장 `node --test`(TS 직접 실행), Netlify CLI 27(전역 설치됨), Playwright MCP(브라우저 검증).

**설계 문서:** `docs/superpowers/specs/2026-09-28-papers-web-editing-design.md` (이 계획의 근거. 의문이 생기면 이 문서가 우선)

## Global Constraints

- 작업 브랜치 `feat/papers-web-editing` (이미 생성·체크아웃됨). `main`에 직접 커밋하지 않는다. push는 사용자 지시 전 금지.
- 커밋 메시지는 영어 `<type>: <description>` (기존 관례). 커밋 끝에 아래 두 줄을 붙인다:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01S4AQXwLAAybZ16gdPKs9j2`
- 워킹트리에 이미 수정된 `package-lock.json`이 있다(이번 작업과 무관한 기존 변경). `git add -A` 금지 — 파일을 지정해서 add 한다. 단, Task 4에서 의존성을 설치하면 lock 파일이 정당하게 바뀌므로 그때는 포함한다.
- `src/lib/papers/*.ts`는 Node 24 type stripping으로 실행되므로 **지울 수 있는 TS 문법만**: `enum`·`namespace`·parameter property·`import x = require` 금지, 타입만 가져올 때 `import type`, 상대 import에 **`.ts` 확장자 명시**(`./model.ts`). Astro/Vite도 이 형태를 그대로 해석한다(`allowImportingTsExtensions: true`).
- 상태 짝은 항상 표에서만 온다: 투고 완료=Submitted · 심사 중=Under Review · 수정 중=Under Revision · 재투고=Resubmitted · 거절=Rejected · 게재확정=Accepted · 게재=Published. 칸반 열 = 앞 5개, 아카이브 = 뒤 2개.
- 인증 없음(사용자 결정). `PAPERS_EDIT_PIN` 환경변수가 있을 때만 서버가 PIN을 요구한다. 지금은 설정하지 않는다.
- 이 PC의 HTTPS 호출(Netlify CLI, Node fetch)은 TLS 가로채기 때문에 `NODE_OPTIONS=--use-system-ca`가 필요하다. PowerShell: `$env:NODE_OPTIONS='--use-system-ca'`. localhost 호출에는 불필요. **단 `netlify dev`는 예외**: `NODE_OPTIONS=--use-system-ca`가 켜져 있으면 함수 워커(worker_threads)가 그 플래그를 거부해 모든 호출이 500이 난다(Task 4에서 확인). 로컬 개발은 항상 **`netlify dev --offline`**(환경변수 없이)로 실행한다 — offline이면 api.netlify.com을 부르지 않아 TLS 우회가 필요 없고, 함수·Blobs 샌드박스는 그대로 동작한다.
- 배포 주소: Netlify `https://sdclab-dashboard-156.netlify.app` (site id `c113708b-1106-46eb-bb94-4503818fa0aa`), 미러 `https://jaeho19.github.io/sdclab-dashboard/`.
- CSS는 기존 토큰(`--soft --line --muted --warn --danger --c-res --pill --info-bg …`)만 쓴다. 새 색 도입 금지. 메모는 회색 상자(주황 경고색 아님).
- 브라우저 `alert/confirm/prompt` 사용 금지(삭제는 2단계 버튼, PIN은 `<dialog>`).
- 각 Task 끝의 검증 명령을 실제로 실행하고 출력으로 확인한 뒤에만 완료로 표시한다.

## File Structure

| 파일 | 책임 |
|------|------|
| `src/lib/papers/model.ts` (+`model.test.ts`) | 타입, 상태 표, 검증(`normalizeFields`·`normalizeNote`·`validatePapers`), `nextId`, `placeInGroup`, `applyOp`, `canonical`, `seedDoc` |
| `src/lib/papers/view.ts` (+`view.test.ts`) | HTML 문자열 렌더: `renderKpis`·`renderChips`·`renderKanban`·`renderCard`·`renderArchive`·`renderArchiveRow`·`summary`, `esc` |
| `src/lib/papers/handler.ts` (+`handler.test.ts`) | `createPapersHandler({store, seed, …})` — GET/POST/OPTIONS, CORS, 재시도, 스냅샷, 선택적 PIN. `Store` 인터페이스 정의 |
| `src/lib/papers/client.ts` (+`client.test.ts`) | 브라우저용 순수 도우미: `apiUrlFor`, `dropIndex`, `fmtUpdated`, `debounce` |
| `netlify/functions/papers.mts` | `@netlify/blobs` → `Store` 어댑터, 핸들러 연결, `config.path = '/api/papers'` |
| `src/scripts/papers-board.ts` | 클라이언트 컨트롤러: 필터, 라이브 로드, 편집 스위치, DnD, 메뉴, 메모, 대화상자, 토스트, PIN 여지 |
| `src/pages/papers.astro` | SSR: `view.ts`로 조각 렌더 + 껍데기 요소(스위치·버튼·안내줄·대화상자·토스트·씨앗 JSON) + 스크립트 로드 |
| `src/styles/global.css` | 편집 UI 스타일 추가, `.warnline` 제거 |
| `scripts/papers-sync.mjs` | `pull / push / history / restore` |
| `scripts/lib/schemas.mjs` | `PaperSchema`에 `sub`·`pub` 추가 |
| `scripts/autosync.ps1` | 첫 단계에 pull 추가 |
| `netlify.toml`, `package.json` | 함수·dev 설정, 의존성, `test`/`prebuild`/`prebuild:pages`/`dev:netlify` 스크립트 |
| 삭제 | `src/components/dashboard/{PaperKanban,ArchiveList,KpiTiles,FilterChips}.astro` (papers.astro만 import함 — 확인됨) |
| 문서 | `README.md`, `편집가이드.md`, `docs/대시보드개편_구현계획서.md`, `docs/apps-script/DEPLOY.md`, 메모리 `netlify-deploy-tls-workaround.md` |

**공용 DOM 계약(모든 Task가 지킨다):** 컨테이너 id `kpis` `pfilters` `kanban` `archive`(행 목록) `archive-box`(드롭 대상 래퍼) · 헤더 id `act-count` `arch-total` `arch-count` `papers-updated` `papers-banner` `edit-toggle` `new-paper` `toast` · 대화상자 `paper-dialog`(`#paper-form #pd-title #pd-err #pd-delete #pd-cancel`) `pin-dialog`(`#pin-cancel`) · 씨앗 `papers-seed` · 빈 아카이브 `arch-empty`. 카드/행 속성 `data-id data-status data-stu data-tier data-year`, 열 `data-stage`, 메뉴 버튼 `data-menu`, 메모 `textarea.memo[data-note]`, 칩 `data-f|data-t|data-y`.

---

### Task 1: 도메인 모듈 `model.ts` (TDD)

**Files:**
- Create: `src/lib/papers/model.ts`
- Create: `src/lib/papers/model.test.ts`
- Modify: `package.json` (scripts에 `"test"` 추가)

**Interfaces:**
- Produces (이후 모든 Task가 사용):
  - `STATUSES`, `type Status`, `STATUS_EN: Record<Status, StatusEn>`, `type StatusEn`, `KANBAN_STATUSES: readonly Status[]`, `ARCHIVE_STATUSES: readonly Status[]`, `TIERS`, `type Tier`
  - `interface Paper { id; kind:'실제'; stu; t; tier: Tier; jr: string; st: Status; stEn: StatusEn; fund?: string|null; sub?: string; pub?: string; note?: string|null }`
  - `interface PapersDoc { v: 1; rev: number; updatedAt: string; papers: Paper[] }`
  - `groupOf(st): string` (아카이브 두 상태 → `'archive'`), `isArchived(p)`, `isStatus(v)`, `isTier(v)`, `stageOf(p)`
  - `normalizeFields(input, {partial}) → {ok:true, fields: PaperFields} | {ok:false, error}` (`PaperFields`의 `fund|sub|pub`가 `null`이면 "필드 제거")
  - `normalizeNote(v) → {ok:true, note: string|null} | {ok:false, error}`
  - `nextId(papers): string`, `canonical(p): Paper`, `withFields(p, fields): Paper`, `placeInGroup(papers, moved, index?)`, `validatePapers(input) → {ok:true, papers} | {ok:false, error}`
  - `applyOp(doc, rawOp, nowIso) → {ok:true, doc} | {ok:false, status: 400|404, error}` — op: `move|note|update|add|delete|replace`
  - `seedDoc(papers, nowIso): PapersDoc`

- [ ] **Step 1: 테스트 스크립트 등록**

`package.json`의 `"scripts"`에 한 줄 추가 (기존 `"preview"` 뒤):

```json
    "preview": "astro preview",
    "test": "node --test \"src/lib/papers/*.test.ts\""
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/papers/model.test.ts`:

```ts
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
```

- [ ] **Step 3: 실패 확인**

Run: `npm test`
Expected: `Cannot find module` (model.ts 없음) 으로 실패.

- [ ] **Step 4: `model.ts` 구현**

`src/lib/papers/model.ts`:

```ts
// 투고 논문 도메인 규칙 (설계 문서 §5·§6-1).
// 브라우저(낙관적 반영)·Netlify 함수(서버 적용)·scripts/papers-sync.mjs(검증)가 이 한 파일을 함께 쓴다.
// 의존성 없음. Node 24가 TS를 그대로 실행(type stripping)하므로 지울 수 있는 문법만 쓴다:
// enum·namespace·parameter property 금지, 타입만 가져올 때는 `import type`, 상대 import는 `.ts` 확장자 명시.

export const STATUSES = ['투고 완료', '심사 중', '수정 중', '재투고', '거절', '게재확정', '게재'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_EN = {
  '투고 완료': 'Submitted',
  '심사 중': 'Under Review',
  '수정 중': 'Under Revision',
  '재투고': 'Resubmitted',
  '거절': 'Rejected',
  '게재확정': 'Accepted',
  '게재': 'Published',
} as const;
export type StatusEn = (typeof STATUS_EN)[Status];

export const KANBAN_STATUSES: readonly Status[] = ['투고 완료', '심사 중', '수정 중', '재투고', '거절'];
export const ARCHIVE_STATUSES: readonly Status[] = ['게재확정', '게재'];

export const TIERS = ['SCIE', 'SSCI', 'KCI', 'und'] as const;
export type Tier = (typeof TIERS)[number];

export interface Paper {
  id: string;
  kind: '실제';
  stu: string;
  t: string;
  tier: Tier;
  jr: string;
  st: Status;
  stEn: StatusEn;
  fund?: string | null;
  sub?: string;
  pub?: string;
  note?: string | null;
}

export interface PapersDoc {
  v: 1;
  rev: number;
  updatedAt: string;
  papers: Paper[];
}

/** 정렬 그룹: 칸반 열은 상태 자체, 게재확정·게재는 합쳐서 'archive'. */
export function groupOf(st: Status): string {
  return ARCHIVE_STATUSES.includes(st) ? 'archive' : st;
}
export const isArchived = (p: Paper): boolean => groupOf(p.st) === 'archive';
export const isStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
export const isTier = (v: unknown): v is Tier => typeof v === 'string' && (TIERS as readonly string[]).includes(v);
/** KPI·화면 집계용: 게재확정도 '게재' 단계로 본다. */
export const stageOf = (p: Paper): string => (p.st === '게재확정' ? '게재' : p.st);

export const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
export const LIMITS = { t: 300, stu: 40, jr: 120, fund: 40, note: 2000 } as const;

export interface PaperFields {
  t?: string;
  stu?: string;
  jr?: string;
  tier?: Tier;
  /** null = 필드 제거 */
  fund?: string | null;
  /** null = 필드 제거 */
  sub?: string | null;
  /** null = 필드 제거 */
  pub?: string | null;
  st?: Status;
}
export const EDITABLE_KEYS = ['t', 'stu', 'jr', 'tier', 'fund', 'sub', 'pub', 'st'] as const;

export type Ok<T> = { ok: true } & T;
export type Fail = { ok: false; error: string };
type TextResult = Ok<{ value: string | null }> | Fail;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(v: unknown, label: string, max: number, required: boolean): TextResult {
  if (v === undefined || v === null) return required ? { ok: false, error: `${label}을(를) 입력하세요` } : { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error: `${label}은(는) 문자열이어야 합니다` };
  const s = v.trim();
  if (!s) return required ? { ok: false, error: `${label}을(를) 입력하세요` } : { ok: true, value: null };
  if (s.length > max) return { ok: false, error: `${label}은(는) ${max}자 이하여야 합니다` };
  return { ok: true, value: s };
}

function ym(v: unknown, label: string): TextResult {
  const r = text(v, label, 7, false);
  if (!r.ok) return r;
  if (r.value !== null && !YM.test(r.value)) return { ok: false, error: `${label}은(는) YYYY-MM 형식이어야 합니다` };
  return r;
}

/**
 * 편집 입력을 정규화한다. partial=true(update)면 온 필드만 검사하고, false(add)면 제목·주저자·저널이 필수다.
 * 반환 fields의 null은 "필드 제거"를 뜻한다(fund·sub·pub만 해당).
 */
export function normalizeFields(input: unknown, opts: { partial: boolean }): Ok<{ fields: PaperFields }> | Fail {
  if (!isObj(input)) return { ok: false, error: '필드 객체가 필요합니다' };
  for (const k of Object.keys(input)) {
    if (!(EDITABLE_KEYS as readonly string[]).includes(k)) return { ok: false, error: `허용되지 않는 필드: ${k}` };
  }
  const out: PaperFields = {};
  const req = !opts.partial;
  const has = (k: string) => k in input;
  if (req || has('t')) { const r = text(input.t, '제목', LIMITS.t, true); if (!r.ok) return r; out.t = r.value!; }
  if (req || has('stu')) { const r = text(input.stu, '주저자', LIMITS.stu, true); if (!r.ok) return r; out.stu = r.value!; }
  if (req || has('jr')) { const r = text(input.jr, '저널', LIMITS.jr, true); if (!r.ok) return r; out.jr = r.value!; }
  if (has('tier')) { if (!isTier(input.tier)) return { ok: false, error: '등급 값이 올바르지 않습니다' }; out.tier = input.tier; }
  if (has('fund')) { const r = text(input.fund, '사사', LIMITS.fund, false); if (!r.ok) return r; out.fund = r.value; }
  if (has('sub')) { const r = ym(input.sub, '투고 연월'); if (!r.ok) return r; out.sub = r.value; }
  if (has('pub')) { const r = ym(input.pub, '게재 연월'); if (!r.ok) return r; out.pub = r.value; }
  if (has('st')) { if (!isStatus(input.st)) return { ok: false, error: '상태 값이 올바르지 않습니다' }; out.st = input.st; }
  return { ok: true, fields: out };
}

/** 메모 정규화: 줄바꿈 통일, 양끝 공백 제거, 공백뿐이면 null(제거). */
export function normalizeNote(v: unknown): Ok<{ note: string | null }> | Fail {
  if (v === undefined || v === null) return { ok: true, note: null };
  if (typeof v !== 'string') return { ok: false, error: '메모는 문자열이어야 합니다' };
  const s = v.replace(/\r\n?/g, '\n').trim();
  if (s.length > LIMITS.note) return { ok: false, error: `메모는 ${LIMITS.note}자 이하여야 합니다` };
  return { ok: true, note: s || null };
}

/** 다음 빈 id: R·A 접두사의 숫자 최댓값 + 1 → R##(두 자리 이상). 아카이브해도 id는 바뀌지 않는다. */
export function nextId(papers: readonly Paper[]): string {
  let max = 0;
  for (const p of papers) {
    const m = /^[RA](\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R${String(max + 1).padStart(2, '0')}`;
}

/** 키 순서를 papers.json 관례(id kind stu t tier jr st stEn fund sub pub note)로 맞춘 사본. 빈 선택 필드는 뺀다. */
export function canonical(p: Paper): Paper {
  const out: Paper = { id: p.id, kind: '실제', stu: p.stu, t: p.t, tier: p.tier, jr: p.jr, st: p.st, stEn: STATUS_EN[p.st] };
  if (p.fund !== undefined && p.fund !== null && p.fund !== '') out.fund = p.fund;
  if (p.sub) out.sub = p.sub;
  if (p.pub) out.pub = p.pub;
  if (p.note) out.note = p.note;
  return out;
}

/** 필드 적용: null은 제거. st가 오면 stEn도 함께 바뀐다. */
export function withFields(p: Paper, f: PaperFields): Paper {
  const n: Paper = { ...p };
  if (f.t !== undefined) n.t = f.t;
  if (f.stu !== undefined) n.stu = f.stu;
  if (f.jr !== undefined) n.jr = f.jr;
  if (f.tier !== undefined) n.tier = f.tier;
  if (f.fund !== undefined) { if (f.fund === null) delete n.fund; else n.fund = f.fund; }
  if (f.sub !== undefined) { if (f.sub === null) delete n.sub; else n.sub = f.sub; }
  if (f.pub !== undefined) { if (f.pub === null) delete n.pub; else n.pub = f.pub; }
  if (f.st !== undefined) { n.st = f.st; n.stEn = STATUS_EN[f.st]; }
  return canonical(n);
}

/** 배열 전체 검증(교체·동기화·씨앗용). 성공 시 정본 키 순서로 정규화된 사본을 돌려준다. jr·tier는 옛 데이터 관용(빈 값·미정 허용). */
export function validatePapers(input: unknown): Ok<{ papers: Paper[] }> | Fail {
  if (!Array.isArray(input)) return { ok: false, error: 'papers는 배열이어야 합니다' };
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw: unknown = input[i];
    const at = `papers[${i}]`;
    if (!isObj(raw)) return { ok: false, error: `${at}: 객체가 아닙니다` };
    if (typeof raw.id !== 'string' || !raw.id.trim()) return { ok: false, error: `${at}: id가 없습니다` };
    const id = raw.id.trim();
    if (seen.has(id)) return { ok: false, error: `${at}: id 중복 ${id}` };
    seen.add(id);
    if (raw.kind !== undefined && raw.kind !== '실제') return { ok: false, error: `${at}: kind는 '실제'여야 합니다` };
    if (!isStatus(raw.st)) return { ok: false, error: `${at}: 상태 값이 올바르지 않습니다 (${String(raw.st)})` };
    const t = text(raw.t, '제목', LIMITS.t, true); if (!t.ok) return { ok: false, error: `${at}: ${t.error}` };
    const stu = text(raw.stu, '주저자', LIMITS.stu, true); if (!stu.ok) return { ok: false, error: `${at}: ${stu.error}` };
    const jr = text(raw.jr, '저널', LIMITS.jr, false); if (!jr.ok) return { ok: false, error: `${at}: ${jr.error}` };
    const fund = text(raw.fund, '사사', LIMITS.fund, false); if (!fund.ok) return { ok: false, error: `${at}: ${fund.error}` };
    const sub = ym(raw.sub, '투고 연월'); if (!sub.ok) return { ok: false, error: `${at}: ${sub.error}` };
    const pub = ym(raw.pub, '게재 연월'); if (!pub.ok) return { ok: false, error: `${at}: ${pub.error}` };
    const note = normalizeNote(raw.note); if (!note.ok) return { ok: false, error: `${at}: ${note.error}` };
    out.push(canonical({
      id, kind: '실제', stu: stu.value!, t: t.value!, tier: isTier(raw.tier) ? raw.tier : 'und', jr: jr.value ?? '',
      st: raw.st, stEn: STATUS_EN[raw.st], fund: fund.value, sub: sub.value ?? undefined, pub: pub.value ?? undefined, note: note.note,
    }));
  }
  return { ok: true, papers: out };
}

/** 그룹 안 index 위치에 삽입. papers에는 moved가 없어야 한다. index 생략·범위 밖 → 그룹 끝(그룹이 비었으면 배열 끝). */
export function placeInGroup(papers: readonly Paper[], moved: Paper, index?: number): Paper[] {
  const g = groupOf(moved.st);
  const members: number[] = [];
  papers.forEach((p, i) => { if (groupOf(p.st) === g) members.push(i); });
  let at: number;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= members.length) {
    at = members.length ? members[members.length - 1] + 1 : papers.length;
  } else {
    at = members[index];
  }
  return [...papers.slice(0, at), moved, ...papers.slice(at)];
}

export type ApplyResult = Ok<{ doc: PapersDoc }> | { ok: false; status: 400 | 404; error: string };
const bad = (error: string): ApplyResult => ({ ok: false, status: 400, error });
const notFound = (id: unknown): ApplyResult => ({ ok: false, status: 404, error: `해당 논문이 없습니다: ${String(id)}` });

/** 작업 하나를 적용한 새 문서를 돌려준다(입력 불변). raw는 네트워크에서 온 값이므로 여기서 모양까지 검사한다. */
export function applyOp(doc: PapersDoc, raw: unknown, now: string): ApplyResult {
  if (!isObj(raw) || typeof raw.op !== 'string') return bad('op가 필요합니다');
  const done = (papers: Paper[]): ApplyResult => ({ ok: true, doc: { v: 1, rev: doc.rev + 1, updatedAt: now, papers } });
  const find = (id: unknown): number => (typeof id === 'string' ? doc.papers.findIndex((p) => p.id === id) : -1);

  switch (raw.op) {
    case 'move': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      if (!isStatus(raw.st)) return bad('상태 값이 올바르지 않습니다');
      const index = raw.index === undefined || raw.index === null ? undefined : Number(raw.index);
      if (index !== undefined && !Number.isInteger(index)) return bad('index는 정수여야 합니다');
      const cur = doc.papers[i];
      const moved = canonical({ ...cur, st: raw.st, stEn: STATUS_EN[raw.st] });
      if (index === undefined && groupOf(cur.st) === groupOf(raw.st)) {
        const papers = doc.papers.slice();
        papers[i] = moved;
        return done(papers);
      }
      return done(placeInGroup(doc.papers.filter((_, k) => k !== i), moved, index));
    }
    case 'note': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      const n = normalizeNote(raw.note);
      if (!n.ok) return bad(n.error);
      const papers = doc.papers.slice();
      papers[i] = canonical({ ...papers[i], note: n.note });
      return done(papers);
    }
    case 'update': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      const f = normalizeFields(raw.fields, { partial: true });
      if (!f.ok) return bad(f.error);
      const cur = doc.papers[i];
      const next = withFields(cur, f.fields);
      if (f.fields.st !== undefined && groupOf(cur.st) !== groupOf(f.fields.st)) {
        return done(placeInGroup(doc.papers.filter((_, k) => k !== i), next));
      }
      const papers = doc.papers.slice();
      papers[i] = next;
      return done(papers);
    }
    case 'add': {
      const f = normalizeFields(raw.paper, { partial: false });
      if (!f.ok) return bad(f.error);
      const st = f.fields.st ?? '투고 완료';
      const base: Paper = {
        id: nextId(doc.papers), kind: '실제', stu: f.fields.stu!, t: f.fields.t!, tier: f.fields.tier ?? 'und', jr: f.fields.jr!,
        st, stEn: STATUS_EN[st],
      };
      return done([...doc.papers, withFields(base, { fund: f.fields.fund, sub: f.fields.sub, pub: f.fields.pub })]);
    }
    case 'delete': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      return done(doc.papers.filter((_, k) => k !== i));
    }
    case 'replace': {
      const v = validatePapers(raw.papers);
      if (!v.ok) return bad(v.error);
      return done(v.papers);
    }
    default:
      return bad(`알 수 없는 op: ${raw.op}`);
  }
}

export function seedDoc(papers: Paper[], now: string): PapersDoc {
  return { v: 1, rev: 0, updatedAt: now, papers };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: `pass 16`, `fail 0`. 실패하면 구현을 고친다(테스트를 약화시키지 말 것).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/papers/model.ts src/lib/papers/model.test.ts package.json
git commit -m "feat(papers): add shared domain model with op reducer and validation"
```
(커밋 메시지 끝에 Global Constraints의 attribution 두 줄을 붙인다. 이후 모든 커밋 동일.)

---
### Task 2: 렌더 모듈 `view.ts` (TDD)

**Files:**
- Create: `src/lib/papers/view.ts`
- Create: `src/lib/papers/view.test.ts`

**Interfaces:**
- Consumes: `Paper`, `KANBAN_STATUSES`, `isArchived`, `stageOf` (Task 1)
- Produces (Task 5 SSR·Task 6~9 브라우저가 사용):
  - `interface ViewOpts { editing?: boolean }`, `interface FilterState { f: string; t: string; y: string }`, `DEFAULT_FILTER`
  - `esc(s)`, `fmtYM(s)`, `yearOf(p)`, `tierBadge(tier)`, `stageBadge(stEn)`, `fundChip(fund)`
  - `renderCard(p, o?)`, `renderKanban(papers, o?)`, `renderArchiveRow(p, o?)`, `renderArchive(papers, o?)`, `renderKpis(papers)`, `renderChips(papers, state?)`, `summary(papers) → { act, arch }`
- 마크업은 기존 `KpiTiles/FilterChips/PaperKanban/ArchiveList.astro`와 배지 컴포넌트(`TierBadge`: `<span class="tier {tier}">{und→미정, SCIE→SCI급}</span>`, `StatusBadge stage`: `<span class="sten s-{stEn 공백제거}">{stEn}</span>`, `FundChip`: `<span class="fund">사사 {fund}</span>` / `<span class="fund none">사사 기입 필요</span>`)와 동일해야 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/papers/view.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: view.test.ts가 `Cannot find module` 로 실패(model 테스트는 통과).

- [ ] **Step 3: `view.ts` 구현**

`src/lib/papers/view.ts`:

```ts
// /papers 화면 조각 렌더 (설계 문서 §6-2). 빌드(Astro set:html)와 브라우저가 같은 함수를 쓴다.
// 사용자 입력은 전부 esc()를 거친다. 마크업·클래스는 예전 KpiTiles/FilterChips/PaperKanban/ArchiveList.astro와
// TierBadge/StatusBadge/FundChip.astro의 출력을 그대로 옮겼다(스타일은 global.css의 기존 규칙).
import type { Paper } from './model.ts';
import { KANBAN_STATUSES, isArchived, stageOf } from './model.ts';

export interface ViewOpts {
  editing?: boolean;
}
export interface FilterState {
  f: string;
  t: string;
  y: string;
}
export const DEFAULT_FILTER: FilterState = { f: '전체', t: '전체', y: '전체' };

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}
export const fmtYM = (s?: string | null): string => (s ? s.slice(0, 7).replace('-', '.') : '');
export const yearOf = (p: Paper): string => (p.sub ? p.sub.slice(0, 4) : '');

export const tierBadge = (tier: string): string =>
  `<span class="tier ${esc(tier)}">${esc(tier === 'und' ? '미정' : tier === 'SCIE' ? 'SCI급' : tier)}</span>`;
export const stageBadge = (stEn: string): string =>
  `<span class="sten s-${esc(stEn.replace(/\s+/g, ''))}">${esc(stEn)}</span>`;
export const fundChip = (fund?: string | null): string => {
  const l = fund?.trim();
  return l ? `<span class="fund">사사 ${esc(l)}</span>` : `<span class="fund none">사사 기입 필요</span>`;
};

const dataAttrs = (p: Paper): string =>
  `data-id="${esc(p.id)}" data-status="${esc(p.st)}" data-stu="${esc(p.stu)}" data-tier="${esc(p.tier)}" data-year="${esc(yearOf(p))}"`;

// 메모: 열람 모드는 있을 때만 회색 상자, 편집 모드는 항상 textarea(없는 메모도 새로 적을 수 있게).
function memoBox(p: Paper, editing: boolean): string {
  if (editing) {
    return `<textarea class="memo" data-note="${esc(p.id)}" rows="1" placeholder="메모…" aria-label="메모">${esc(p.note ?? '')}</textarea>`;
  }
  return p.note ? `<div class="memo view">${esc(p.note)}</div>` : '';
}
const menuBtn = (p: Paper): string =>
  `<button type="button" class="pmenu-btn" data-menu="${esc(p.id)}" aria-label="카드 메뉴" aria-haspopup="menu">⋯</button>`;

export function renderCard(p: Paper, o: ViewOpts = {}): string {
  const ed = !!o.editing;
  return `<div class="pcard" ${dataAttrs(p)}${ed ? ' draggable="true"' : ''}>
  <div class="t">${esc(p.t)}</div>
  <div class="m">${tierBadge(p.tier)}${stageBadge(p.stEn)}<span class="stu2">주저자 ${esc(p.stu)}</span>${fundChip(p.fund)}</div>
  <div class="m"><span class="jr">${esc(p.jr)}</span></div>
  <div class="m"><span class="stu2 num">${p.sub ? `투고 ${esc(fmtYM(p.sub))}` : '투고 연월 기입 필요'}</span></div>
  ${memoBox(p, ed)}${ed ? menuBtn(p) : ''}
</div>`;
}

export function renderKanban(papers: Paper[], o: ViewOpts = {}): string {
  return KANBAN_STATUSES.map((stage) => {
    const items = papers.filter((p) => p.st === stage);
    return `<div class="kcol" data-stage="${esc(stage)}">
  <h4>${esc(stage)} <span class="n num">${items.length}</span></h4>
  ${items.map((p) => renderCard(p, o)).join('\n')}
  <div class="kempty"${items.length ? ' hidden' : ''}>해당 상태의 논문 없음</div>
</div>`;
  }).join('\n');
}

export function renderArchiveRow(p: Paper, o: ViewOpts = {}): string {
  const ed = !!o.editing;
  return `<div class="reqrow" ${dataAttrs(p)}${ed ? ' draggable="true"' : ''}>
  ${stageBadge(p.stEn)}
  <b style="flex:1;min-width:220px">${esc(p.t)}</b>
  ${tierBadge(p.tier)}
  <span class="rq-std" style="flex:0 1 auto;min-width:0">${esc(p.jr)}</span>
  <span class="rq-now">주저자 ${esc(p.stu)}</span>
  ${fundChip(p.fund)}
  <span class="rq-now num">${p.pub ? `게재 ${esc(fmtYM(p.pub))}` : '게재 연월 기입 필요'}</span>
  ${memoBox(p, ed)}${ed ? menuBtn(p) : ''}
</div>`;
}

// 빈 안내(#arch-empty)를 맨 앞에 둔다: `.reqrow:last-child`가 마지막 행의 밑줄을 지우는 규칙을 유지하기 위해.
export function renderArchive(papers: Paper[], o: ViewOpts = {}): string {
  const arch = papers.filter(isArchived);
  return (
    `<div class="kempty" id="arch-empty"${arch.length ? ' hidden' : ''} style="margin:8px 0">표시할 게재 논문 없음</div>\n` +
    arch.map((p) => renderArchiveRow(p, o)).join('\n')
  );
}

export function renderKpis(papers: Paper[]): string {
  const act = papers.filter((p) => stageOf(p) !== '게재');
  const arch = papers.filter((p) => stageOf(p) === '게재');
  const cnt = (st: string) => act.filter((p) => p.st === st).length;
  const grouped = (arr: Paper[], key: (p: Paper) => string): [string, number][] => {
    const m = new Map<string, number>();
    for (const p of arr) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return [...m.entries()];
  };
  const reviewJournals = grouped(act.filter((p) => p.st === '심사 중'), (p) => p.jr)
    .map(([jr, n]) => (n > 1 ? `${jr} ${n}` : jr)).join(' · ');
  const respSub = grouped(act.filter((p) => p.st === '수정 중' || p.st === '재투고'), (p) => p.stEn)
    .map(([k, n]) => `${k} ${n}`).join(' · ');
  const rejectSub = act.filter((p) => p.st === '거절').map((p) => `${p.jr} (${p.stu})`).join(' · ');
  const archSub = grouped(arch, (p) => p.stEn).map(([k, n]) => `${k} ${n}`).join(' · ');
  const tiles = [
    { v: act.length, k: '투고 중인 연구', x: `투고 ${cnt('투고 완료')} · 심사 ${cnt('심사 중')} · 수정 ${cnt('수정 중')} · 재투고 ${cnt('재투고')} · 거절 ${cnt('거절')}` },
    { v: cnt('심사 중'), k: '심사 중', x: reviewJournals },
    { v: cnt('수정 중') + cnt('재투고'), k: '수정·재투고 대응', x: respSub },
    { v: cnt('거절'), k: '거절 — 재투고 검토', x: rejectSub },
    { v: arch.length, k: '아카이브 (게재)', x: archSub },
  ];
  return tiles
    .map((t) => `<div class="card kpi"><div class="v num">${t.v}</div><div class="k">${esc(t.k)}</div><div class="x">${esc(t.x)}</div></div>`)
    .join('\n');
}

export function renderChips(papers: Paper[], s: FilterState = DEFAULT_FILTER): string {
  const authors = ['전체', ...new Set(papers.map((p) => p.stu))];
  const tiers = ['전체', 'KCI', 'SCI급'];
  const derived = [...new Set(papers.map((p) => p.sub?.slice(0, 4)).filter((y): y is string => !!y))].sort();
  const years = ['전체', ...(derived.length ? derived : ['2025', '2026', '2027'])];
  const chip = (attr: string, v: string, on: boolean, label = v) =>
    `<button type="button" class="fc${on ? ' on' : ''}" ${attr}="${esc(v)}">${esc(label)}</button>`;
  const gap = '<span class="inline-block w-2.5" aria-hidden="true"></span>';
  return [
    ...authors.map((n) => chip('data-f', n, n === s.f)),
    gap,
    ...tiers.map((n) => chip('data-t', n, n === s.t)),
    gap,
    ...years.map((n) => chip('data-y', n, n === s.y, n === '전체' ? '전체 연도' : `${n}년`)),
  ].join('\n');
}

export function summary(papers: Paper[]): { act: number; arch: number } {
  const arch = papers.filter(isArchived).length;
  return { act: papers.length - arch, arch };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: model 16 + view 9 = `pass 25`, `fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/papers/view.ts src/lib/papers/view.test.ts
git commit -m "feat(papers): add shared HTML renderers for kanban, archive, KPI and chips"
```

---

### Task 3: 요청 처리기 `handler.ts` (TDD, 메모리 Store)

**Files:**
- Create: `src/lib/papers/handler.ts`
- Create: `src/lib/papers/handler.test.ts`

**Interfaces:**
- Consumes: `applyOp`, `seedDoc`, `validatePapers`, `PapersDoc` (Task 1)
- Produces (Task 4 함수가 사용):
  - `type WriteCond = { ifMatch: string } | { ifNew: true }`
  - `interface Store { read(): Promise<{doc: PapersDoc; etag: string} | null>; write(doc, cond: WriteCond): Promise<boolean>; writeSnapshot(rev, doc): Promise<void>; listSnapshots(): Promise<number[]>; readSnapshot(rev): Promise<PapersDoc|null>; deleteSnapshot(rev): Promise<void> }`
  - `interface HandlerOptions { store; seed: unknown; now?: () => string; pin?: string; allowedOrigins?: readonly string[]; snapshotKeep?: number; maxRetries?: number }`
  - `DEFAULT_ORIGINS`, `createPapersHandler(opts): (req: Request) => Promise<Response>`
- 응답 형식: 성공 `{ ok: true, source: 'blob'|'seed', rev, updatedAt, papers }`, 실패 `{ ok: false, error }`. 헤더 `cache-control: no-store`, CORS(허용 origin일 때만).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/papers/handler.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PapersDoc } from './model.ts';
import type { Store, WriteCond } from './handler.ts';
import { createPapersHandler } from './handler.ts';

class MemStore implements Store {
  state: { doc: PapersDoc; etag: string } | null = null;
  snaps = new Map<number, PapersDoc>();
  n = 0;
  failWrites = 0; // 앞으로 n번의 write를 조건 불일치로 실패시킨다
  async read() { return this.state ? { doc: structuredClone(this.state.doc), etag: this.state.etag } : null; }
  async write(doc: PapersDoc, cond: WriteCond) {
    if (this.failWrites > 0) { this.failWrites -= 1; return false; }
    if ('ifNew' in cond) { if (this.state) return false; }
    else if (!this.state || this.state.etag !== cond.ifMatch) return false;
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: handler.test.ts가 `Cannot find module` 로 실패.

- [ ] **Step 3: `handler.ts` 구현**

`src/lib/papers/handler.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: `pass 34`, `fail 0` (16 + 9 + 9).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/papers/handler.ts src/lib/papers/handler.test.ts
git commit -m "feat(papers): add framework-agnostic /api/papers handler with snapshots and CORS"
```

---
### Task 4: Netlify 함수 + 설정 + 로컬 왕복 확인

**Files:**
- Create: `netlify/functions/papers.mts`
- Modify: `netlify.toml` (`[functions]`, `[dev]` 추가)
- Modify: `package.json` (의존성 `@netlify/blobs`, devDependency `@netlify/functions`, 스크립트 `dev:netlify` = `netlify dev --offline`), `package-lock.json`

**Interfaces:**
- Consumes: `createPapersHandler`, `Store`, `WriteCond` (Task 3), `PapersDoc` (Task 1)
- Produces: HTTP 엔드포인트 `GET|POST|OPTIONS /api/papers` (로컬 `http://localhost:8888/api/papers`, 프로덕션 `https://sdclab-dashboard-156.netlify.app/api/papers`). Blobs store `papers`, 키 `state`, 스냅샷 `snap/000123`.

- [ ] **Step 1: 의존성 설치**

```powershell
npm install @netlify/blobs@^11.1.1
npm install -D @netlify/functions@^6.0.0
```
Expected: `package.json`에 두 항목 추가, 오류 없음. (이 PC에서 npm이 TLS 오류를 내면 `$env:NODE_OPTIONS='--use-system-ca'` 후 재시도.)

- [ ] **Step 2: `netlify.toml` 설정 추가**

기존 파일 끝에 추가:

```toml

# 웹 편집 API (netlify/functions/papers.mts → /api/papers). `netlify deploy`가 dist와 함께 번들·업로드한다.
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

# 로컬: `netlify dev --offline` = Astro dev(4321) 프록시 + 함수 + Blobs 샌드박스 → http://localhost:8888
# (offline이면 NODE_OPTIONS 불필요. NODE_OPTIONS=--use-system-ca를 켜면 함수 워커가 죽는다)
[dev]
  command = "npm run dev"
  targetPort = 4321
  port = 8888
  framework = "#custom"
  autoLaunch = false
```

`package.json` scripts에 추가: `"dev:netlify": "netlify dev --offline"`.

- [ ] **Step 3: 함수 작성**

`netlify/functions/papers.mts`:

```ts
// /api/papers — 투고 논문 웹 편집 백엔드 (설계 문서 §7).
// 요청 처리 로직은 src/lib/papers/handler.ts(테스트 가능), 여기서는 Netlify Blobs를 Store 인터페이스에 맞춰 연결만 한다.
// 강한 일관성: 저장 직후 새로고침해도 방금 바꾼 상태가 보여야 한다(기본 최종 일관성은 최대 60초 지연).
import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';
import { createPapersHandler } from '../../src/lib/papers/handler.ts';
import type { Store, WriteCond } from '../../src/lib/papers/handler.ts';
import type { PapersDoc } from '../../src/lib/papers/model.ts';
import seed from '../../content/dashboard/papers.json';

const STATE_KEY = 'state';
const snapKey = (rev: number) => `snap/${String(rev).padStart(6, '0')}`;

function blobStore(): Store {
  const store = getStore({ name: 'papers', consistency: 'strong' });
  return {
    async read() {
      const r = await store.getWithMetadata(STATE_KEY, { type: 'json' });
      return r ? { doc: r.data as PapersDoc, etag: r.etag } : null;
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
```

- [ ] **Step 4: `netlify dev`로 왕복 확인**

터미널 1(백그라운드): `netlify dev --offline` (NODE_OPTIONS 없이) → `Server now ready on http://localhost:8888` 확인(첫 기동 20~60초).
터미널 2(Git Bash):

```bash
curl -s http://localhost:8888/api/papers | head -c 200
# 기대: {"ok":true,"source":"seed","rev":0,"updatedAt":"...","papers":[{"id":"R01",...
curl -s -X POST -H 'content-type: application/json' \
  -d '{"op":"note","id":"R01","note":"local test"}' http://localhost:8888/api/papers | head -c 120
# 기대: {"ok":true,"source":"blob","rev":1,...
curl -s http://localhost:8888/api/papers | head -c 80
# 기대: "source":"blob","rev":1
curl -s -i -X OPTIONS -H 'Origin: https://jaeho19.github.io' http://localhost:8888/api/papers | grep -i access-control-allow-origin
# 기대: access-control-allow-origin: https://jaeho19.github.io
curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:8888/api/papers
# 기대: 405
```
샌드박스 데이터는 `.netlify/blobs-serve/` 아래에 생기며 gitignore 대상(`.netlify`)이다. 확인 후 `netlify dev`는 계속 켜 두어도 되고 종료해도 된다(다음 Task에서 다시 쓴다).

- [ ] **Step 5: 커밋**

```bash
git add netlify/functions/papers.mts netlify.toml package.json package-lock.json
git commit -m "feat(papers): add Netlify function backed by Blobs for /api/papers"
```

---

### Task 5: `papers.astro`를 `view.ts` 기반 SSR로 재구성 (동작 동일)

**Files:**
- Modify: `src/pages/papers.astro` (frontmatter·본문 교체, 인라인 필터 스크립트는 **그대로 유지**)
- Delete: `src/components/dashboard/PaperKanban.astro`, `ArchiveList.astro`, `KpiTiles.astro`, `FilterChips.astro`
- Modify: `src/styles/global.css` (`.pcard .warnline` 규칙 삭제, `.memo` 열람 스타일 추가)

**Interfaces:**
- Consumes: `validatePapers`, `STATUSES` (Task 1), `renderKpis/renderChips/renderKanban/renderArchive/summary` (Task 2)
- Produces: 공용 DOM 계약의 컨테이너 id(`kpis pfilters kanban archive archive-box act-count arch-total arch-count`). 이 Task 이후 화면은 이전과 같아야 한다(메모는 주황 한 줄 → 회색 상자).

- [ ] **Step 1: 변경 전 기준값 기록**

```bash
npm run build 2>&1 | tail -3
grep -o 'class="pcard"' dist/papers/index.html | wc -l      # 기대 11
grep -o 'class="reqrow"' dist/papers/index.html | wc -l     # 기대 6
grep -o 'class="card kpi"' dist/papers/index.html | wc -l   # 기대 5
grep -o 'class="fc' dist/papers/index.html | wc -l          # 기대 15 (주저자 9 + 등급 3 + 연도 3: sub가 있는 R05 → 2026년 1개 + 전체)
```
숫자는 현재 papers.json 기준. 실제 출력값을 메모해 두고 변경 후와 비교한다(마지막 줄은 데이터에 따라 다를 수 있으니 "변경 전후 동일"만 확인).

- [ ] **Step 2: `papers.astro` 재작성**

파일 전체를 아래로 교체한다. **`<script>` 블록(필터)은 기존 내용을 글자 그대로 유지**한다(아래에는 `…기존 필터 스크립트 그대로…`로 표시. Task 6에서 모듈로 옮긴다).

```astro
---
// 투고 논문 (papers) — 빌드 시점 데이터로 먼저 그리고(SSR), 클라이언트가 /api/papers에서 최신을 받아 같은
// 템플릿(src/lib/papers/view.ts)으로 다시 그린다. 편집(드래그·메모·아카이브·수정·추가)은 src/scripts/papers-board.ts.
// 설계: docs/superpowers/specs/2026-09-28-papers-web-editing-design.md
import Base from '../layouts/Base.astro';
import Card from '../components/dashboard/Card.astro';
import ConfRadar from '../components/dashboard/ConfRadar.astro';
import papersData from '../../content/dashboard/papers.json';
import conferencesData from '../../content/dashboard/conferences.json';
import { validatePapers } from '../lib/papers/model.ts';
import { renderArchive, renderChips, renderKanban, renderKpis, summary } from '../lib/papers/view.ts';

// /papers shows real papers only (kind === "실제"); planned rows live under the roadmap tab.
const v = validatePapers((papersData as { kind?: string }[]).filter((p) => p.kind === '실제'));
if (!v.ok) throw new Error(`content/dashboard/papers.json 검증 실패: ${v.error}`);
const papers = v.papers;
const { act: actCount, arch: archCount } = summary(papers);
---

<Base title="투고 논문 · SDC Lab" description="SDC Lab 실제 투고 논문의 심사 파이프라인·게재 아카이브·학회 레이더">
  <h1 class="mb-1 text-balance text-[1.55rem] font-extrabold tracking-[-.02em] text-slate-900">투고 논문</h1>
  <p class="mb-5 text-[13px] text-[var(--muted)]">
    실제 투고된 논문만 표시 — 투고 중 <span id="act-count" class="num">{actCount}</span>편 · 게재 아카이브
    <span id="arch-total" class="num">{archCount}</span>편. 구상·집필 단계 계획은 졸업 로드맵 탭의 학생 상세에서 확인합니다.
  </p>

  <div id="kpis" class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
    <Fragment set:html={renderKpis(papers)} />
  </div>

  <h2 class="sec mt-7 mb-3">
    투고 파이프라인
    <span class="font-medium normal-case tracking-normal">— 실제 투고된 논문만 (계획 단계 논문은 졸업 로드맵의 학생 상세에서 확인)</span>
  </h2>
  <div id="pfilters" class="mb-3.5 flex flex-wrap gap-1.5">
    <Fragment set:html={renderChips(papers)} />
  </div>
  <div
    id="kanban"
    class="grid gap-2.5 overflow-x-auto [grid-template-columns:repeat(5,minmax(190px,1fr))] max-[1080px]:[grid-template-columns:repeat(5,200px)]"
  >
    <Fragment set:html={renderKanban(papers)} />
  </div>

  <h2 class="sec mt-7 mb-3">
    아카이브 — 게재 완료
    <span id="arch-count" class="num font-medium normal-case tracking-normal">— {archCount}건</span>
  </h2>
  <div id="archive-box">
    <Card pad="p-[8px_16px]">
      <div id="archive">
        <Fragment set:html={renderArchive(papers)} />
      </div>
    </Card>
  </div>

  <h2 class="sec mt-7 mb-3">학회 레이더</h2>
  <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(255px,1fr))]">
    <ConfRadar conferences={conferencesData} />
  </div>
</Base>

<script>
  …기존 필터 스크립트 그대로…
</script>
```

- [ ] **Step 3: 컴포넌트 삭제·CSS 정리**

```bash
git rm src/components/dashboard/PaperKanban.astro src/components/dashboard/ArchiveList.astro src/components/dashboard/KpiTiles.astro src/components/dashboard/FilterChips.astro
grep -rn "PaperKanban\|ArchiveList\|KpiTiles\|FilterChips" src   # 기대: 출력 없음
```

`src/styles/global.css`에서 아래 블록을 **삭제**:

```css
  .pcard .warnline {
    font-size: 10.5px;
    color: var(--warn);
    font-weight: 600;
    margin-top: 5px;
  }
```

같은 자리에 메모 열람 스타일을 **추가**(편집용 textarea 스타일은 Task 8에서 확장):

```css
  /* 메모(웹 편집) — 주황 경고줄 대신 회색 상자. 열람 모드는 내용이 있을 때만 렌더된다. */
  .memo {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: 7px;
    font: inherit;
    font-size: 11px;
    line-height: 1.45;
    color: #3f4756;
    background: var(--soft);
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 6px 8px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reqrow .memo {
    flex-basis: 100%;
    margin-top: 2px;
  }
```

- [ ] **Step 4: 빌드·동등성 확인**

```bash
npm run build 2>&1 | tail -3        # 기대: 오류 없이 완료
grep -o 'class="pcard"' dist/papers/index.html | wc -l      # Step 1과 동일
grep -o 'class="reqrow"' dist/papers/index.html | wc -l     # Step 1과 동일
grep -o 'class="card kpi"' dist/papers/index.html | wc -l   # Step 1과 동일
grep -o 'class="fc' dist/papers/index.html | wc -l          # Step 1과 동일
grep -c 'class="memo view"' dist/papers/index.html          # 기대: 2 (R02·R07 note)
grep -c 'warnline' dist/papers/index.html                   # 기대: 0
grep -o 'id="[a-z-]*"' dist/papers/index.html | sort -u | grep -E 'kpis|pfilters|kanban|archive|arch-count|act-count|arch-total'   # 7개 모두
```
`npm run preview` 후 http://localhost:4321/papers/ 를 열어 필터 칩 클릭이 여전히 열 개수·아카이브 건수를 바꾸는지 확인한다(기존 인라인 스크립트가 같은 DOM에서 동작).

- [ ] **Step 5: 커밋**

```bash
git add src/pages/papers.astro src/styles/global.css
git commit -m "refactor(papers): render page sections from shared view module"
```
(`git rm`한 네 파일은 이미 스테이징돼 있다.)

---
### Task 6: 클라이언트 기반 — 도우미 모듈, 라이브 로드, 필터 이관, 페이지 껍데기

**Files:**
- Create: `src/lib/papers/client.ts`, `src/lib/papers/client.test.ts`
- Create: `src/scripts/papers-board.ts`
- Modify: `src/pages/papers.astro` (헤더 요소·안내줄·토스트·씨앗 JSON 추가, 인라인 필터 `<script>` 제거 → 모듈 import)
- Modify: `src/styles/global.css` (`.edit-switch .btn-new .banner .toast` 추가)

**Interfaces:**
- Consumes: `Paper`, `PapersDoc` (Task 1), `renderKpis/renderChips/renderKanban/renderArchive/summary`, `FilterState` (Task 2)
- Produces:
  - `client.ts`: `apiUrlFor(hostname, prod?)`, `dropIndex(members, draggedId, nextId)`, `fmtUpdated(iso)`, `debounce(fn, ms)` (`.cancel()` 포함)
  - `papers-board.ts` 내부 함수(이후 Task가 확장): `doc`, `source`, `live`, `editing`, `saving`, `filter`, `els`, `render()`, `applyFilter()`, `fetchDoc()`, `adopt(d)`, `load()`, `refresh()`, `setBanner(msg)`, `showUpdated()`
  - 페이지 요소: `#edit-toggle`(초기 `disabled`), `#new-paper`(초기 `hidden`), `#papers-updated`, `#papers-banner`, `#toast`, `#papers-seed`

- [ ] **Step 1: 도우미 테스트 작성**

`src/lib/papers/client.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrlFor, debounce, dropIndex, fmtUpdated } from './client.ts';

test('apiUrlFor: localhost·netlify.app은 상대 경로, 그 외(미러)는 프로덕션 절대 주소', () => {
  assert.equal(apiUrlFor('localhost'), '/api/papers');
  assert.equal(apiUrlFor('127.0.0.1'), '/api/papers');
  assert.equal(apiUrlFor('sdclab-dashboard-156.netlify.app'), '/api/papers');
  assert.equal(apiUrlFor('68d0--sdclab-dashboard-156.netlify.app'), '/api/papers', '초안 배포 URL도 상대 경로');
  assert.equal(apiUrlFor('jaeho19.github.io'), 'https://sdclab-dashboard-156.netlify.app/api/papers');
});

test('dropIndex: 다음 카드의 그룹 내 순번(드래그 카드 제외), 없으면 undefined', () => {
  const members = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
  assert.equal(dropIndex(members, 'D', 'A'), 0);
  assert.equal(dropIndex(members, 'A', 'C'), 1, 'A를 빼면 [B,C,D]에서 C는 1');
  assert.equal(dropIndex(members, 'B', 'B'), undefined, '자기 자신 앞은 위치 없음 → 끝');
  assert.equal(dropIndex(members, 'A', null), undefined);
  assert.equal(dropIndex(members, 'A', 'zz'), undefined);
});

test('fmtUpdated: KST YYYY-MM-DD HH:mm', () => {
  assert.equal(fmtUpdated('2026-09-28T05:02:00.000Z'), '2026-09-28 14:02');
  assert.equal(fmtUpdated('not a date'), '');
});

test('debounce: 마지막 호출만, cancel 가능', async () => {
  const calls: number[] = [];
  const d = debounce((n: number) => calls.push(n), 20);
  d(1); d(2); d(3);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, [3]);
  d(4); d.cancel();
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, [3]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: client.test.ts만 `Cannot find module` 로 실패.

- [ ] **Step 3: `client.ts` 구현**

```ts
// 브라우저 컨트롤러(src/scripts/papers-board.ts)가 쓰는 순수 도우미. DOM 의존 없음 → node --test로 검증.

const PROD_API = 'https://sdclab-dashboard-156.netlify.app/api/papers';

/** 같은 Netlify 사이트(초안 배포 포함)·로컬은 상대 경로, GitHub Pages 미러 등은 프로덕션 절대 주소(CORS 허용 목록에 있음). */
export function apiUrlFor(hostname: string, prod: string = PROD_API): string {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.netlify.app')) return '/api/papers';
  return prod;
}

/**
 * 드롭 위치 → move op의 index. members는 대상 그룹 구성원을 문서 순서대로(필터로 숨겨진 카드 포함).
 * 서버(model.placeInGroup)는 드래그 카드를 뺀 뒤 그룹 안 순번으로 삽입하므로 여기서도 드래그 카드를 빼고 센다.
 * nextId(놓는 자리 바로 다음에 보이는 카드)가 없으면 undefined → 그룹 끝.
 */
export function dropIndex(members: readonly { id: string }[], draggedId: string, nextId: string | null): number | undefined {
  if (!nextId) return undefined;
  const i = members.filter((m) => m.id !== draggedId).findIndex((m) => m.id === nextId);
  return i < 0 ? undefined : i;
}

/** ISO → 'YYYY-MM-DD HH:mm' (Asia/Seoul). 파싱 실패 시 ''. */
export function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const run = ((...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = undefined; fn(...args); }, ms);
  }) as ((...args: A) => void) & { cancel(): void };
  run.cancel = () => { if (t) clearTimeout(t); t = undefined; };
  return run;
}
```

Run: `npm test` → Expected `pass 38`, `fail 0`.

- [ ] **Step 4: 페이지 껍데기 요소 추가·인라인 스크립트 제거**

`src/pages/papers.astro`에서

(a) `<h1 …>투고 논문</h1>` 한 줄을 아래 블록으로 교체:

```astro
  <div class="mb-1 flex flex-wrap items-center gap-3">
    <h1 class="text-balance text-[1.55rem] font-extrabold tracking-[-.02em] text-slate-900">투고 논문</h1>
    <button id="edit-toggle" type="button" class="edit-switch" role="switch" aria-checked="false" disabled title="켜면 카드 드래그·메모·수정이 가능합니다">편집</button>
    <button id="new-paper" type="button" class="btn-new" hidden>새 논문 +</button>
    <span id="papers-updated" class="text-[11.5px] text-[var(--muted)]">빌드 시점 데이터</span>
  </div>
```

(b) 소개 `<p class="mb-5 …">` 의 `mb-5`를 `mb-3`으로 바꾸고, 그 `</p>` 바로 뒤에 추가:

```astro
  <div id="papers-banner" class="banner" role="status" hidden></div>
```

(c) `</Base>` 바로 앞(학회 레이더 grid 뒤)에 추가:

```astro
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script is:inline type="application/json" id="papers-seed" set:html={JSON.stringify(papers).replace(/</g, '\\u003c')} />
```

(d) 파일 끝의 `<script> …기존 필터 스크립트… </script>` 전체를 아래로 교체:

```astro
<script>
  import '../scripts/papers-board';
</script>
```

- [ ] **Step 5: `papers-board.ts` 작성(기반부)**

`src/scripts/papers-board.ts`:

```ts
// /papers 클라이언트 컨트롤러 (설계 문서 §8). 정적 빌드 위에 얹는 점진적 향상:
//  1) 필터 칩  2) /api/papers 라이브 로드·마지막 수정 표시·오프라인 안내  3) 편집 스위치
//  4) 드래그 이동·카드 메뉴  5) 메모 자동 저장  6) 수정/새 논문 대화상자  7) 토스트·PIN 여지
// 이벤트는 컨테이너에 위임한다 → 다시 그려도 재바인딩 불필요. 렌더 템플릿은 src/lib/papers/view.ts(빌드와 동일).
import type { Paper, PapersDoc } from '../lib/papers/model.ts';
import { renderArchive, renderChips, renderKanban, renderKpis, summary } from '../lib/papers/view.ts';
import type { FilterState } from '../lib/papers/view.ts';
import { apiUrlFor, fmtUpdated } from '../lib/papers/client.ts';

type ApiDoc = { ok: true; source: 'blob' | 'seed'; rev: number; updatedAt: string; papers: Paper[] };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const els = {
  kpis: $('#kpis'),
  filters: $('#pfilters'),
  kanban: $('#kanban'),
  archive: $('#archive'),
  archiveBox: $('#archive-box'),
  archCount: $('#arch-count'),
  actCount: $('#act-count'),
  archTotal: $('#arch-total'),
  updated: $('#papers-updated'),
  banner: $('#papers-banner'),
  editBtn: $<HTMLButtonElement>('#edit-toggle'),
  newBtn: $<HTMLButtonElement>('#new-paper'),
  toast: $('#toast'),
  dialog: $<HTMLDialogElement>('#paper-dialog'),
  pinDialog: $<HTMLDialogElement>('#pin-dialog'),
};

// ── 상태 ──────────────────────────────────────────────
const API = apiUrlFor(location.hostname);
let doc: PapersDoc = readSeed();
let source: 'seed' | 'blob' = 'seed';
let live = false; // API에서 문서를 받았는가
let editing = false; // 편집 모드
let saving = 0; // 진행 중인 쓰기 수
const filter: FilterState = { f: '전체', t: '전체', y: '전체' };

function readSeed(): PapersDoc {
  const el = document.getElementById('papers-seed');
  const papers = el ? (JSON.parse(el.textContent || '[]') as Paper[]) : [];
  return { v: 1, rev: 0, updatedAt: '', papers };
}

// ── 렌더·필터 ─────────────────────────────────────────
function render(): void {
  if (!els.kpis || !els.filters || !els.kanban || !els.archive) return;
  const o = { editing };
  if (!doc.papers.some((p) => p.stu === filter.f)) filter.f = '전체'; // 삭제된 주저자 필터 해제
  els.kpis.innerHTML = renderKpis(doc.papers);
  els.filters.innerHTML = renderChips(doc.papers, filter);
  els.kanban.innerHTML = renderKanban(doc.papers, o);
  els.archive.innerHTML = renderArchive(doc.papers, o);
  const s = summary(doc.papers);
  if (els.actCount) els.actCount.textContent = String(s.act);
  if (els.archTotal) els.archTotal.textContent = String(s.arch);
  applyFilter();
}

// 기존 인라인 필터(spec §4.4) 이관 — 보이기/숨기기만 하고 다시 그리지 않는다.
function matches(el: HTMLElement): boolean {
  const stu = el.dataset.stu ?? '';
  const tier = el.dataset.tier ?? '';
  const year = el.dataset.year ?? '';
  const okAuthor = filter.f === '전체' || stu === filter.f;
  const okTier = filter.t === '전체' || (filter.t === 'KCI' ? tier === 'KCI' : tier !== 'KCI');
  const okYear = filter.y === '전체' || !year || year === filter.y;
  return okAuthor && okTier && okYear;
}

function applyFilter(): void {
  document.querySelectorAll<HTMLElement>('.pcard[data-id]').forEach((el) => {
    el.hidden = !matches(el);
  });
  document.querySelectorAll<HTMLElement>('.kcol').forEach((col) => {
    const visible = col.querySelectorAll('.pcard[data-id]:not([hidden])').length;
    const n = col.querySelector('h4 .n');
    if (n) n.textContent = String(visible);
    const empty = col.querySelector<HTMLElement>('.kempty');
    if (empty) empty.hidden = visible > 0;
  });
  let archVisible = 0;
  document.querySelectorAll<HTMLElement>('.reqrow[data-id]').forEach((el) => {
    const ok = matches(el);
    el.hidden = !ok;
    if (ok) archVisible += 1;
  });
  if (els.archCount) els.archCount.textContent = `— ${archVisible}건`;
  const archEmpty = document.getElementById('arch-empty');
  if (archEmpty) archEmpty.hidden = archVisible > 0;
}

els.filters?.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('.fc');
  if (!btn || !els.filters) return;
  const ds = btn.dataset;
  const group: keyof FilterState = ds.f !== undefined ? 'f' : ds.t !== undefined ? 't' : 'y';
  filter[group] = ds[group] ?? '전체';
  els.filters.querySelectorAll(`[data-${group}]`).forEach((b) => b.classList.remove('on'));
  btn.classList.add('on');
  applyFilter();
});

// ── 라이브 로드 ───────────────────────────────────────
function setBanner(msg: string | null): void {
  if (!els.banner) return;
  els.banner.hidden = !msg;
  els.banner.textContent = msg ?? '';
}

function showUpdated(): void {
  if (!els.updated) return;
  if (!live) els.updated.textContent = '빌드 시점 데이터';
  else if (source === 'seed') els.updated.textContent = '실시간 · 아직 웹 편집 없음';
  else els.updated.textContent = `마지막 수정 ${fmtUpdated(doc.updatedAt)} · 실시간`;
}

async function fetchDoc(): Promise<ApiDoc> {
  const r = await fetch(API, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as ApiDoc;
  if (!d.ok || !Array.isArray(d.papers)) throw new Error('응답 형식 오류');
  return d;
}

function adopt(d: ApiDoc): void {
  doc = { v: 1, rev: d.rev, updatedAt: d.updatedAt, papers: d.papers };
  source = d.source;
}

async function load(): Promise<void> {
  try {
    adopt(await fetchDoc());
    live = true;
    setBanner(null);
    if (els.editBtn) els.editBtn.disabled = false;
    render();
    showUpdated();
  } catch (err) {
    live = false;
    setBanner('실시간 데이터를 불러오지 못해 빌드 시점 상태를 표시합니다. 편집은 잠시 사용할 수 없습니다.');
    if (els.editBtn) els.editBtn.disabled = true;
    showUpdated();
    console.warn('[papers] live load failed:', err);
  }
}

// 다른 탭·기기에서 바꾼 내용 반영: 탭이 다시 보일 때, 입력 중이 아니고 저장 중이 아닐 때만.
async function refresh(): Promise<void> {
  if (!live || saving > 0 || els.dialog?.open) return;
  if (document.activeElement?.matches('textarea.memo, input, select')) return;
  try {
    const d = await fetchDoc();
    if (d.rev !== doc.rev) {
      adopt(d);
      render();
      showUpdated();
    }
  } catch {
    /* 조용히 무시 — 다음 기회에 */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});

// ── 부팅 ─────────────────────────────────────────────
void load();
```

- [ ] **Step 6: CSS 추가**

`src/styles/global.css`의 `@layer components { … }` 안, `.memo` 규칙 뒤에 추가:

```css
  /* ── 웹 편집 UI (papers) ── */
  .edit-switch,
  .btn-new {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    border-radius: 99px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .edit-switch[aria-checked='true'] {
    background: var(--pill);
    color: var(--pill-ink);
    border-color: var(--pill);
  }
  .edit-switch:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn-new {
    color: var(--ok);
    border-color: color-mix(in srgb, var(--ok) 35%, transparent);
    background: var(--ok-bg);
  }
  .banner {
    background: var(--warn-bg);
    color: var(--warn);
    border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    translate: -50% 12px;
    background: var(--pill);
    color: var(--pill-ink);
    font-size: 12.5px;
    font-weight: 600;
    border-radius: 99px;
    padding: 8px 16px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s, translate 0.18s;
    z-index: 50;
    max-width: min(90vw, 480px);
  }
  .toast.show {
    opacity: 1;
    translate: -50% 0;
  }
  .toast.error {
    background: var(--danger);
  }
```

- [ ] **Step 7: 확인 (netlify dev --offline + 브라우저)**

1. `npm run build` → 오류 없음. `grep -c 'papers-seed' dist/papers/index.html` → 1.
2. `netlify dev --offline`(백그라운드, NODE_OPTIONS 없이) 후 Playwright MCP(`mcp__playwright__browser_navigate` 등)로 `http://localhost:8888/papers/` 열기:
   - `#papers-updated` 텍스트가 `마지막 수정 … · 실시간`(Task 4에서 note를 써서 blob 상태) 또는 `실시간 · 아직 웹 편집 없음`.
   - `#edit-toggle`이 `disabled`가 아니다. `#papers-banner`는 hidden.
   - 필터 칩 `강성익` 클릭 → 심사 중 열 개수(`h4 .n`)가 0, 수정 중 열이 1, 아카이브 `— 0건`. `전체` 클릭 시 복귀.
   - Task 4에서 넣은 R01 메모 `local test`가 거절 열 R01 카드 아래 회색 `.memo.view`로 보인다.
3. 오프라인 경로: `http://localhost:4321/papers/`(Astro dev 직접, `/api/papers` 없음) 열기 → 노란 안내줄 표시, `#edit-toggle` disabled, `#papers-updated` = `빌드 시점 데이터`, 필터는 동작.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/papers/client.ts src/lib/papers/client.test.ts src/scripts/papers-board.ts src/pages/papers.astro src/styles/global.css
git commit -m "feat(papers): live-load board from /api/papers with offline fallback"
```

---
### Task 7: 편집 스위치 · 낙관적 저장 · 드래그 이동 · 카드 메뉴(이동/아카이브/복원/게재 전환)

**Files:**
- Modify: `src/scripts/papers-board.ts` (import 확장, 상수, `load()` 수정, 토스트·편집 스위치·commit·DnD·메뉴 섹션 추가)
- Modify: `src/styles/global.css` (드래그·메뉴·저장 중 스타일)

**Interfaces:**
- Consumes: `applyOp`, `groupOf`, `isArchived`, `KANBAN_STATUSES`, `Status` (Task 1), `dropIndex` (Task 6), Task 6의 `doc/live/editing/saving/els/render/adopt/showUpdated`
- Produces(Task 8·9가 사용): `toast(msg, kind?)`, `setEditing(on)`, `type Op`, `commit(op, {busyId?, rerender?, quiet?}) → Promise<boolean>`, `post(op)`, `readPin()`, `openMenu/closeMenu/act(kind, id)`, 상수 `LS_EDIT='papers.edit'`, `LS_PIN='papers.pin'`

- [ ] **Step 1: import·상수 수정**

`papers-board.ts` 상단의 import 세 줄을 아래로 교체:

```ts
import type { Paper, PapersDoc, Status } from '../lib/papers/model.ts';
import { applyOp, groupOf, isArchived, KANBAN_STATUSES } from '../lib/papers/model.ts';
import { renderArchive, renderChips, renderKanban, renderKpis, summary } from '../lib/papers/view.ts';
import type { FilterState } from '../lib/papers/view.ts';
import { apiUrlFor, dropIndex, fmtUpdated } from '../lib/papers/client.ts';
```

`const API = apiUrlFor(location.hostname);` 바로 아래에 추가:

```ts
const LS_EDIT = 'papers.edit'; // 편집 스위치 상태(브라우저별 기억)
const LS_PIN = 'papers.pin'; // PIN 여지(서버에 PAPERS_EDIT_PIN이 설정된 경우에만 쓰임)
```

- [ ] **Step 2: `load()` 수정 — 성공 시 편집 상태 복원, 실패 시 편집 해제**

`load()`의 성공 분기에서 `render();` 한 줄을 아래로 교체:

```ts
    let wantEdit = false;
    try {
      wantEdit = localStorage.getItem(LS_EDIT) === '1';
    } catch {
      /* 저장소 접근 불가 → 열람 모드 */
    }
    setEditing(wantEdit); // 안에서 render()
```

실패 분기(`catch`)의 `if (els.editBtn) els.editBtn.disabled = true;` 다음 줄에 추가:

```ts
    editing = false;
    document.body.classList.remove('editing');
```

- [ ] **Step 3: 토스트·편집 스위치·commit 섹션 추가**

`// ── 부팅 ──` 섹션 **바로 위**에 추가:

```ts
// ── 토스트 ────────────────────────────────────────────
let toastTimer = 0;
function toast(msg: string, kind: 'ok' | 'error' = 'ok'): void {
  const t = els.toast;
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), kind === 'error' ? 5000 : 1800);
}

// ── 편집 스위치 ───────────────────────────────────────
function setEditing(on: boolean): void {
  editing = on && live;
  document.body.classList.toggle('editing', editing);
  if (els.editBtn) {
    els.editBtn.setAttribute('aria-checked', String(editing));
    els.editBtn.textContent = editing ? '편집 중' : '편집';
  }
  if (els.newBtn) els.newBtn.hidden = !editing;
  try {
    localStorage.setItem(LS_EDIT, editing ? '1' : '0');
  } catch {
    /* 무시 */
  }
  render();
}
els.editBtn?.addEventListener('click', () => setEditing(!editing));

// ── 저장: 낙관적 반영 → POST → 실패 시 롤백 ─────────────
type Op = Record<string, unknown> & { op: string };
interface CommitOpts {
  busyId?: string; // 저장 중 반투명 처리할 카드
  rerender?: boolean; // false면 응답 후 다시 그리지 않음(메모 입력 중 포커스 보존)
  quiet?: boolean; // true면 성공 토스트 생략
}

function markSaving(id: string, on: boolean): void {
  document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`).forEach((el) => el.classList.toggle('saving', on));
}

function readPin(): string | null {
  try {
    return localStorage.getItem(LS_PIN);
  } catch {
    return null;
  }
}

async function post(op: Op): Promise<ApiDoc> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const pin = readPin();
  if (pin) headers['x-papers-pin'] = pin;
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(op) });
  const body = (await r.json().catch(() => ({}))) as Partial<ApiDoc> & { error?: string };
  if (!r.ok || !body.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body as ApiDoc;
}

async function commit(op: Op, o: CommitOpts = {}): Promise<boolean> {
  const prev = doc;
  const local = applyOp(doc, op, new Date().toISOString());
  if (!local.ok) {
    toast(local.error, 'error');
    return false;
  }
  doc = local.doc;
  if (o.rerender !== false) render();
  if (o.busyId) markSaving(o.busyId, true);
  saving += 1;
  try {
    adopt(await post(op));
    if (o.rerender !== false) render();
    showUpdated();
    if (!o.quiet) toast('저장됨');
    return true;
  } catch (err) {
    doc = prev;
    render();
    toast(`저장 실패: ${err instanceof Error ? err.message : String(err)}`, 'error');
    return false;
  } finally {
    saving -= 1;
    if (o.busyId) markSaving(o.busyId, false);
  }
}
```

- [ ] **Step 4: 드래그 이동 섹션 추가**

commit 섹션 뒤, `// ── 부팅 ──` 위에 추가:

```ts
// ── 드래그 이동 (HTML5 DnD, 편집 모드에서만) ────────────
let dragId: string | null = null;
const dropLine = document.createElement('div');
dropLine.className = 'drop-line';

document.addEventListener('dragstart', (e) => {
  const card = (e.target as Element | null)?.closest?.<HTMLElement>('[data-id][draggable="true"]');
  if (!card || !editing) return;
  dragId = card.dataset.id ?? null;
  e.dataTransfer?.setData('text/plain', dragId ?? ''); // Firefox는 setData 없이는 드래그를 시작하지 않는다
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
document.addEventListener('dragend', () => {
  dragId = null;
  dropLine.remove();
  document.querySelectorAll('.dragging, .drop-target').forEach((el) => el.classList.remove('dragging', 'drop-target'));
});

/** 열 안에서 포인터 아래에 올 첫 카드(보이는 것만, 드래그 중 카드 제외). 없으면 null = 열 끝. */
function nextCardAt(col: HTMLElement, y: number): HTMLElement | null {
  const cards = [...col.querySelectorAll<HTMLElement>('.pcard[data-id]:not([hidden]):not(.dragging)')];
  return (
    cards.find((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    }) ?? null
  );
}

els.kanban?.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const col = (e.target as Element).closest<HTMLElement>('.kcol');
  if (!col) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const next = nextCardAt(col, e.clientY);
  col.insertBefore(dropLine, next ?? col.querySelector('.kempty'));
});
els.kanban?.addEventListener('drop', (e) => {
  if (!dragId) return;
  const col = (e.target as Element).closest<HTMLElement>('.kcol');
  if (!col) return;
  e.preventDefault();
  const id = dragId;
  const st = col.dataset.stage as Status;
  const next = nextCardAt(col, e.clientY);
  // index = 놓는 자리 다음 카드의 그룹 내 순번(숨겨진 카드 포함, 드래그 카드 제외) — 서버 placeInGroup과 같은 셈법
  const members = doc.papers.filter((p) => groupOf(p.st) === groupOf(st));
  const index = dropIndex(members, id, next?.dataset.id ?? null);
  dropLine.remove();
  const op: Op = { op: 'move', id, st };
  if (index !== undefined) op.index = index;
  void commit(op, { busyId: id });
});

// 아카이브 박스에 놓으면 게재확정(Accepted). 이미 아카이브된 행은 대상이 아니다.
els.archiveBox?.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const p = doc.papers.find((x) => x.id === dragId);
  if (!p || isArchived(p)) return;
  e.preventDefault();
  els.archiveBox?.classList.add('drop-target');
});
els.archiveBox?.addEventListener('dragleave', (e) => {
  if (!els.archiveBox?.contains(e.relatedTarget as Node | null)) els.archiveBox?.classList.remove('drop-target');
});
els.archiveBox?.addEventListener('drop', (e) => {
  if (!dragId) return;
  const p = doc.papers.find((x) => x.id === dragId);
  if (!p || isArchived(p)) return;
  e.preventDefault();
  els.archiveBox?.classList.remove('drop-target');
  void commit({ op: 'move', id: p.id, st: '게재확정' }, { busyId: p.id });
});

// 카드 안의 입력 요소(메모·메뉴·select)를 조작하는 동안은 카드 드래그가 시작되지 않게 잠시 끈다.
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Element;
  if (!t.closest?.('textarea, input, select, button, .pmenu')) return;
  const card = t.closest<HTMLElement>('[data-id][draggable="true"]');
  if (card) {
    card.draggable = false;
    card.dataset.dragOff = '1';
  }
});
document.addEventListener('pointerup', () => {
  document.querySelectorAll<HTMLElement>('[data-drag-off]').forEach((el) => {
    el.draggable = true;
    delete el.dataset.dragOff;
  });
});
```

- [ ] **Step 5: 카드 메뉴 섹션 추가**

드래그 섹션 뒤, `// ── 부팅 ──` 위에 추가:

```ts
// ── 카드 메뉴(⋯): 터치·키보드용 이동 수단 + 아카이브·복원·게재 전환 ─────
let menuEl: HTMLElement | null = null;
function closeMenu(): void {
  menuEl?.remove();
  menuEl = null;
}

function openMenu(anchor: HTMLElement, id: string): void {
  closeMenu();
  const p = doc.papers.find((x) => x.id === id);
  if (!p) return;
  const archived = isArchived(p);
  const options = KANBAN_STATUSES.filter((s) => s !== p.st)
    .map((s) => `<option value="${s}">${s}</option>`)
    .join('');
  const m = document.createElement('div');
  m.className = 'pmenu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `
    <label class="pmenu-move">${archived ? '복원' : '이동'}
      <select data-act="move" aria-label="상태 선택"><option value="">상태 선택…</option>${options}</select>
    </label>
    ${
      archived
        ? `<button type="button" role="menuitem" data-act="toggle-pub">${p.st === '게재확정' ? '게재(Published)로 표시' : '게재확정(Accepted)으로 되돌리기'}</button>`
        : `<button type="button" role="menuitem" data-act="archive">아카이브로 (게재확정)</button>`
    }`;
  m.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button[data-act]');
    if (b) act(b.dataset.act ?? '', id);
  });
  m.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    if (sel.dataset.act === 'move' && sel.value) {
      closeMenu();
      void commit({ op: 'move', id, st: sel.value }, { busyId: id });
    }
  });
  anchor.closest<HTMLElement>('[data-id]')?.appendChild(m);
  menuEl = m;
}

function act(kind: string, id: string): void {
  closeMenu();
  const p = doc.papers.find((x) => x.id === id);
  if (!p) return;
  if (kind === 'archive') void commit({ op: 'move', id, st: '게재확정' }, { busyId: id });
  else if (kind === 'toggle-pub') void commit({ op: 'move', id, st: p.st === '게재확정' ? '게재' : '게재확정' }, { busyId: id });
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('.pmenu-btn');
  if (btn) {
    e.preventDefault();
    openMenu(btn, btn.dataset.menu ?? '');
    return;
  }
  if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});
```

- [ ] **Step 6: CSS 추가**

`global.css`의 `.toast.error { … }` 뒤에 추가:

```css
  /* 드래그·메뉴·저장 중 (편집 모드) */
  .pcard,
  .reqrow {
    position: relative;
  }
  body.editing .pcard[draggable='true'],
  body.editing .reqrow[draggable='true'] {
    cursor: grab;
  }
  .pcard.dragging,
  .reqrow.dragging {
    opacity: 0.4;
  }
  .drop-line {
    height: 3px;
    border-radius: 2px;
    background: var(--c-res);
    margin: 2px 0 8px;
  }
  #archive-box.drop-target .card {
    outline: 2px dashed var(--c-res);
    outline-offset: 2px;
    background: var(--info-bg);
  }
  .saving {
    opacity: 0.55;
    pointer-events: none;
    transition: opacity 0.15s;
  }
  .pmenu-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    display: none;
  }
  body.editing .pmenu-btn {
    display: inline-grid;
    place-items: center;
  }
  .pmenu-btn:hover {
    background: var(--soft);
    border-color: var(--line);
  }
  body.editing .pcard .t {
    padding-right: 24px;
  }
  body.editing .reqrow {
    padding-right: 30px;
  }
  .pmenu {
    position: absolute;
    top: 30px;
    right: 6px;
    z-index: 20;
    min-width: 200px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
    cursor: default;
  }
  .pmenu button,
  .pmenu label {
    text-align: left;
    font: inherit;
    background: none;
    border: 0;
    border-radius: 6px;
    padding: 6px 8px;
    cursor: pointer;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pmenu button:hover {
    background: var(--soft);
  }
  .pmenu select {
    font: inherit;
    font-size: 11.5px;
    flex: 1;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 4px;
    background: var(--surface);
  }
```

- [ ] **Step 7: 확인 (netlify dev --offline + Playwright MCP, http://localhost:8888/papers/)**

1. `npm run build`가 통과한다(타입 오류 없이 번들).
2. `#edit-toggle` 클릭 → 버튼 글자 `편집 중`, `body.editing`, 카드에 `⋯` 버튼과 `draggable="true"`, `#new-paper` 표시. 새로고침 후에도 편집 모드 유지(localStorage).
3. 드래그: `mcp__playwright__browser_drag`로 심사 중 열의 `R08` 카드를 `수정 중` 열(`.kcol[data-stage="수정 중"] h4`)로 끌어다 놓기 → 카드가 수정 중 열 **맨 위**에 나타나고 배지가 `Under Revision`, 토스트 `저장됨`, KPI `심사 중` 값이 1 줄고 `수정·재투고 대응`이 1 는다. 새로고침 → 그대로 유지. (`curl -s localhost:8888/api/papers`에서 R08의 st가 `수정 중`.)
4. 같은 열 안 순서: 수정 중 열에서 `R08`을 `R03` 아래로 끌기 → 순서 [R03, R07?…]가 바뀌고 새로고침 후 유지.
5. 아카이브 드롭: `R06`(심사 중)을 `#archive-box`로 끌기 → 아카이브 목록에 `Accepted` 행으로 나타남, 칸반에서 사라짐, `#arch-total` +1.
6. 메뉴: 아카이브 행 `R06`의 `⋯` → `게재(Published)로 표시` 클릭 → 배지 `Published`, 행 위치 그대로. 다시 `⋯` → 복원 select에서 `심사 중` 선택 → 심사 중 열 끝으로 복귀.
7. 메뉴로 이동: 칸반 카드 `⋯` → 이동 select `재투고` → 재투고 열 끝으로 이동. Esc·바깥 클릭으로 메뉴가 닫힌다.
8. 롤백: `netlify dev`를 잠시 끄고(또는 `browser_run_code_unsafe`로 `page.route('**/api/papers', r => r.abort())`) 카드를 옮기면 → 원위치로 돌아오고 빨간 토스트 `저장 실패: …`. 다시 켠다.
9. 열람 모드(`편집` 끄기)에서는 드래그가 시작되지 않고 `⋯`가 보이지 않는다.
10. 검증 뒤 데이터 원복: 위에서 옮긴 카드들을 메뉴로 원래 상태로 되돌린다(R08→심사 중, R06→심사 중). 로컬 샌드박스라 프로덕션과 무관하지만 다음 Task 확인이 헷갈리지 않게.

- [ ] **Step 8: 커밋**

```bash
git add src/scripts/papers-board.ts src/styles/global.css
git commit -m "feat(papers): edit mode with drag-and-drop moves, archive drop zone and card menu"
```

---
### Task 8: 메모 자동 저장

**Files:**
- Modify: `src/scripts/papers-board.ts` (import에 `debounce`, 메모 섹션 추가, `render()`에 `autosizeAll()`)
- Modify: `src/styles/global.css` (`textarea.memo` 편집 스타일)

**Interfaces:**
- Consumes: `debounce` (Task 6), `commit`(Task 7, `{ rerender: false, quiet: true }`), `view.ts`의 `textarea.memo[data-note]`(Task 2)
- Produces: `autosize(ta)`, `autosizeAll()`, `commitNote(id, value)`

- [ ] **Step 1: import 수정**

```ts
import { apiUrlFor, debounce, dropIndex, fmtUpdated } from '../lib/papers/client.ts';
```

- [ ] **Step 2: `render()`에 자동 높이 호출 추가**

`render()` 안 `applyFilter();` 다음 줄에 `autosizeAll();` 추가.

- [ ] **Step 3: 메모 섹션 추가**

메뉴 섹션 뒤, `// ── 부팅 ──` 위에 추가:

```ts
// ── 메모 자동 저장: 입력 멈춤 0.8초 후 또는 포커스가 떠날 때 ─────────────
// note 응답으로는 다시 그리지 않는다(rerender:false) — 입력 중인 textarea의 포커스·내용을 지키기 위해.
function autosize(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}
function autosizeAll(): void {
  document.querySelectorAll<HTMLTextAreaElement>('textarea.memo').forEach(autosize);
}

function commitNote(id: string, value: string): void {
  const p = doc.papers.find((x) => x.id === id);
  if (!p) return;
  if ((p.note ?? '').trim() === value.trim()) return; // 변화 없음
  void commit({ op: 'note', id, note: value }, { rerender: false, quiet: true }).then((ok) => {
    if (ok) toast('메모 저장됨');
  });
}
const saveNoteLater = debounce((id: string, value: string) => commitNote(id, value), 800);

document.addEventListener('input', (e) => {
  const ta = e.target as HTMLTextAreaElement;
  if (!ta.matches?.('textarea.memo')) return;
  autosize(ta);
  saveNoteLater(ta.dataset.note ?? '', ta.value);
});
// 포커스가 떠나면 즉시 저장(다른 메모로 옮겨 갈 때 앞 메모가 유실되지 않게 타이머를 취소하고 바로 보냄)
document.addEventListener('focusout', (e) => {
  const ta = e.target as HTMLTextAreaElement;
  if (!ta.matches?.('textarea.memo')) return;
  saveNoteLater.cancel();
  commitNote(ta.dataset.note ?? '', ta.value);
});
```

- [ ] **Step 4: CSS 추가**

`global.css`의 `.reqrow .memo { … }` 뒤에 추가:

```css
  textarea.memo {
    resize: none;
    overflow: hidden;
    min-height: 28px;
    border-color: var(--line);
    background: var(--surface);
    cursor: text;
  }
  textarea.memo::placeholder {
    color: var(--muted);
    opacity: 0.8;
  }
  textarea.memo:focus {
    outline: none;
    border-color: var(--c-res);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-res) 20%, transparent);
  }
```

- [ ] **Step 5: 확인 (netlify dev --offline + Playwright MCP)**

1. 편집 모드에서 모든 카드·아카이브 행에 `textarea.memo`가 있고, 내용이 있는 카드(R02·R07)는 내용이 채워져 있으며 높이가 내용에 맞는다.
2. `R08` 카드의 textarea에 `심사 결과 10월 예정` 입력 → 1초 안에 토스트 `메모 저장됨`, 카드는 다시 그려지지 않아 포커스가 유지된다(`document.activeElement`가 그 textarea).
3. 새로고침 → 편집 모드에서 textarea에 값이 있고, 편집을 끄면 회색 `.memo.view` 상자로 보인다. `curl -s localhost:8888/api/papers`의 R08에 `note` 존재.
4. 두 메모를 빠르게 연달아 입력(R08에 입력 직후 R03 textarea 클릭·입력) → 둘 다 저장됨(focusout 즉시 저장).
5. 메모를 모두 지우고 포커스를 옮기면 → 저장 후 API 응답에서 `note` 필드가 사라진다.
6. textarea 안에서 마우스로 글자를 드래그 선택해도 카드 드래그가 시작되지 않는다(pointerdown 가드).

- [ ] **Step 6: 커밋**

```bash
git add src/scripts/papers-board.ts src/styles/global.css
git commit -m "feat(papers): autosaving memo box on cards and archive rows"
```

---

### Task 9: 수정 · 새 논문 · 삭제 대화상자, PIN 대화상자(여지)

**Files:**
- Modify: `src/pages/papers.astro` (`<dialog id="paper-dialog">`, `<dialog id="pin-dialog">` 추가, `STATUSES` import)
- Modify: `src/scripts/papers-board.ts` (대화상자 섹션, 메뉴에 `수정…` 추가, `askPin` 교체)
- Modify: `src/styles/global.css` (`.pdlg` 등)

**Interfaces:**
- Consumes: `STATUSES`(Task 1), `applyOp`(검증용, Task 1), `commit`·`toast`·`openMenu/act`(Task 7), `readPin/LS_PIN`(Task 7)
- Produces: `openDialog(p | null)`, `askPin(): Promise<boolean>`, `post()`의 401 분기

- [ ] **Step 1: 대화상자 마크업 추가**

`papers.astro` frontmatter의 model import를 `import { STATUSES, validatePapers } from '../lib/papers/model.ts';`로 바꾸고, `<div id="toast" …></div>` 바로 앞에 추가:

```astro
  <dialog id="paper-dialog" class="pdlg" aria-labelledby="pd-title">
    <form id="paper-form" method="dialog" novalidate>
      <h3 id="pd-title">논문 수정</h3>
      <label>제목 <input name="t" maxlength="300" autocomplete="off" /></label>
      <div class="row">
        <label>주저자 <input name="stu" maxlength="40" autocomplete="off" /></label>
        <label>등급
          <select name="tier">
            <option value="SCIE">SCIE</option><option value="SSCI">SSCI</option><option value="KCI">KCI</option><option value="und">미정</option>
          </select>
        </label>
      </div>
      <label>저널 <input name="jr" maxlength="120" autocomplete="off" /></label>
      <div class="row">
        <label>사사 <input name="fund" maxlength="40" placeholder="예: 신진연구 (비우면 '기입 필요')" autocomplete="off" /></label>
        <label>상태
          <select name="st">{STATUSES.map((s) => <option value={s}>{s}</option>)}</select>
        </label>
      </div>
      <div class="row">
        <label>투고 연월 <input name="sub" type="month" /></label>
        <label>게재 연월 <input name="pub" type="month" /></label>
      </div>
      <p id="pd-err" class="pd-err" role="alert" hidden></p>
      <div class="pd-actions">
        <button type="button" id="pd-delete" class="danger" hidden>삭제</button>
        <span class="spacer"></span>
        <button type="button" id="pd-cancel">취소</button>
        <button type="submit" class="primary">저장</button>
      </div>
    </form>
  </dialog>
  <dialog id="pin-dialog" class="pdlg" aria-labelledby="pin-title">
    <form method="dialog">
      <h3 id="pin-title">편집 PIN</h3>
      <p class="hint">이 사이트는 편집 PIN이 설정되어 있습니다. 한 번 입력하면 이 브라우저에 기억됩니다.</p>
      <label>PIN <input name="pin" type="password" autocomplete="off" /></label>
      <div class="pd-actions">
        <span class="spacer"></span>
        <button type="button" id="pin-cancel">취소</button>
        <button type="submit" class="primary">확인</button>
      </div>
    </form>
  </dialog>
```

- [ ] **Step 2: `post()`에 401 분기 추가 + 대화상자 섹션 추가**

`papers-board.ts`의 `post()` 안, `if (!r.ok || !body.ok) throw …` 줄 **바로 위**에 추가:

```ts
  if (r.status === 401) {
    if (await askPin()) return post(op); // PIN을 받았으면 같은 요청을 다시 보낸다
    throw new Error(body.error || 'PIN이 필요합니다');
  }
```

메모 섹션 뒤, `// ── 부팅 ──` 위에 추가:

```ts
// ── 수정 · 새 논문 · 삭제 대화상자 ───────────────────────
let dialogId: string | null = null; // null = 새 논문
const form = els.dialog?.querySelector<HTMLFormElement>('#paper-form') ?? null;
const field = (name: string) => form?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
const pdErr = $('#pd-err');
const pdDelete = $<HTMLButtonElement>('#pd-delete');

function showErr(msg: string): void {
  if (!pdErr) return;
  pdErr.hidden = !msg;
  pdErr.textContent = msg;
}

function openDialog(p: Paper | null): void {
  if (!els.dialog || !form) return;
  form.reset();
  dialogId = p?.id ?? null;
  const title = $('#pd-title');
  if (title) title.textContent = p ? `논문 수정 · ${p.id}` : '새 논문';
  if (pdDelete) {
    pdDelete.hidden = !p;
    pdDelete.textContent = '삭제';
    pdDelete.dataset.armed = '';
  }
  const set = (name: string, v: string) => { const el = field(name); if (el) el.value = v; };
  set('t', p?.t ?? '');
  set('stu', p?.stu ?? '');
  set('jr', p?.jr ?? '');
  set('tier', p?.tier ?? 'und');
  set('fund', p?.fund ?? '');
  set('st', p?.st ?? '투고 완료');
  set('sub', p?.sub ?? '');
  set('pub', p?.pub ?? '');
  showErr('');
  els.dialog.showModal();
  field('t')?.focus();
}

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!form || !els.dialog) return;
  const fd = new FormData(form);
  const s = (k: string) => String(fd.get(k) ?? '');
  const fields = { t: s('t'), stu: s('stu'), jr: s('jr'), tier: s('tier'), fund: s('fund'), st: s('st'), sub: s('sub'), pub: s('pub') };
  const op: Op = dialogId ? { op: 'update', id: dialogId, fields } : { op: 'add', paper: fields };
  const check = applyOp(doc, op, new Date().toISOString()); // 서버와 같은 규칙으로 먼저 검증
  if (!check.ok) {
    showErr(check.error);
    return;
  }
  els.dialog.close();
  void commit(op, { busyId: dialogId ?? undefined });
});
$('#pd-cancel')?.addEventListener('click', () => els.dialog?.close());
// 삭제는 2단계: 첫 클릭에 '정말 삭제'로 바뀌고 4초 안에 다시 누르면 삭제
let disarmTimer = 0;
pdDelete?.addEventListener('click', () => {
  if (!pdDelete || !dialogId) return;
  if (pdDelete.dataset.armed !== '1') {
    pdDelete.dataset.armed = '1';
    pdDelete.textContent = '정말 삭제';
    clearTimeout(disarmTimer);
    disarmTimer = window.setTimeout(() => {
      pdDelete.dataset.armed = '';
      pdDelete.textContent = '삭제';
    }, 4000);
    return;
  }
  const id = dialogId;
  els.dialog?.close();
  void commit({ op: 'delete', id });
});
els.newBtn?.addEventListener('click', () => openDialog(null));

// ── PIN 여지: 서버가 401을 주면 묻고 localStorage에 기억 ─────────────
function askPin(): Promise<boolean> {
  return new Promise((resolve) => {
    const d = els.pinDialog;
    const f = d?.querySelector('form');
    if (!d || !f) return resolve(false);
    try {
      localStorage.removeItem(LS_PIN); // 틀린 PIN이 남아 있으면 지운다
    } catch {
      /* 무시 */
    }
    f.reset();
    const finish = (ok: boolean) => {
      d.close();
      resolve(ok);
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = String(new FormData(f).get('pin') ?? '').trim();
      if (!v) return finish(false);
      try {
        localStorage.setItem(LS_PIN, v);
      } catch {
        /* 무시 */
      }
      finish(true);
    };
    d.querySelector<HTMLButtonElement>('#pin-cancel')?.addEventListener('click', () => finish(false), { once: true });
    d.showModal();
  });
}
```

- [ ] **Step 3: 메뉴에 `수정…` 추가**

`openMenu`의 `m.innerHTML = \`` 바로 다음 줄(첫 `<label class="pmenu-move">` 앞)에 추가:

```ts
    <button type="button" role="menuitem" data-act="edit">수정…</button>
```

`act()`의 `if (kind === 'archive') …` 앞에 추가:

```ts
  if (kind === 'edit') {
    openDialog(p);
    return;
  }
```

- [ ] **Step 4: CSS 추가**

`global.css`의 `.pmenu select { … }` 뒤에 추가:

```css
  /* 대화상자 (수정·새 논문·PIN) */
  .pdlg {
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 0;
    width: min(560px, calc(100vw - 32px));
    box-shadow: var(--shadow);
    color: var(--ink);
  }
  .pdlg::backdrop {
    background: rgba(15, 23, 42, 0.35);
  }
  .pdlg form {
    padding: 18px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pdlg h3 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 800;
  }
  .pdlg label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--muted);
    flex: 1;
    min-width: 140px;
  }
  .pdlg input,
  .pdlg select {
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 7px 9px;
    background: var(--surface);
  }
  .pdlg input:focus,
  .pdlg select:focus {
    outline: none;
    border-color: var(--c-res);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-res) 20%, transparent);
  }
  .pdlg .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pd-err {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--danger);
  }
  .pd-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }
  .pd-actions .spacer {
    flex: 1;
  }
  .pd-actions button {
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    border-radius: 8px;
    padding: 7px 14px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .pd-actions .primary {
    background: var(--pill);
    color: var(--pill-ink);
    border-color: var(--pill);
  }
  .pd-actions .danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  }
  .pd-actions .danger[data-armed='1'] {
    background: var(--danger);
    color: #fff;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
  }
```

- [ ] **Step 5: 확인 (netlify dev --offline + Playwright MCP)**

1. `npm run build` 통과. `npm test` 통과(38).
2. 편집 모드 → `새 논문 +` 클릭 → 대화상자. 제목만 넣고 저장 → `#pd-err`에 `주저자을(를) 입력하세요` 표시, 닫히지 않음. 제목 `테스트 논문`, 주저자 `테스트`, 저널 `Test Journal`, 등급 KCI, 상태 `심사 중`, 투고 연월 `2026-09` 입력 → 저장 → 심사 중 열 끝에 `R12` 카드, 필터 칩에 `테스트` 추가, 토스트 `저장됨`. 새로고침 후 유지.
3. `R12` `⋯` → `수정…` → 제목 뒤에 ` (수정)` 추가, 사사 `워케이션`, 상태 `재투고` → 저장 → 재투고 열 끝으로 이동, 사사 칩 표시.
4. 투고 연월 `2026-13`은 `type=month`가 막거나, 막지 못하는 브라우저라면 `#pd-err`에 `YYYY-MM 형식` 오류.
5. `R12` `수정…` → `삭제` 클릭 → 버튼이 `정말 삭제`로 바뀜, 4초 기다리면 원복. 다시 `삭제`→`정말 삭제` → 카드 삭제, 필터 칩 `테스트` 사라짐, `#act-count` 감소. 새로고침 후에도 없음.
6. `취소`와 Esc로 대화상자가 닫힌다. 다른 카드의 `수정…`을 열면 그 카드 값이 채워져 있다.
7. PIN 여지(선택 확인): `netlify dev --offline`을 `$env:PAPERS_EDIT_PIN='1234'`를 설정한 뒤 재시작 → 카드 이동 시 PIN 대화상자 → `0000` 입력 → 저장 실패 토스트 후 다시 대화상자 → `1234` → 저장됨. 이후 이동은 묻지 않음. 확인 후 환경변수 없이 재시작.

- [ ] **Step 6: 커밋**

```bash
git add src/pages/papers.astro src/scripts/papers-board.ts src/styles/global.css
git commit -m "feat(papers): edit/add/delete dialog and optional PIN prompt"
```

---
### Task 10: 동기화 스크립트 `papers-sync.mjs` · 빌드 훅 · 스키마 · autosync

**Files:**
- Create: `scripts/papers-sync.mjs`
- Modify: `package.json` (`prebuild`, `prebuild:pages`)
- Modify: `scripts/lib/schemas.mjs:52-66` (`PaperSchema`에 `sub`·`pub`)
- Modify: `scripts/autosync.ps1` (pull 단계)

**Interfaces:**
- Consumes: `validatePapers` (Task 1), API 응답 형식(Task 3: `{ok, source, rev, updatedAt, papers}`, `?history=1 → {ok, snapshots:[{rev, updatedAt, count}]}`, `?snap=REV`), op `replace`
- Produces: CLI `node scripts/papers-sync.mjs <pull|push|history|restore REV> [--api URL] [--strict]`

- [ ] **Step 1: 스크립트 작성**

`scripts/papers-sync.mjs`:

```js
#!/usr/bin/env node
// 웹 편집 데이터(Netlify Blobs, /api/papers) ↔ content/dashboard/papers.json 동기화 (설계 문서 §11)
//
//   node scripts/papers-sync.mjs pull            서버 최신본 → papers.json (다를 때만 씀). 네트워크 실패는 경고 후 exit 0
//   node scripts/papers-sync.mjs pull --strict   실패 시 exit 1
//   node scripts/papers-sync.mjs push            papers.json → 서버 전체 교체 (복구용)
//   node scripts/papers-sync.mjs history         서버 스냅샷 목록(최근 30개)
//   node scripts/papers-sync.mjs restore <rev>   그 스냅샷으로 서버 교체
//   공통: --api <URL> (기본 프로덕션). 서버에 PAPERS_EDIT_PIN이 설정돼 있으면 같은 이름의 환경변수로 넘긴다.
//
// 이 PC처럼 TLS 가로채기가 있는 환경에서는 `node --use-system-ca scripts/papers-sync.mjs …`로 실행한다
// (package.json의 prebuild가 그렇게 호출한다). 프로덕션 정본은 서버이고 papers.json은 씨앗·백업이다.
import { readFile, writeFile } from 'node:fs/promises';
import { validatePapers } from '../src/lib/papers/model.ts';

const DEFAULT_API = 'https://sdclab-dashboard-156.netlify.app/api/papers';
const FILE = new URL('../content/dashboard/papers.json', import.meta.url);

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const API = opt('--api') ?? DEFAULT_API;
const strict = args.includes('--strict');
const headers = { 'content-type': 'application/json' };
if (process.env.PAPERS_EDIT_PIN) headers['x-papers-pin'] = process.env.PAPERS_EDIT_PIN;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-store' } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.ok) throw new Error(b.error || `HTTP ${r.status}`);
  return b;
}
async function post(op) {
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(op) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.ok) throw new Error(b.error || `HTTP ${r.status}`);
  return b;
}
const stringify = (papers) => JSON.stringify(papers, null, 2) + '\n';

async function pull() {
  let remote;
  try {
    remote = await getJson(API);
  } catch (err) {
    console.warn(`[papers-sync] API 접근 실패 — papers.json을 그대로 둡니다: ${err.message}`);
    process.exit(strict ? 1 : 0);
  }
  if (remote.source === 'seed') {
    console.log('[papers-sync] 서버에 웹 편집 데이터 없음(씨앗 상태) — 변경 없음');
    return;
  }
  const v = validatePapers(remote.papers);
  if (!v.ok) {
    console.error(`[papers-sync] 서버 데이터 검증 실패: ${v.error}`);
    process.exit(1);
  }
  const next = stringify(v.papers);
  const cur = await readFile(FILE, 'utf8').catch(() => '');
  if (cur === next) {
    console.log(`[papers-sync] 변경 없음 (rev ${remote.rev}, ${v.papers.length}건)`);
    return;
  }
  await writeFile(FILE, next, 'utf8');
  console.log(`[papers-sync] papers.json 갱신: ${v.papers.length}건 (rev ${remote.rev}, ${remote.updatedAt})`);
}

async function push() {
  const local = JSON.parse(await readFile(FILE, 'utf8'));
  const v = validatePapers(local);
  if (!v.ok) throw new Error(`papers.json 검증 실패: ${v.error}`);
  const r = await post({ op: 'replace', papers: v.papers });
  console.log(`[papers-sync] 서버 교체 완료: ${r.papers.length}건 → rev ${r.rev}`);
}

async function history() {
  const r = await getJson(`${API}?history=1`);
  if (!r.snapshots.length) {
    console.log('스냅샷 없음');
    return;
  }
  for (const s of r.snapshots) console.log(`rev ${String(s.rev).padStart(5)}  ${s.updatedAt}  ${s.count}건`);
  console.log('복구: node scripts/papers-sync.mjs restore <rev>');
}

async function restore(rev) {
  if (!/^\d+$/.test(rev ?? '')) throw new Error('사용법: restore <rev>  (history로 번호 확인)');
  const snap = await getJson(`${API}?snap=${rev}`);
  const r = await post({ op: 'replace', papers: snap.papers });
  console.log(`[papers-sync] rev ${rev} 스냅샷으로 복구: ${r.papers.length}건 → rev ${r.rev}`);
}

const run = { pull, push, history, restore: () => restore(args[1]) }[cmd];
if (!run) {
  console.error('사용법: node scripts/papers-sync.mjs <pull|push|history|restore REV> [--api URL] [--strict]');
  process.exit(2);
}
run().catch((err) => {
  console.error(`[papers-sync] ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: 빌드 훅 등록**

`package.json` scripts에 추가(`"build"` 위):

```json
    "prebuild": "node --use-system-ca scripts/papers-sync.mjs pull",
    "prebuild:pages": "node --use-system-ca scripts/papers-sync.mjs pull",
```
(`pre<script>` 훅은 npm이 자동 실행한다. `--use-system-ca`는 Node 24 CLI 플래그로, 가로채기 없는 PC에서도 무해.)

- [ ] **Step 3: 스키마·autosync 보강**

`scripts/lib/schemas.mjs`의 `PaperSchema`에서 `fund:` 줄 앞에 추가:

```js
  // 투고·게재 연월(YYYY-MM). 웹 편집 API와 같은 규칙. zod는 모르는 키를 버리므로 명시해야 sync가 보존한다.
  sub: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  pub: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
```

`scripts/autosync.ps1`에서 `# 변경 사항이 없으면 조용히 종료` 주석 **앞**에 추가:

```powershell
# 0) 웹에서 편집된 논문 데이터를 papers.json으로 내려받는다 (실패해도 계속 — 빌드의 prebuild가 한 번 더 시도)
$env:NODE_OPTIONS = '--use-system-ca'
node scripts/papers-sync.mjs pull
```

- [ ] **Step 4: 로컬 API로 확인**

`netlify dev --offline`이 켜진 상태(Task 4~9로 로컬 샌드박스에 편집 데이터가 있음)에서 Git Bash:

```bash
node scripts/papers-sync.mjs pull --api http://localhost:8888/api/papers
# 기대: "[papers-sync] papers.json 갱신: N건 (rev R, …)"  → git diff content/dashboard/papers.json 에 로컬 편집 반영
node scripts/papers-sync.mjs pull --api http://localhost:8888/api/papers
# 기대: "[papers-sync] 변경 없음"
node scripts/papers-sync.mjs history --api http://localhost:8888/api/papers
# 기대: rev 목록 여러 줄
git checkout -- content/dashboard/papers.json                   # 로컬 샌드박스 편집은 커밋하지 않는다
node scripts/papers-sync.mjs push --api http://localhost:8888/api/papers
# 기대: "서버 교체 완료: 17건 → rev …"  (로컬 샌드박스를 papers.json 원본으로 되돌림)
node scripts/papers-sync.mjs pull --api http://localhost:9999/api/papers; echo "exit=$?"
# 기대: 경고 "API 접근 실패 — papers.json을 그대로 둡니다", exit=0
node scripts/papers-sync.mjs pull --api http://localhost:9999/api/papers --strict; echo "exit=$?"
# 기대: exit=1
node scripts/papers-sync.mjs restore abc --api http://localhost:8888/api/papers; echo "exit=$?"
# 기대: 사용법 오류, exit=1
npm run build 2>&1 | grep -E "papers-sync|Complete"
# 기대: 프로덕션 API에 아직 함수가 없으므로 "API 접근 실패 … 그대로 둡니다" 경고 후 빌드 완료
```

- [ ] **Step 5: 커밋**

```bash
git add scripts/papers-sync.mjs package.json scripts/lib/schemas.mjs scripts/autosync.ps1
git commit -m "feat(papers): add papers-sync CLI (pull/push/history/restore) and prebuild pull"
```

---

### Task 11: 브라우저 회귀 점검 (전체 시나리오 1회 통과)

**Files:** 없음(발견된 결함만 해당 파일 수정 후 별도 커밋)

**Interfaces:** Task 6~10의 결과를 `netlify dev --offline`(http://localhost:8888)에서 Playwright MCP로 한 번에 점검한다. 각 항목은 실제로 실행하고 결과를 기록한다. 하나라도 실패하면 해당 Task의 코드를 고치고 `npm test`·이 목록을 다시 돈다.

- [ ] **Step 1: 준비**

`npm test` → 38 통과. `netlify dev --offline` 기동(NODE_OPTIONS 없이). 로컬 샌드박스를 원본으로 맞춤: `node scripts/papers-sync.mjs push --api http://localhost:8888/api/papers`.

- [ ] **Step 2: 시나리오 실행**

| # | 동작 | 기대 |
|---|------|------|
| 1 | `/papers/` 열기 | `#papers-updated`에 `실시간`, 안내줄 없음, KPI 첫 타일 `11`, 아카이브 `6건` |
| 2 | 필터 `이재호` → `KCI` → `전체 연도` | 칸반에 R09·R10만 보이고 열 개수 반영, 아카이브 `— 0건`(A03은 SCIE). `전체`로 복귀 |
| 3 | `편집` 켜기 | `편집 중`, 카드 `⋯`, textarea, `새 논문 +` |
| 4 | R08을 `수정 중` 열 맨 위로 드래그 | 이동·배지·KPI·토스트, 새로고침 후 유지 |
| 5 | 필터 `강성익` 켠 채 R07을 R02 위(거절 열)로 드래그 | 거절 열에서 R07이 R02 앞. 필터 해제 시 R01·R07·R02 순(숨겨진 R01은 그대로 앞) |
| 6 | R06 → `#archive-box` 드롭 | 아카이브에 Accepted 행, 칸반에서 제거 |
| 7 | 아카이브 R06 `⋯` → 게재로 표시 → `⋯` → 복원 `심사 중` | 배지 전환 후 심사 중 열 끝으로 복귀 |
| 8 | R03 메모 입력 후 다른 카드 클릭 | `메모 저장됨`, 새로고침 후 유지, 열람 모드에서 회색 상자 |
| 9 | `새 논문 +` → 필수 누락 저장 → 오류 → 정상 입력 저장 | 오류 문구 → R12 생성·칩 추가 |
| 10 | R12 `수정…` → 상태 `게재확정`, 게재 연월 `2026-10` 저장 | 아카이브에 `게재 2026.10` 행 |
| 11 | R12 `수정…` → 삭제 2단계 | 제거, 칩 제거, 새로고침 후 없음 |
| 12 | 탭 전환 시뮬레이션: 다른 탭(또는 curl POST)으로 R01 note 변경 후 이 탭으로 복귀 | `visibilitychange`로 재조회되어 R01 메모 갱신(입력 중이 아닐 때) |
| 13 | `편집` 끄기 → 새로고침 | 열람 모드 유지, 드래그 불가, 메모는 상자로만 |
| 14 | `http://localhost:4321/papers/` | 노란 안내줄, `편집` 비활성, 필터 동작 |
| 15 | 창 너비 390px | 칸반 가로 스크롤, 대화상자 폭 `calc(100vw - 32px)`, 토스트 잘리지 않음 |

- [ ] **Step 3: 정리**

`node scripts/papers-sync.mjs push --api http://localhost:8888/api/papers`로 샌드박스를 원본으로 되돌린다. 결함 수정이 있었다면 `fix(papers): …` 커밋.

---
### Task 12: 배포 — 초안 검증 → 프로덕션 → 실서버 왕복 → 미러

**Files:**
- Modify(결과물): `content/dashboard/papers.json` (첫 pull로 키 순서 정규화될 수 있음)

**Interfaces:**
- Consumes: Task 4 함수, Task 10 스크립트. 사이트 id `c113708b-1106-46eb-bb94-4503818fa0aa`.
- 주의: **`--prod` 배포는 외부에 바로 반영되는 작업이므로 실행 직전에 사용자에게 한 번 확인한다**(서브에이전트 모드라면 컨트롤러가 묻는다). 초안(draft) 배포는 임시 URL이라 확인 없이 진행해도 된다.

- [ ] **Step 1: 빌드 + 초안 배포**

PowerShell:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm run build            # prebuild pull은 아직 함수가 없어 "API 접근 실패 … 그대로 둡니다" 경고 후 계속 → 정상
netlify deploy --dir=dist --site c113708b-1106-46eb-bb94-4503818fa0aa
```
Expected: 출력에 `Packaging Functions from netlify\functions directory: - papers.mts`(또는 유사) 와 `Website draft URL: https://<hash>--sdclab-dashboard-156.netlify.app`. 함수 패키징 줄이 없으면 `netlify.toml`의 `[functions] directory`를 다시 확인한다(설계 §15의 가정 검증 지점). 함수 번들 중 worker 관련 오류(`--use-system-ca` 거부 등)가 나면 환경변수 대신 CLI 프로세스에 플래그를 직접 준다: `Remove-Item Env:NODE_OPTIONS; node --use-system-ca "$env:APPDATA\npm\node_modules\netlify-cli\bin\run.js" deploy --dir=dist --site c113708b-1106-46eb-bb94-4503818fa0aa` (Task 4에서 `netlify dev`에 같은 우회가 통했다).

- [ ] **Step 2: 스모크 스크립트 작성 + 초안에서 함수 확인 (읽기만)**

PowerShell 따옴표 문제를 피하려고 요청을 파일로 둔다. 스크래치 폴더(예: `$env:TEMP\papers-smoke.mjs`)에 저장:

```js
// 사용: node --use-system-ca papers-smoke.mjs <base-url> [--write]
//   읽기: GET /api/papers, OPTIONS(CORS)   --write: 화면 변화 없는 쓰기(R01을 현재 상태 '거절'로 move) 후 rev 확인
const base = process.argv[2].replace(/\/$/, '');
const api = `${base}/api/papers`;
const show = (label, status, text) => console.log(label, status, text.slice(0, 140));
let r = await fetch(api);
show('GET', r.status, await r.text());
r = await fetch(api, { method: 'OPTIONS', headers: { origin: 'https://jaeho19.github.io' } });
console.log('OPTIONS', r.status, 'allow-origin =', r.headers.get('access-control-allow-origin'));
if (process.argv.includes('--write')) {
  r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'move', id: 'R01', st: '거절' }) });
  show('POST', r.status, await r.text());
  r = await fetch(api);
  console.log('rev after write =', (await r.json()).rev);
}
```

```powershell
$draft = 'https://<hash>--sdclab-dashboard-156.netlify.app'
node --use-system-ca "$env:TEMP\papers-smoke.mjs" $draft
# 기대: GET 200 {"ok":true,"source":"seed","rev":0,...  /  OPTIONS 204 allow-origin = https://jaeho19.github.io
```
Playwright MCP로 `$draft/papers/` 열기 → `#papers-updated` = `실시간 · 아직 웹 편집 없음`, `편집` 활성. **초안에서는 쓰기(카드 이동, `--write`)를 하지 않는다**(프로덕션과 같은 저장소를 공유).

- [ ] **Step 3: 프로덕션 배포 (사용자 확인 후)**

```powershell
netlify deploy --prod --dir=dist --site c113708b-1106-46eb-bb94-4503818fa0aa
```
Expected: `Deployed to production URL: https://sdclab-dashboard-156.netlify.app`.

- [ ] **Step 4: 실서버 왕복**

```powershell
node --use-system-ca "$env:TEMP\papers-smoke.mjs" https://sdclab-dashboard-156.netlify.app --write
# 기대: GET 200 …"source":"seed","rev":0  /  OPTIONS 204 …  /  POST 200 …"source":"blob","rev":1  /  rev after write = 1
# (R01을 현재 상태 '거절'로 move → 화면 변화 없이 저장 경로만 검증)
```
브라우저(Playwright MCP 또는 Chrome)로 `https://sdclab-dashboard-156.netlify.app/papers/` 열기 → `마지막 수정 … · 실시간`, `편집` 켜기 → R01의 메모 textarea에 `웹 편집 시작 (2026-09-28)` 입력 후 포커스 이동 → `메모 저장됨` → 새로고침 후 유지 → 메모를 지워 원상복구(선택). 편집 끄기.

- [ ] **Step 5: papers.json 정규화 pull + 커밋**

```powershell
node --use-system-ca scripts/papers-sync.mjs pull
git diff --stat content/dashboard/papers.json
```
Expected: 서버 데이터가 `blob` 상태이므로 파일이 정본 키 순서로 다시 써질 수 있음(내용 동일). 변경이 있으면:

```bash
git add content/dashboard/papers.json
git commit -m "content: normalize papers.json from live data (first pull)"
```

- [ ] **Step 6: GitHub Pages 미러 갱신·확인**

```powershell
npm run deploy      # prebuild:pages pull → build:pages → gh-pages push (미러는 정적 파일만, API는 Netlify 절대 주소 사용)
```
Playwright MCP로 `https://jaeho19.github.io/sdclab-dashboard/papers/` 열기(반영에 1~2분) → `#papers-updated`에 `실시간`(CORS 성공). 브라우저 콘솔에 CORS 오류가 없어야 한다(`mcp__playwright__browser_console_messages`).

---

### Task 13: 문서 · 메모리 갱신

**Files:**
- Modify: `README.md`, `편집가이드.md`, `docs/대시보드개편_구현계획서.md`(상단 메모), `docs/apps-script/DEPLOY.md`(상단 메모)
- Modify: `C:\Users\1\.claude\projects\D--dev-sdclab-dashboard\memory\netlify-deploy-tls-workaround.md`, `…\memory\MEMORY.md`

- [ ] **Step 1: README.md**

(a) "콘텐츠는 두 갈래입니다" 표의 `투고 논문` 행을 교체:

```markdown
| 투고 논문 | **웹 화면** https://sdclab-dashboard-156.netlify.app/papers/ (편집 스위치) | 서버(Netlify Blobs)에 즉시 저장. `content/dashboard/papers.json` 은 씨앗·백업이며 빌드 전에 자동으로 내려받음 ← 아래 참고 |
```

(b) `### 투고 논문(\`papers.json\`)이 직접 편집인 이유` 절 전체(표 "KPI 타일·필터 칩…" 문장까지)를 아래로 교체:

```markdown
### 투고 논문은 웹에서 편집합니다 (2026-09-28~)

`/papers` 페이지 제목 옆 **편집** 스위치를 켜면 카드 드래그(열 이동·순서), 메모, 아카이브(게재확정) 이동·복원,
`⋯` 메뉴의 수정(제목·주저자·저널·등급·사사·투고/게재 연월·상태)·삭제, `새 논문 +` 추가가 됩니다.
저장은 즉시 이루어지며(`/api/papers` → Netlify Blobs) **재배포가 필요 없고**, 다른 기기·학생 화면에도 바로 반영됩니다.
인증은 없습니다(링크를 아는 사람은 누구나 편집 가능). 필요해지면 `netlify env:set PAPERS_EDIT_PIN <값>` 한 줄로 PIN을 켤 수 있습니다.

- 정본: Netlify Blobs(`papers/state`). `content/dashboard/papers.json` 은 **씨앗이자 백업**입니다.
  `npm run build` 앞에 `scripts/papers-sync.mjs pull` 이 자동으로 돌아 최신본을 이 파일에 반영하므로
  학생 상세 페이지의 논문 목록과 git 이력이 웹 편집을 따라갑니다.
- 손으로 `papers.json` 을 고쳐 서버에 올리려면 `node --use-system-ca scripts/papers-sync.mjs push`.
- 실수 복구: `… history` 로 스냅샷(최근 30개) 확인 → `… restore <rev>`.
- 구현: `src/lib/papers/`(규칙·렌더·핸들러) · `src/scripts/papers-board.ts`(화면) · `netlify/functions/papers.mts`(API).
  설계 문서 `docs/superpowers/specs/2026-09-28-papers-web-editing-design.md`.

한 논문의 형태(백업 파일 기준):

```jsonc
{
  "id": "R07",              // 고정 식별자. 새 논문은 다음 빈 R## 자동 부여. 아카이브해도 바뀌지 않음(A##는 과거 관례)
  "kind": "실제",
  "stu": "강성익",           // 주저자
  "t": "After Sunset: …",   // 제목
  "tier": "SCIE",           // SCIE | SSCI | KCI | und
  "jr": "Cities",           // 저널명
  "st": "심사 중",           // 상태(아래 표). stEn은 자동으로 짝이 맞춰짐
  "stEn": "Under Review",
  "fund": "신진연구",         // (선택) 사사
  "sub": "2026-05",         // (선택) 투고 연월
  "pub": "2026-12",         // (선택) 게재 연월
  "note": "수정본 제출 마감 2026-09-17"  // (선택) 메모(여러 줄)
}
```

| `st` | `stEn` | 표시 위치 |
|------|--------|-----------|
| 투고 완료 | `Submitted` | 칸반 1열 |
| 심사 중 | `Under Review` | 칸반 2열 |
| 수정 중 | `Under Revision` | 칸반 3열 |
| 재투고 | `Resubmitted` | 칸반 4열 |
| 거절 | `Rejected` | 칸반 5열 |
| 게재확정 | `Accepted` | 아카이브 |
| 게재 | `Published` | 아카이브 |
```

(c) "구조" 코드 블록에 줄 추가: `src/` 아래 `lib/papers/        논문 규칙(model)·렌더(view)·API 핸들러(handler) — 빌드·브라우저·함수 공용` 과 `scripts/papers-board.ts  /papers 편집 화면`, 최상위에 `netlify/functions/papers.mts   /api/papers (Netlify Blobs)`, `scripts/` 아래 `papers-sync.mjs   웹 편집 데이터 ↔ papers.json (pull/push/history/restore)`.

(d) "배포" 절의 명령 블록을 교체:

```bash
$env:NODE_OPTIONS = '--use-system-ca'   # 이 PC의 TLS 가로채기 우회 (PowerShell)
npm run build                            # prebuild: 웹 편집본을 papers.json으로 내려받음
netlify deploy --prod --dir=dist         # 정적 파일 + /api/papers 함수 함께 업로드
npm run deploy                           # (선택) GitHub Pages 미러 갱신
```

- [ ] **Step 2: 편집가이드.md**

(a) 1절의 파일 트리에서 `content/dashboard/papers.json     ← 투고 논문 (5-A 항목 참고)` 를 `content/dashboard/papers.json     ← 투고 논문 백업 (편집은 웹에서 — 5-A)` 로.

(b) `## 5-A. 투고 논문 고치기 (\`content/dashboard/papers.json\`)` 절 전체(`> JSON은 쉼표·따옴표가…` 인용문까지)를 아래로 교체:

```markdown
## 5-A. 투고 논문 고치기 — 웹 화면에서

논문 현황은 **사이트에서 직접** 고칩니다. 저장하면 바로 반영되고 **배포를 다시 할 필요가 없습니다.**

1. https://sdclab-dashboard-156.netlify.app/papers/ 를 열고 제목 옆 **편집** 스위치를 켠다(브라우저가 기억함).
2. 할 수 있는 일
   - **카드 끌어 옮기기**: 다른 열(상태 변경)이나 같은 열 안(순서). 놓을 자리에 파란 선이 뜬다.
   - **아카이브**: 카드를 아래 "아카이브 — 게재 완료" 상자에 놓으면 게재확정(Accepted)이 된다. 아카이브 행의 `⋯`에서
     "게재(Published)로 표시" / "복원 ▸ 상태 선택"(칸반으로 되돌리기).
   - **메모**: 카드 아래 회색 칸에 적으면 잠시 후 자동 저장("메모 저장됨"). 비우면 지워진다.
   - **`⋯` 메뉴**: 수정…(제목·주저자·저널·등급·사사·투고/게재 연월·상태), 이동 ▸ 상태 선택(터치 기기용), 아카이브로.
   - **새 논문 +**: 제목·주저자·저널은 필수. id는 자동(R12, R13…).
   - **삭제**: 수정 창의 "삭제" → 4초 안에 "정말 삭제"를 한 번 더.
3. 저장 중에는 카드가 반투명해지고, 실패하면 원위치로 돌아오며 빨간 알림이 뜬다. 제목 옆 "마지막 수정 …"으로 반영을 확인한다.

> 로그인은 없습니다. 링크를 아는 사람은 누구나 편집할 수 있으니 주소를 공개 게시하지 마세요.
> 잠그고 싶으면 `netlify env:set PAPERS_EDIT_PIN 원하는번호` 를 실행하고 한 번 더 배포하면, 편집 시 PIN을 묻습니다.

**파일 `content/dashboard/papers.json` 은 이제 백업입니다.** 웹에서 고친 내용이 정본(Netlify 저장소)이고,
`npm run build` 를 하면 최신본이 이 파일로 자동으로 내려옵니다(학생 상세 페이지의 논문 목록도 그때 갱신).
직접 이 파일을 고쳤다면 `node --use-system-ca scripts/papers-sync.mjs push` 로 서버에 올려야 반영됩니다.

**실수했을 때**: `node --use-system-ca scripts/papers-sync.mjs history` 로 최근 30개 저장 시점을 보고,
`node --use-system-ca scripts/papers-sync.mjs restore <rev>` 로 그 시점으로 되돌립니다.

상태 값과 표시 위치: 투고 완료(Submitted)·심사 중(Under Review)·수정 중(Under Revision)·재투고(Resubmitted)·거절(Rejected)은 칸반 1~5열,
게재확정(Accepted)·게재(Published)는 아카이브. 영문 상태는 자동으로 짝이 맞춰지므로 따로 신경 쓸 것이 없습니다.
```

(c) 6절 "직접 배포하고 싶을 때" 명령 블록 첫 줄에 `$env:NODE_OPTIONS = '--use-system-ca'` 추가하고, 마지막에 `> 논문 편집은 배포가 필요 없습니다(5-A). 배포는 과제·강의·학생 데이터를 바꿨을 때만.` 인용문 추가.

(d) 9절 표에 두 행 추가:

```markdown
| 논문 화면에 노란 줄 "실시간 데이터를 불러오지 못해…" | `/api/papers` 함수가 죽었거나 배포에서 빠진 것. `netlify deploy --prod --dir=dist` 를 다시 실행(함수 포함) |
| 웹에서 고친 논문이 학생 상세에 안 보임 | 학생 페이지는 빌드 시점 파일을 씀. `npm run build` + 배포하면 자동 pull 후 반영 |
```

- [ ] **Step 3: 계획서·DEPLOY.md 메모**

`docs/대시보드개편_구현계획서.md` 상단 인용 블록에 한 줄 추가:
`> - "웹 편집은 Apps Script" → **Netlify Functions + Blobs로 대체 구현됨(2026-09-28).** 설계: `docs/superpowers/specs/2026-09-28-papers-web-editing-design.md``

`docs/apps-script/DEPLOY.md` 상단 `> ⛔ 보류` 블록 끝에 한 줄 추가:
`> ✅ 2026-09-28: 이 기능은 Apps Script 대신 **Netlify Functions + Blobs**(`netlify/functions/papers.mts`)로 구현되었습니다. 이 문서는 참고용으로만 남깁니다.`

- [ ] **Step 4: 메모리 갱신**

`memory/netlify-deploy-tls-workaround.md` 본문을 아래 사실에 맞게 고친다: (1) netlify-cli는 이제 **전역 설치됨(27.1.1)** — `npx` 불필요, `netlify` 직접 실행; (2) TLS 우회 `NODE_OPTIONS=--use-system-ca`는 `netlify deploy`·`node scripts/papers-sync.mjs`에 여전히 필요하지만, **`netlify dev`에는 켜면 안 된다**(함수 워커가 플래그를 거부해 500) — 로컬은 `netlify dev --offline`(환경변수 없이); (3) `netlify deploy --prod --dir=dist`가 `/api/papers` 함수를 함께 올린다; (4) 동작하는 순서:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm run build                    # prebuild가 papers-sync pull 실행
netlify deploy --prod --dir=dist --site c113708b-1106-46eb-bb94-4503818fa0aa
npm run deploy
```
`MEMORY.md`의 해당 줄 hook을 `netlify는 전역 설치됨, deploy·sync는 --use-system-ca 필요, dev는 --offline(NODE_OPTIONS 금지), deploy가 함수도 올림` 으로 갱신.

- [ ] **Step 5: 커밋**

```bash
git add README.md 편집가이드.md docs/대시보드개편_구현계획서.md docs/apps-script/DEPLOY.md
git commit -m "docs: papers are edited on the web; papers.json is seed/backup with sync CLI"
```

---

### Task 14: 마무리 — 브랜치 통합

- [ ] **Step 1: 최종 확인**

`npm test`(38 통과), `npm run build`(prebuild pull 포함, 오류 없음), `git status`가 깨끗한지(기존 `package-lock.json` 변경은 Task 4 커밋에 포함됐어야 함), `git log --oneline main..HEAD`로 커밋 목록 확인.

- [ ] **Step 2: superpowers:finishing-a-development-branch 스킬 호출**

로컬 `main`에 병합(빠른 병합 가능하면 그대로). Netlify는 GitHub와 연결돼 있지 않으므로 push는 사이트에 영향이 없다 — **push는 사용자 지시가 있을 때만**. 병합 후 사용자에게 보고: 배포 주소, 편집 방법(편집 스위치), PIN 켜는 법, 복구 명령.
