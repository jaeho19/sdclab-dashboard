# 투고 논문 탭 웹 편집 — 설계 문서

> 2026-09-28 · 지도교수 승인 설계. `/papers` 페이지에서 카드 이동·메모·아카이브·기본정보 수정·새 논문 추가를
> **웹에서 바로** 하고, 결과가 재배포 없이 모든 방문자에게 보이게 한다.

## 1. 배경과 목표

- 현재 `/papers`는 빌드 시 `content/dashboard/papers.json`을 읽어 정적으로 렌더링한다. 상태를 하나 바꾸려면
  JSON을 고치고 빌드·배포를 다시 해야 한다(최근 커밋 대부분이 이 종류의 변경).
- 원래 계획서(Phase 3)는 구글 시트 + Apps Script로 웹 편집을 구현하려 했으나 트래커 시트가 소실되어 보류됐다.
- 목표: 교수님이 웹 화면에서 편집하면 즉시 저장되고, 학생·다른 기기에서 열어도 최신 상태가 보인다.
  배포는 더 이상 논문 편집의 전제 조건이 아니다.

## 2. 확정된 결정 (질의 결과)

| 항목 | 결정 |
|------|------|
| 편집·열람 | 교수님이 편집, 누구나 최신 상태 열람 → 서버 저장 필수 |
| 저장 방식 | **Netlify Functions + Netlify Blobs** (기존 Netlify 계정 안, 새 구독·외부 서비스 없음) |
| 인증 | **PIN 없음.** 링크를 아는 사람은 누구나 편집 가능함을 사용자가 인지·수용. 환경변수 `PAPERS_EDIT_PIN`을 설정하면 PIN 요구로 전환되는 여지만 남긴다 |
| 아카이브 대상 | **게재된 것만** (게재확정 Accepted · 게재 Published). 지금과 같은 의미. 거절은 칸반 5열에 남는다 |
| 노트 | 기존 `note` 필드를 **여러 줄 메모 하나**로 통합. 기존 주황색 문구가 첫 메모가 된다 |
| 편집 범위 | 이동(열 간·열 내 순서)·메모·아카이브/복원 + 제목·주저자·저널·등급·사사·투고/게재 연월·상태 수정 + 새 논문 추가 + 삭제 |

## 3. 범위 밖

- 졸업 로드맵·학생 상세·강의 계획 페이지의 웹 편집
- 구글 시트 연동, 로그인 계정, 화면 안 변경 이력 보기(서버 스냅샷 + CLI 복구로 대체)
- 터치 기기용 드래그(메뉴로 이동하는 대안만 제공)

## 4. 아키텍처

```
[열람]  브라우저 ──GET /api/papers──▶ Netlify Function ──▶ Netlify Blobs (store "papers", key "state")
                                          └─ 비어 있으면 빌드에 포함된 papers.json(씨앗) 반환
[편집]  브라우저 ──POST /api/papers {op}──▶ Function: 읽기 → 검증·적용(model.ts) → 조건부 쓰기 → 최신 문서 응답
[빌드]  npm run build ─prebuild─▶ scripts/papers-sync.mjs pull ─▶ content/dashboard/papers.json 갱신
                                  (학생 상세 페이지·git 이력이 웹 편집을 따라감)
```

- 페이지는 빌드 시점 데이터로 먼저 그려지고(SSR), 로드 직후 API 응답으로 교체된다.
- **렌더 템플릿은 한 벌**: 카드·아카이브 행·KPI·필터 칩 HTML을 `src/lib/papers/view.ts`의 순수 함수로 두고
  Astro 빌드(`set:html`)와 브라우저가 같은 함수를 쓴다. 두 벌 유지·드리프트를 없앤다.
- **도메인 규칙도 한 벌**: 상태 표, 검증, 작업 적용(`applyOp`)을 `src/lib/papers/model.ts`에 두고 서버(함수)와
  브라우저(낙관적 반영)가 같은 코드를 쓴다. 낙관적 결과와 서버 결과가 항상 같다.
- GitHub Pages 미러(`jaeho19.github.io/sdclab-dashboard/`)도 같은 API를 절대 주소로 호출한다. CORS 허용 목록에
  미러 도메인과 로컬 개발 주소를 넣는다.

## 5. 데이터 모델

### 5-1. 논문 객체 (`Paper`)

기존 `papers.json` 형태를 그대로 쓴다. 변경은 두 가지뿐이다.

