# SDC Lab 연구과제 종합 대시보드

🔗 **배포 주소 (Netlify, 기본):** https://sdclab-dashboard-156.netlify.app
🔗 **미러 (GitHub Pages):** https://jaeho19.github.io/sdclab-dashboard/

> ⚠️ 참고: Netlify 계정의 `sdclab-dashboard.netlify.app`(저장소 `sdc-lab-dashboard2`)는 **별개의 Next.js 회원/로그인 앱**으로, 이 연구 대시보드와 무관합니다.

진행 중인 연구과제의 **회의 내용 · 진행상황 · 향후 일정**, 그리고 **졸업 로드맵 · 투고 논문 현황**을 한 곳에서 보는 정적 대시보드.

- **프레임워크:** [Astro](https://astro.build) 5 + Tailwind CSS 4
- **작업 사본:** `C:\Users\1\sdclab-dashboard` (2026-08-06 기준. 예전 경로 `C:\dev\sdclab-dashboard`는 삭제됨)
- **배포:** 로컬에서 빌드 후 **Netlify CLI로 업로드**. GitHub Pages는 `npm run deploy`로 미러링.
- **자동화:** `scripts/autosync.ps1` + Windows 작업 스케줄러 (`SDCLab-Dashboard-AutoSync`, 매일 1회)

> 편집·운영 방법은 **[편집가이드.md](./편집가이드.md)** 를 보세요.

## 콘텐츠는 두 갈래입니다

| 대상 | 파일 | 편집 방법 |
|------|------|-----------|
| 과제 카드·타임라인·연구 흐름도 | `content/projects/*.md` | **직접 편집** (Markdown + YAML frontmatter) |
| 강의 계획 | `content/teaching/plan.md` | **직접 편집** |
| 투고 논문 | **웹 화면** https://sdclab-dashboard-156.netlify.app/papers/ (편집 스위치) | 서버(Netlify Blobs)에 즉시 저장. `content/dashboard/papers.json` 은 씨앗·백업이며 빌드 전에 자동으로 내려받음 ← 아래 참고 |
| 졸업 로드맵(학생) · 학회 일정 | `content/dashboard/students.json`<br>`content/dashboard/conferences.json` | ❌ 직접 편집 금지. 구글 시트 수정 후 `node scripts/sync-sheet.mjs` |

### 투고 논문은 웹에서 편집합니다 (2026-09-28~)

`/papers` 페이지 제목 옆 **편집** 스위치를 켜면 카드 드래그(열 이동·순서), 메모, 아카이브(게재확정) 이동·복원,
`⋯` 메뉴의 수정(제목·주저자·저널·등급·사사·투고/게재 연월·상태)·삭제, `새 논문 +` 추가가 됩니다.
저장은 즉시 이루어지며(`/api/papers` → Netlify Blobs) **재배포가 필요 없고**, 다른 기기·학생 화면에도 바로 반영됩니다.
인증은 없습니다(링크를 아는 사람은 누구나 편집 가능). 필요해지면 `netlify env:set PAPERS_EDIT_PIN <값>` 을 실행하고 한 번 더 배포하면 편집 시 PIN을 요구합니다.

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

## 구조

```
content/
  projects/         과제별 내용 (직접 편집)
  teaching/         강의 계획 (직접 편집)
  dashboard/        papers.json(웹 편집·백업) · students·conferences.json(시트 동기화 산출)
src/
  pages/            index · papers · roadmap · teaching · projects/[slug](+archive) · students/[slug]
  components/       카드 · 타임라인 · 상태배지 · dashboard/* (칸반 · KPI · 필터 · 학회레이더 등)
  layouts/          공통 레이아웃
  lib/dates.ts      날짜·D-day·타임라인 위치 계산
  lib/papers/        논문 규칙(model)·렌더(view)·API 핸들러(handler) — 빌드·브라우저·함수 공용
  content.config.ts 콘텐츠 스키마
  scripts/papers-board.ts  /papers 편집 화면
netlify/functions/papers.mts   /api/papers (Netlify Blobs)
scripts/
  sync-sheet.mjs    구글 시트 → content/dashboard/*.json
  papers-sync.mjs   웹 편집 데이터 ↔ papers.json (pull/push/history/restore)
  autosync.ps1      커밋·푸시·빌드·배포 (작업 스케줄러가 호출)
```

> `.github/workflows`는 없습니다. GitHub Actions 자동 배포는 쓰지 않습니다.

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ 정적 빌드
```

## 배포

⚠️ **`git push`만으로는 사이트가 갱신되지 않습니다.** Netlify가 GitHub 저장소에 연결되어 있지 않아
(빌드 설정 비어 있음 · 모든 배포가 CLI 업로드), 반드시 빌드 결과를 직접 올려야 합니다.

```bash
$env:NODE_OPTIONS = '--use-system-ca'   # 이 PC의 TLS 가로채기 우회 (PowerShell)
npm run build                            # prebuild: 웹 편집본을 papers.json으로 내려받음
netlify deploy --prod --dir=dist         # 정적 파일 + /api/papers 함수 함께 업로드
npm run deploy                           # (선택) GitHub Pages 미러 갱신
```

`scripts/autosync.ps1`이 위 과정을 한 번에 수행합니다 — 변경분 커밋·푸시 → 빌드 → Netlify 배포 → gh-pages 미러.
