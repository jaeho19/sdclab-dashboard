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
| 투고 논문 | `content/dashboard/papers.json` | **직접 편집** ← 아래 참고 |
| 졸업 로드맵(학생) · 학회 일정 | `content/dashboard/students.json`<br>`content/dashboard/conferences.json` | ❌ 직접 편집 금지. 구글 시트 수정 후 `node scripts/sync-sheet.mjs` |

### 투고 논문(`papers.json`)이 직접 편집인 이유

원래는 투고논문 트래커 워크북에서 `scripts/sync-sheet.mjs`가 생성했지만, **그 워크북이 소실됐습니다**
(구글 시트 `졸업계획_템플릿`에 `06_투고논문` 탭 없음, 로컬 폴백 `06_투고논문_트래커.xlsx`도 없음).
지금은 `papers.json` 자체가 유일본이자 정본이며, 트래커가 없으면 동기화가 이 파일을 건너뛰도록 되어 있습니다.

한 논문의 형태:

```jsonc
{
  "id": "R07",              // R##=투고 중, A##=게재 아카이브
  "kind": "실제",            // 반드시 "실제"
  "stu": "강성익",           // 주저자
  "t": "After Sunset: …",   // 제목
  "tier": "SCIE",           // SCIE | SSCI | KCI | und
  "jr": "Cities",           // 저널명
  "st": "심사 중",           // 아래 표 참고
  "stEn": "Under Review",   // st와 반드시 짝을 맞출 것
  "sub": "2026-05",         // (선택) 투고 연월. 없으면 카드에 "투고 연월 기입 필요"
  "note": "수정본 제출 마감 2026-09-17"  // (선택) 카드 하단 경고줄
}
```

`st` / `stEn` 짝 — 둘 중 하나만 바꾸면 화면이 어긋납니다:

| `st` | `stEn` | 표시 위치 |
|------|--------|-----------|
| 투고 완료 | `Submitted` | 칸반 1열 |
| 심사 중 | `Under Review` | 칸반 2열 |
| 수정 중 | `Under Revision` | 칸반 3열 |
| 재투고 | `Resubmitted` | 칸반 4열 |
| 거절 | `Rejected` | 칸반 5열 |
| 게재확정 | `Accepted` | 아카이브 |
| 게재 | `Published` | 아카이브 |

KPI 타일·필터 칩·열 개수는 모두 이 데이터에서 자동 계산되므로 따로 고칠 곳이 없습니다.

## 구조

```
content/
  projects/         과제별 내용 (직접 편집)
  teaching/         강의 계획 (직접 편집)
  dashboard/        papers.json(직접 편집) · students·conferences.json(시트 동기화 산출)
src/
  pages/            index · papers · roadmap · teaching · projects/[slug](+archive) · students/[slug]
  components/       카드 · 타임라인 · 상태배지 · dashboard/* (칸반 · KPI · 필터 · 학회레이더 등)
  layouts/          공통 레이아웃
  lib/dates.ts      날짜·D-day·타임라인 위치 계산
  content.config.ts 콘텐츠 스키마
scripts/
  sync-sheet.mjs    구글 시트 → content/dashboard/*.json
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
npm run build
netlify deploy --prod --dir=dist     # → https://sdclab-dashboard-156.netlify.app
npm run deploy                       # (선택) GitHub Pages 미러 갱신
```

`scripts/autosync.ps1`이 위 과정을 한 번에 수행합니다 — 변경분 커밋·푸시 → 빌드 → Netlify 배포 → gh-pages 미러.
