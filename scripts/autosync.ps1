# ─────────────────────────────────────────────────────────────
# SDC Lab 연구대시보드 자동 동기화·배포 스크립트
#   1) content/ 등 변경분을 main 브랜치에 커밋·푸시 (원본 보관)
#   2) Netlify에 배포 (기본 URL)
#   3) GitHub Pages(gh-pages 브랜치)에도 미러 배포
# Windows 작업 스케줄러에 등록해 주기적으로 실행한다. (편집가이드.md 참고)
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

# 이 스크립트(scripts/)의 상위 폴더 = 저장소 루트
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# 변경 사항이 없으면 조용히 종료
$changes = git status --porcelain
if (-not $changes) { exit 0 }

# 1) 원본(main) 커밋·푸시
git add -A
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git commit -m "content: 자동 업데이트 $stamp" | Out-Null
git push origin main

# 2) 루트 빌드 (Netlify용 base="/")
npm run build
if ($LASTEXITCODE -ne 0) { Write-Output "build 실패 — 배포 건너뜀 ($stamp)"; exit 1 }

# Netlify 배포 (기본 URL: https://sdclab-dashboard-156.netlify.app)
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) { Write-Output "Netlify 배포 실패 ($stamp)" }

# 3) GitHub Pages 미러 배포 (base="/sdclab-dashboard/")
npm run deploy
if ($LASTEXITCODE -ne 0) { Write-Output "GitHub Pages 배포 실패 ($stamp)" }

Write-Output "synced & deployed (Netlify + GitHub Pages) at $stamp"