```ts
type Status   = '투고 완료' | '심사 중' | '수정 중' | '재투고' | '거절' | '게재확정' | '게재';
type StatusEn = 'Submitted' | 'Under Review' | 'Under Revision' | 'Resubmitted' | 'Rejected' | 'Accepted' | 'Published';
type Tier     = 'SCIE' | 'SSCI' | 'KCI' | 'und';

interface Paper {
  id: string;          // 고정 식별자. 새 논문은 서버가 다음 빈 R##(지금은 R12) 부여. 아카이브해도 바뀌지 않음
  kind: '실제';
  stu: string;         // 주저자
  t: string;           // 제목
  tier: Tier;
  jr: string;          // 저널
  st: Status;
  stEn: StatusEn;      // st에서 파생. 서버가 항상 표로 채움
  fund?: string | null;
  sub?: string;        // 투고 연월 YYYY-MM
  pub?: string;        // 게재 연월 YYYY-MM  ← 화면은 이미 읽고 있었으나 스키마에 없던 필드를 정식화
  note?: string | null;// 여러 줄 메모(기존 한 줄 note를 그대로 승계)
}
```

- 상태 짝: 투고 완료=Submitted · 심사 중=Under Review · 수정 중=Under Revision · 재투고=Resubmitted ·
  거절=Rejected · 게재확정=Accepted · 게재=Published. 칸반 열 = 앞의 5개, 아카이브 = 뒤의 2개.
- **배열 순서가 화면 순서**다. 열(그룹) 안 카드 순서는 배열에서 같은 그룹인 것들의 상대 순서로 정해진다.
  그룹 = 칸반 상태 5개는 각각 하나의 그룹, 게재확정·게재는 합쳐서 '아카이브' 한 그룹.
- `A##` 접두사는 과거 관례로만 남는다. 문서에서 "R=투고 중, A=아카이브" 설명을 "id는 고정 식별자"로 고친다.

### 5-2. 저장 문서 (Blobs `papers/state`)

```ts
interface PapersDoc { v: 1; rev: number; updatedAt: string /* ISO */; papers: Paper[] }
```

- `rev`는 쓰기마다 1 증가. 응답과 화면의 "마지막 수정" 표시에 쓴다.
- 스냅샷: 쓰기 직전 문서를 `snap/<rev 6자리>` 키로 보관, 최근 30개 유지(`rev % 10 === 0`일 때 정리).

## 6. 공유 모듈 `src/lib/papers/`

### 6-1. `model.ts` (순수 함수, 의존성 없음, 브라우저·Node 공용)

- 상수: `STATUS_EN`, `KANBAN_STATUSES`, `ARCHIVE_STATUSES`, `TIERS`, `groupOf(st)`.
- 검증: `validatePaperFields(fields, {partial})` — 제목·주저자·저널은 비어 있지 않은 문자열(길이 상한 300/40/120),
  `tier` enum, `fund` ≤ 40자(빈 문자열 → 필드 제거), `sub`/`pub`는 `^\d{4}-(0[1-9]|1[0-2])$` 또는 빈 값(→ 제거),
  `note` ≤ 2000자(공백뿐이면 제거). `validatePapers(arr)` — 배열 전체(스키마 + id 중복 금지).
- `nextId(papers)` — `/^[RA](\d+)$/`에 맞는 id의 최대 숫자 + 1을 2자리 이상으로 `R##`.
- `applyOp(doc, op, now): { ok: true, doc } | { ok: false, status: 400|404, error }` — 아래 작업을 적용한 **새 문서**를 돌려준다(입력 불변).

| op | 본문 | 의미 |
|----|------|------|
| `move` | `{ id, st, index? }` | 상태 변경 + 위치. 그룹이 바뀌고 `index` 없음 → 대상 그룹 끝에 추가. 그룹이 같고 `index` 없음 → 제자리에서 상태만 변경(게재확정↔게재 전환용). `index` 있음 → 대상 그룹 안 그 위치(범위 밖이면 끝). 아카이브·복원도 이 op |
| `note` | `{ id, note }` | 메모 설정. 공백뿐이면 필드 삭제 |
| `update` | `{ id, fields }` | 허용 키 `t stu jr tier fund sub pub st`만. `st`가 오면 `stEn`도 갱신하고, 그룹이 바뀌면 `move`(index 없음)와 동일 처리 |
| `add` | `{ paper }` | `t stu jr` 필수, `tier` 기본 `und`, `st` 기본 `투고 완료`, `kind:'실제'`, id 자동. 배열 끝에 추가 |
| `delete` | `{ id }` | 제거 |
| `replace` | `{ papers }` | 전체 교체(검증 통과 시). 동기화 스크립트의 push/restore 전용 |

