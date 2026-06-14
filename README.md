# SDC Lab 연구과제 종합 대시보드

🔗 **배포 주소 (Netlify, 기본):** https://sdclab-dashboard-156.netlify.app
🔗 **미러 (GitHub Pages):** https://jaeho19.github.io/sdclab-dashboard/

> ⚠️ 참고: Netlify 계정의 `sdclab-dashboard.netlify.app`(저장소 `sdc-lab-dashboard2`)는 **별개의 Next.js 회원/로그인 앱**으로, 이 연구 대시보드와 무관합니다.

진행 중인 연구과제의 **회의 내용 · 진행상황 · 향후 일정**을 한 페이지에서 보고 관리하는 정적 대시보드.

- **프레임워크:** [Astro](https://astro.build) 5 + Tailwind CSS 4
- **콘텐츠:** `content/projects/*.md` (Markdown + YAML frontmatter) — Obsidian에서 직접 편집
- **배포:** GitHub Pages (push 시 GitHub Actions 자동 빌드·배포) · Netlify 전환 가능
- **자동 업데이트:** `scripts/autosync.ps1` + Windows 작업 스케줄러

> 편집·운영 방법은 **[편집가이드.md](./편집가이드.md)** 를 보세요.

## 구조
```
content/projects/   ← 과제별 내용 (여기만 편집하면 됩니다)
src/
  pages/            메인(index) · 과제 상세([slug])
  components/       카드 · 타임라인 · 임박일정 · 상태배지
  layouts/          공통 레이아웃
  lib/dates.ts      날짜·D-day·타임라인 위치 계산
  content.config.ts 콘텐츠 스키마
.github/workflows/  Pages 자동 배포
```

## 로컬 실행
```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ 정적 빌드
```
