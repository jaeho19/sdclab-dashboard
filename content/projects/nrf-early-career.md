---
title: 도시 녹지 접근성·형평성 (신진연구)
title_en: Integrated Green-Space Accessibility & Equity Assessment (Seoul)
agency: 한국연구재단 (신진연구)
period_start: 2025-03
period_end: 2027-02
status: 진행중
progress: 55
color: "#ea580c"
order: 4
pi: 이재호 (서울시립대)
team:
  - 지윤 (연구3)
summary: 서울시 공원·비공원 녹지 통합 접근성/형평성 평가체계 — 하위 3개 연구 (재개발 시계열·매력도 3SFCA·노인 대중교통)
keywords: [G2SFCA, 3SFCA, 환경정의, 접근성형평성, PSM-DID]
years:
  - { label: 1차년도, start: 2025-03, end: 2026-02 }
  - { label: 2차년도, start: 2026-03, end: 2027-02 }
purpose: 서울시 공원·비공원 녹지를 통합한 접근성·형평성 평가체계를 환경정의 관점에서 개발하고, 하위 3개 연구로 SFCA 방법론을 확장해 SSCI/KCI 논문으로 발표한다.
current_stage: "2차년도(2026.03~) 진입. 연구1 ~70%·연구3 ~58%·연구5 ~35%로 상반기 저널 투고를 목표로 진행 중. ※ 이 과제 노트는 2026-02까지가 최신이라 6월 현황 갱신이 필요하다(진척·일정은 2월 시점 추정)."
meetings:
  - date: 2026-01-28
    title: 연구3 시각화 검토 (범례 통일)
    decisions:
      - "도보 접근성 과소표현(Natural Break 왜곡) 확인 → 동일구간·z-score 기준으로 범례 통일"
      - "면적 기반 vs 매력도 기반 접근성을 동일 척도로 비교 재작업"
    next:
      - "교통수단별 접근성 지도 범례 통일 재작성"
      - "고찰·결론 초고 작성 → 상반기 저널 투고 + AAG 발표 준비"
  - date: 2026-01-12
    title: 연구3 3SFCA 프레임워크 미팅
    summary: 매력도 기반 3SFCA 초안 검토, 교통수단별 가중치(도보 0.353·대중교통 0.404·자가용 0.137) 논의.
  - date: 2025-12-29
    title: 연구1 피어리뷰 대응 점검
    summary: 시간적 Placebo 해석 오류(PT 위배를 타당성으로 오해석), PSM 미수행, R&R·Bad control 민감도 미수행 지적 → 해석 수정·분석 즉시 수행 요청.
  - date: 2025-12-18
    title: 연구1 PSM-DID 모형 확정
    summary: 2019 데이터로 Parallel Trends 검증, PSM 1:3 NN 매칭(caliper=0.2), 3시점(2014·2019·2024) 분석틀 확정.
  - date: 2025-11-26
    title: 연구1 초고 검토
    summary: DB 구축 확인, 통계 결과 필요성, 역쌍곡사인 변환 타당성, 공원녹지 증감 변수 유효성, 2014 비공원녹지 포함 여부 논의.
next_tasks:
  - { task: "연구1: PSM·R&R·Bad control 민감도 분석 → 상반기 저널 투고" }
  - { task: "연구3: 지도 범례 통일·고찰 작성 → 투고 + AAG 발표" }
  - { task: "연구5: 노인 보행 접근성 재계산·Enhanced 2SFCA·형평성 분석 → 투고" }
  - { task: 2026-02 이후 진행분으로 현황(진척·일정) 갱신 }