- 모든 성공 결과는 `rev + 1`, `updatedAt = now`.

### 6-2. `view.ts` (순수 HTML 문자열 렌더, 이스케이프 필수)

- `renderKpis(papers)`, `renderChips(papers)`, `renderKanban(papers)`, `renderArchive(papers)`, `renderCard(p)`,
  `renderArchiveRow(p)`. 기존 `KpiTiles/FilterChips/PaperKanban/ArchiveList.astro`의 마크업·클래스를 그대로 옮긴다.
- 배지 마크업은 `TierBadge/StatusBadge/FundChip.astro`의 출력과 동일하게 맞춘다(그 컴포넌트들은 다른 페이지에서 계속 쓰므로 유지).
- 카드에 추가되는 요소: 메모 상자(`.memo`, 열람 시 텍스트/편집 시 `textarea`), 편집 모드 전용 `⋯` 메뉴 버튼,
  `data-*` 속성(`data-id data-status data-stu data-tier data-year`)은 필터가 그대로 쓰므로 유지.
- 아카이브 행 추가 요소: `게재확정 ↔ 게재` 전환 버튼, `복원` 메뉴(칸반 상태 5개 선택), `수정…`.
- 사용자 입력 문자열은 모두 `escapeHtml`을 거친다(제목에 `<`·`&` 포함 가능).

### 6-3. `handler.ts` (프레임워크 독립 요청 처리기)

```ts
interface Store {
  read(): Promise<{ doc: PapersDoc; etag: string } | null>;
  write(doc: PapersDoc, cond: { ifMatch: string } | { ifNew: true }): Promise<boolean>; // false = 조건 불일치
  writeSnapshot(rev: number, doc: PapersDoc): Promise<void>;
  listSnapshots(): Promise<number[]>;          // rev 목록
  readSnapshot(rev: number): Promise<PapersDoc | null>;
  deleteSnapshot(rev: number): Promise<void>;
}
createPapersHandler({ store, seed, now, pin?, allowedOrigins }): (req: Request) => Promise<Response>
```

- `GET` → `{ ok, source: 'blob'|'seed', rev, updatedAt, papers }`. `?history=1` → 스냅샷 rev 목록, `?snap=<rev>` → 그 문서.
  `Cache-Control: no-store`.
- `POST` → JSON 본문 op. 흐름: `read` → 없으면 씨앗으로 `rev 0` 문서 구성 → `applyOp` → 직전 문서를 `writeSnapshot`
  → `write`(있었으면 `ifMatch: etag`, 없었으면 `ifNew`) → 조건 불일치 시 다시 읽어 최대 3회 재시도 → 실패 시 409.
  성공 응답은 GET과 같은 형태(전체 최신 문서). 스냅샷 정리는 성공한 쓰기 뒤 `rev % 10 === 0`일 때만 수행.
- `OPTIONS` → CORS 프리플라이트. 허용 origin: `https://sdclab-dashboard-156.netlify.app`, `https://jaeho19.github.io`,
  `http://localhost:4321`, `http://localhost:8888`. 허용 헤더: `content-type, x-papers-pin`.
- PIN(선택): `pin`이 설정돼 있으면 `POST`에 `x-papers-pin` 헤더 일치 요구, 아니면 401. 설정이 없으면 검사하지 않는다.
- 오류 형식: `{ ok: false, error: string }` + 상태 코드 400(검증)/404(id 없음)/401/405/409/500.

## 7. Netlify 함수 `netlify/functions/papers.mts`

- Functions v2: `export default async (req, context) => handler(req)`, `export const config = { path: '/api/papers' }`.
- `@netlify/blobs`의 `getStore({ name: 'papers', consistency: 'strong' })`를 `Store` 인터페이스에 맞춘 어댑터로 감싼다.
  강한 일관성을 쓰는 이유: 저장 직후 새로고침해도 방금 바꾼 상태가 보여야 한다(기본 최종 일관성은 최대 60초 지연).
