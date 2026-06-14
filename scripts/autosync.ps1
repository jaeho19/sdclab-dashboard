# ─────────────────────────────────────────────────────────────
# SDC Lab 연구대시보드 자동 동기화 스크립트
# content/ 등 변경분을 GitHub에 커밋·푸시 → GitHub Pages가 자동 재배포.
# Windows 작업 스케줄러에 등록해 주기적으로 실행한다. (편집가이드.md 참고)
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

# 이 스크립트(scripts/)의 상위 폴더 = 저장소 루트
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# 변경 사항이 없으면 조용히 종료
$changes = git status --porcelain
if (-not $changes) { exit 0 }

git add -A
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git commit -m "content: 자동 업데이트 $stamp" | Out-Null
git push origin main
Write-Output "pushed at $stamp"