flow:
  note: "신진연구(2025.03~2027.02)는 G2SFCA/3SFCA 접근성 방법론을 축으로 하위 3개 연구(연구1 PSM-DID·연구3 매력도 3SFCA·연구5 노인 대중교통)와 방법론 정리(2SFCA 논문)가 병행되는 구조다. 2차년도(2026.03~)에 진입해 연구1 ~70%·연구3 ~58%·연구5 ~35%로, 연구5는 AAG 발표 후 저널 제출 진행 중이고 연구1·연구3은 2026 상반기(6월) 저널 투고를 앞둔 단계다. ※ 이 노트는 2026-02까지가 최신이라 진척·일정은 추정이다."
  stages:
    - label: "연구1 — 재개발 시계열 접근성 (PSM-DID)"
      status: 진행
      summary: "DID·공간 Placebo 완료, PSM·민감도 보완 후 상반기 투고"
      period: "2025-11~2026-06"
      steps:
        - { text: "초고 검토 — DB 구축·통계 결과·역쌍곡사인 변환·공원녹지 증감 변수 논의", status: 완료 }
        - { text: "PSM-DID 모형 확정 — 2019 PT 검증·1:3 NN 매칭(caliper 0.2)·3시점(2014·2019·2024)", status: 완료 }
        - { text: "피어리뷰 대응 점검 — 시간적 Placebo 해석 오류·PSM/민감도 미수행 지적", status: 완료 }
        - { text: "PSM·R&R·Bad control 민감도 분석 수행", status: 진행 }
        - { text: "연구1 저널 투고 (2026 상반기)", status: 다음주 }
    - label: "연구3 — 매력도 기반 Multi-modal 3SFCA"
      status: 진행
      summary: "3SFCA 프레임워크·초고 완료, 범례 통일·고찰 후 투고+AAG"
      period: "2026-01~2026-06"
      steps:
        - { text: "3SFCA 프레임워크 미팅 — 교통수단별 가중치(도보 0.353·대중교통 0.404·자가용 0.137)", status: 완료 }
        - { text: "시각화 검토 — 동일구간·z-score 기준으로 범례 통일, 면적 vs 매력도 동일척도 비교", status: 완료 }
        - { text: "manuscript 최신본 정리", status: 완료 }
        - { text: "교통수단별 접근성 지도 범례 통일 재작성 + 고찰·결론 초고", status: 진행 }
        - { text: "연구3 저널 투고 (2026 상반기)", status: 다음주 }
    - label: "연구5 — 노인 대중교통 접근성 (Aging in Place)"
      status: 진행
      summary: "T-Map 데이터 구축, Enhanced 2SFCA·형평성 분석 후 제출"
      period: "2026-03~2026-04"
      steps:
        - { text: "T-Map API 대중교통 데이터 구축", status: 완료 }
        - { text: "AAG 학회 발표 (연구3·연구5)", status: 완료 }
        - { text: "노인 보행 접근성 재계산·Enhanced 2SFCA·형평성 분석", status: 진행 }
        - { text: "연구5 저널 제출 (목표)", status: 예정 }
    - label: "2SFCA 방법론 논문"
      status: 진행
      summary: "G2SFCA/3SFCA 방법론 문헌 정리 (연구3·5 근거)"
      period: "2025~2026"
      steps:
        - { text: "G2SFCA/3SFCA 방법론 문헌 정리 (연구3·5 근거)", status: 진행 }
events:
  - { date: 2025-11-26, label: 연구1 초고 검토, type: 회의, status: 완료 }
  - { date: 2025-12-18, label: 연구1 PSM-DID 모형 확정, type: 회의, status: 완료 }
  - { date: 2025-12-29, label: 연구1 피어리뷰 대응 점검, type: 회의, status: 완료 }
  - { date: 2026-01-12, label: 연구3 3SFCA 프레임워크 미팅, type: 회의, status: 완료 }
  - { date: 2026-01-28, label: 연구3 시각화 검토 (범례 통일), type: 회의, status: 완료 }
  - { date: 2026-02-09, label: 연구3 manuscript 최신본, type: 마일스톤, status: 완료 }
  - { date: 2026-03-19, label: AAG 학회 발표 (연구3·연구5), type: 제출, status: 완료 }
  - { date: 2026-04-06, label: 연구5 저널 제출 (목표), type: 제출, status: 진행 }
  - { date: 2026-06, label: 연구1·연구3 저널 투고 (상반기), type: 제출, status: 진행 }
---

## 과제 개요

서울시 **공원·비공원 녹지를 통합**한 접근성·형평성 평가체계를 개발하고 환경정의 관점에서 정책을 지원하는
연구다. G2SFCA/3SFCA 접근성 방법론을 축으로 **하위 3개 연구**가 병행된다. **이 페이지는 1·2차년도까지** 표시한다.

| 하위연구 | 내용 |
|---|---|
| 연구1 | 도시 재개발과 공원녹지 **시계열 접근성 변화** (PSM-DID) |
| 연구3 | **매력도 기반 Multi-modal 3SFCA** 공원 접근성 형평성 (Entropy-TOPSIS) |
| 연구5 | **Aging in Place**를 위한 대형공원 대중교통 접근성 (T-Map API) |
| 2SFCA 논문 | G2SFCA/3SFCA 방법론 문헌 정리(연구3·5 근거) |

- **방법:** G2SFCA/3SFCA, PSM-DID, Entropy-TOPSIS, 공간회귀(Lag/Error), Lorenz/Gini, 환경정의
- **진행 요약(2026-02 기준):** 연구1 ~70%(DID·공간 Placebo 완료, PSM·민감도 미완), 연구3 ~58%(프레임워크·초고, 범례 재작업 필요), 연구5 ~35%(T-Map 데이터 구축, 접근성 산출 전)