- 씨앗은 `content/dashboard/papers.json`을 함수에서 import(번들 시 포함). 첫 쓰기 전까지 GET은 이 씨앗을 돌려준다.
- 환경변수: `PAPERS_EDIT_PIN`(선택).

## 8. 클라이언트 `src/scripts/papers-board.ts`

- 초기화: `#papers-seed`(JSON) → `doc`. `GET /api/papers` 성공 시 `doc` 교체 후 전체 렌더. 실패 시 SSR DOM 유지,
  노란 안내줄 "실시간 데이터를 불러오지 못해 빌드 시점 상태를 표시합니다", 편집 스위치 비활성.
- API 주소: 호스트가 `localhost`이거나 `*.netlify.app`이면 `/api/papers`, 그 외(미러)는 Netlify 절대 주소.
- 이벤트는 컨테이너(`#kanban #archive #pfilters #kpis`)에 위임해 다시 그려도 재바인딩이 필요 없다.
- **필터**: 기존 로직 이관. 상태 객체로 유지하고 렌더 후 다시 적용. 새 주저자·연도가 생기면 칩도 다시 그린다.
- **편집 스위치**: 제목 옆 `role="switch"` 버튼. `localStorage['papers.edit']`에 기억. 켜면 `body.editing`.
  꺼져 있으면 드래그·메뉴·메모 입력·`새 논문 +`가 보이지 않는다.
- **드래그**(HTML5 DnD, 편집 모드에서만): `.pcard`·`.reqrow`에 `draggable`. `dragover`에서 열 안 카드 중심선과
  포인터 Y를 비교해 삽입 위치를 계산하고 `.drop-line`으로 표시. 열에 놓으면 `move{id, st: 열 상태, index}`,
  아카이브 박스에 놓으면 `move{id, st:'게재확정'}`, 아카이브 행을 열에 놓으면 복원. `dragstart`에서 `setData`(Firefox 필수).
  `index`의 정의: 놓는 자리 **바로 다음에 보이는 카드**의 그룹 내 순번(필터로 숨겨진 카드를 포함해 문서 순서로 센 값).
  다음 카드가 없으면 `index`를 생략해 그룹 끝에 넣는다. 이렇게 하면 필터가 켜진 상태에서 옮겨도 숨겨진 카드의 순서가 어긋나지 않는다.
- **메뉴(⋯)**: 카드 → `수정…`, `이동 ▸ (칸반 상태 선택)`, `아카이브로`. 아카이브 행 → `수정…`, `복원 ▸ (칸반 상태 선택)`,
  `게재확정 ↔ 게재`. 바깥 클릭·Esc로 닫힘. 터치·키보드 사용자의 이동 수단.
- **메모**: 편집 모드에서 `textarea`(자동 높이). 입력 멈춤 0.8초 후 또는 blur 시 `note` 저장. 저장 중 `…`, 완료 `저장됨`
  표시. `note` 응답으로는 전체를 다시 그리지 않고 `doc`만 갱신한다(입력 중 포커스 보존).
- **대화상자**(`<dialog>`): 제목·주저자·저널·등급·사사·투고 연월(`type=month`)·게재 연월·상태. `수정…`은 `update`,
  `새 논문 +`은 `add`. 삭제 버튼은 2단계(누르면 4초간 "정말 삭제"로 바뀜) 후 `delete`. 브라우저 `confirm/alert` 미사용.
- **낙관적 반영**: `prev = doc` 보관 → `applyOp`로 즉시 반영·렌더 → 대상 카드 `.saving`(반투명) → POST →
  성공: 응답 문서로 교체·렌더, 토스트 `저장됨` / 실패: `prev` 복원·렌더, 빨간 토스트에 오류 메시지. 401이면 PIN 입력창.
- **부수 표시**: KPI 5개·열별 건수·아카이브 건수는 렌더마다 재계산. 제목 옆 `마지막 수정 YYYY-MM-DD HH:mm · 실시간`.
  탭이 다시 보일 때(`visibilitychange`) 저장 중이 아니면 재조회해 다른 탭·기기의 변경을 반영.
- **PIN 여지**: `localStorage['papers.pin']`이 있으면 `x-papers-pin` 헤더로 보낸다. 401을 받으면 작은 PIN 입력
  대화상자를 띄우고 저장 후 재시도. PIN이 비활성인 지금은 이 경로가 실행되지 않는다.

## 9. 페이지·스타일 변경

- `src/pages/papers.astro`: 네 컴포넌트 대신 `view.ts` 함수의 결과를 `set:html`로 삽입. 추가 요소: 편집 스위치,
  `새 논문 +`, 마지막 수정 표시, 안내줄 자리, `<dialog>`, 토스트 컨테이너, `<script type="application/json" id="papers-seed">`.
  기존 인라인 필터 스크립트는 `papers-board.ts`로 이관. `ConfRadar`는 그대로.
- 삭제: `PaperKanban.astro`, `ArchiveList.astro`, `KpiTiles.astro`, `FilterChips.astro`(papers 페이지 전용임을 grep으로 확인 후).
- `global.css` 추가: `.editing` 상태(손잡이·메뉴·버튼 노출), `.pcard.dragging`, `.drop-line`, `.drop-target`, `.memo`(열람·편집),
  `.pmenu`, `.saving`, `.toast`, `.edit-switch`, `.banner`, `dialog` 스타일. 기존 토큰(`--soft --line --warn …`)만 사용, 새 색 도입 금지.
  메모는 주황 경고색이 아니라 회색 상자로 표시한다.

## 10. 배포·설정

- `netlify.toml`: `[functions] directory = "netlify/functions"`, `node_bundler = "esbuild"`.
- `package.json`: 의존성 `@netlify/blobs`(런타임), `@netlify/functions`(타입). 스크립트
  `"test": "node --test src/lib/papers/*.test.ts"`, `"prebuild": "node scripts/papers-sync.mjs pull"`,
  `"prebuild:pages": "node scripts/papers-sync.mjs pull"`, `"dev:netlify": "netlify dev"`.
- 배포 절차는 기존과 같다: `npm run build` → `netlify deploy --prod --dir=dist`(이 PC에서는 `NODE_OPTIONS=--use-system-ca` 필요).
  함수가 함께 업로드된다. **첫 배포는 `--prod` 없이 초안(draft) 배포로 올려 `GET /api/papers`와 쓰기 왕복을 확인한 뒤 프로덕션에 올린다.**
- 환경변수는 현재 설정할 것이 없다(PIN 미사용). `netlify env:set PAPERS_EDIT_PIN <값>` 한 줄이 PIN 활성화 절차다.

## 11. 동기화 스크립트 `scripts/papers-sync.mjs`

| 명령 | 동작 |
|------|------|
| `pull` | GET → `validatePapers` → `source`가 `seed`면 종료(아직 웹 편집 없음) → 로컬 파일과 다르면 `content/dashboard/papers.json` 갱신(2칸 들여쓰기·끝 개행). 네트워크 실패는 경고만 내고 exit 0(빌드를 막지 않음). `--strict`면 exit 1 |
| `push` | 로컬 `papers.json`으로 서버 문서를 교체(`replace`). 복구용 |
| `history` | 스냅샷 rev 목록과 각 `updatedAt`·건수 출력 |
| `restore <rev>` | 그 스냅샷의 `papers`로 `replace` |

- `--api <URL>` 옵션(기본 프로덕션 주소). Node `fetch` 사용. `model.ts`를 직접 import해 검증(Node 24 TS 실행).
- `scripts/lib/schemas.mjs`의 `PaperSchema`에 `pub` 추가(기존 sync-sheet 경로와의 정합).
- `autosync.ps1`은 `prebuild` 덕분에 변경 없이 pull이 포함되지만, 커밋 단계가 빌드보다 앞서므로 스크립트 첫 단계에
  `node scripts/papers-sync.mjs pull`을 명시적으로 추가해 pull 결과가 같은 회차에 커밋되게 한다.

## 12. 오류 처리

| 상황 | 처리 |
|------|------|
| 로드 시 API 실패 | SSR 데이터 유지, 안내줄, 편집 비활성 |
| 쓰기 실패(네트워크·4xx·5xx) | 롤백 + 빨간 토스트(서버 `error` 문구) |
| 401 | PIN 입력 대화상자 → 재시도 |
| 409(동시 수정 충돌 3회) | 롤백 + "다시 시도해 주세요" 토스트 |
| 검증 실패 | 대화상자 안 필드 아래 메시지(서버 응답과 동일 규칙이므로 대부분 클라이언트에서 선차단) |
| Blobs 비어 있음 | GET은 씨앗 반환, 첫 POST가 씨앗 기반으로 문서 생성(`ifNew`) |

## 13. 테스트

- **단위**(`npm test`, Node 24 내장 `node --test`, TS 직접 실행):
  - `model.test.ts`: 상태 짝 표, `move`의 세 경우(그룹 변경+index 없음 / 같은 그룹+index 없음 / index 지정)와 범위 밖 index,
    아카이브·복원, `note` 빈값 삭제, `update` 허용 키·형식 검증·`st` 변경 시 그룹 이동, `add` id 부여(R12, 3자리 확장), `delete`,
    `replace` 검증, 입력 불변성, `rev`/`updatedAt` 갱신.
  - `view.test.ts`: 제목의 `<`·`&` 이스케이프, 열별 카드 분배, 아카이브 대상 분리, `data-*` 속성 존재, 메모 렌더.
  - `handler.test.ts`(메모리 `Store` 주입): GET 씨앗/블롭, POST 각 op 왕복, 409 재시도, PIN 설정 시 401, CORS 헤더, 405.
- **브라우저**(`netlify dev` + Playwright): 편집 스위치 → 드래그 이동 → 새로고침 후 유지 / 메모 저장 → 새로고침 후 유지 /
  아카이브 이동·복원 / 새 논문 추가·수정·삭제 / 필터 유지 / API 차단 시 안내줄과 편집 비활성.
- **배포 후**: 초안 배포에서 GET·POST 왕복 → 프로덕션 → 미러에서 최신 표시(CORS) 확인 → `papers-sync.mjs pull` 실행 확인.

## 14. 문서 갱신

- `README.md`·`편집가이드.md` 5-A: "논문은 웹에서 편집이 기본. `papers.json`은 씨앗·백업이며 빌드 전에 자동 pull.
  손으로 고쳐 서버에 올리려면 `push`. 복구는 `history`/`restore`". id 접두사 설명 수정. 배포 시 함수 포함 안내.
- `docs/대시보드개편_구현계획서.md` 상단 메모와 `docs/apps-script/DEPLOY.md` 상단에 "Netlify 함수 + Blobs로 대체 구현(본 문서 링크)" 추가.
- 메모리(`netlify-deploy-tls-workaround`)의 "netlify-cli 미설치" 항목은 현재 전역 설치(27.1.1)로 바뀌었으므로 갱신.

## 15. 가정·리스크

- `netlify deploy`(수동 배포)가 `netlify.toml`의 함수 디렉터리를 자동 번들한다고 가정한다. 초안 배포에서 첫 번째로 검증한다.
- `@netlify/blobs` 11.x의 `onlyIfMatch`/`onlyIfNew`·`consistency: 'strong'`은 공식 문서로 확인했다.
- HTML5 드래그는 터치 기기에서 동작하지 않는다. 메뉴 이동이 대안이다.
- 쓰기가 공개돼 있다(사용자 결정). 스냅샷 30개와 `restore`가 실수·장난에 대한 복구 수단이다. 문제가 생기면 PIN 환경변수 한 줄로 잠근다.
- `astro dev`만 켜면 API가 없어 안내줄이 뜬다. 편집 기능은 `netlify dev`(포트 8888)에서 확인한다.

## 16. 파일 목록

```
src/lib/papers/model.ts · model.test.ts       도메인 규칙·검증·applyOp·nextId
src/lib/papers/view.ts  · view.test.ts        HTML 렌더 함수(빌드·브라우저 공용)
src/lib/papers/handler.ts · handler.test.ts   요청 처리기(Store 주입)
netlify/functions/papers.mts                  Blobs 어댑터 + handler 연결, path '/api/papers'
src/scripts/papers-board.ts                   클라이언트 컨트롤러(필터·편집 스위치·DnD·메뉴·메모·대화상자·토스트)
src/pages/papers.astro                        재구성
src/styles/global.css                         편집 UI 스타일 추가
scripts/papers-sync.mjs                       pull / push / history / restore
scripts/lib/schemas.mjs                       PaperSchema에 pub 추가
scripts/autosync.ps1                          pull 단계 추가
netlify.toml · package.json                   함수 설정, 의존성, 스크립트
README.md · 편집가이드.md · docs/대시보드개편_구현계획서.md · docs/apps-script/DEPLOY.md
삭제: src/components/dashboard/{PaperKanban,ArchiveList,KpiTiles,FilterChips}.astro
```
