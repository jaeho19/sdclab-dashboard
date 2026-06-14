---
title: 녹지형평성 도시숲 정책 전환
title_en: Urban Forest Policy Transformation for Green-Space Equity
agency: 산림청
period_start: 2026-03
period_end: 2026-12
status: 진행중
progress: 28
color: "#2e7d32"
order: 1
budget: 9,000만 원 (부가세 포함)
pi: 이재호 (서울시립대 조경학과)
team:
  - 김주현
  - 김은솔
  - 김가인
  - 배성훈
  - 이은진
  - 최희진
summary: 3-30-300·WHO 권고를 한국형으로 재해석해 면적 중심에서 형평성 기반 단계적 조성 전략으로 전환
keywords: [녹지형평성, 3-30-300, K-TES, 2SFCA, 수관탐지AI]
purpose: 면적 중심 도시숲 정책을 형평성 기반 단계적 조성 전략으로 전환하고, K-TES로 우선 조성 대상지를 도출해 2026-11-30 최종 산출물로 제출한다.
current_stage: "'가. 실태조사'(9개국 비교) 완료, '나. 지표개발' 진입 단계. 산림청 가로수 데이터 수령 후 수관탐지 모델(DeepForest) 파인튜닝 준비 중. (진척 ~28%)"
meetings:
  - date: 2026-05-13
    title: 한국형 3-30-300 지표 기준 확정 회의
    summary: 층수별 버퍼(저층 30m/중층 55m/고층 100m)·사적녹지 포함·300m 네트워크 기준 확정. 거점도시 7곳 대상지 선정, 분석단위를 집계구로 세분화. DeepForest 오탐 → 가로수 데이터로 파인튜닝 결정.
  - date: 2026-04-29
    title: 산림청 착수보고
    summary: K-TES 설계방향(글로벌 스탠다드 수용 + 한국 고밀도·기후취약성 가점) 보고. Tier2 대상 4개 광역시(서울·인천·대전·부산) 확정, 최종납품 2026-11-30 확정.
  - date: 2026-04-20
    title: 착수보고 준비 회의
    summary: 층수별 가시권 차등, NDVI 임계값 0.5 적용성, 배후산림·사적녹지 포함 여부 논의. 발주처 기준 부재 → 연구팀 기준을 착수보고에서 직접 제안하기로.
  - date: 2026-04-17
    title: 내부 방법론 1차 회의
    summary: 3-30-300 한국형 측정법 검토. '3'=위성+건물높이, '30'=항공영상 해상도 한계로 Tier1/2 이원 전략, '300'=도로 네트워크 최단경로 채택.
next_tasks:
  - { task: 산림청 가로수 데이터 수령 → DeepForest 수관탐지 파인튜닝, due: 2026-05-26 }
  - { task: Sentinel-2 NDVI 파이프라인 구축 (5~10월 합성·구름처리·마스킹) }
  - { task: 전국(Tier1)·거점도시(Tier2) 3-30-300 산정 및 K-TES 지도화 }
  - { task: 솔루션 Before/After 시뮬레이션 + 단·중·장기 투자·관리 로드맵 }
  - { task: 심포지엄 1회 이상 개최 (9~10월경), due: 2026-10 }
  - { task: 최종 산출물 납품, due: 2026-11-30 }
events:
  - { date: 2026-03-13, label: 입찰공고서 발행, type: 마일스톤, status: 완료 }
  - { date: 2026-03-16, label: 과업지시서 확정, type: 마일스톤, status: 완료 }
  - { date: 2026-04-13, label: 9개국 실태조사 완료, type: 마일스톤, status: 완료 }
  - { date: 2026-04-17, label: 내부 방법론 1차 회의, type: 회의, status: 완료 }
  - { date: 2026-04-20, label: 착수보고 준비 회의, type: 회의, status: 완료 }
  - { date: 2026-04-22, label: 제안서 최종본 확정, type: 마일스톤, status: 완료 }
  - { date: 2026-04-29, label: 산림청 착수보고, type: 보고, status: 완료 }
  - { date: 2026-05-13, label: 한국형 3-30-300 지표 기준 확정, type: 회의, status: 완료 }
  - { date: 2026-05-26, label: 산림청 가로수 데이터 수령, type: 마일스톤, status: 예정 }
  - { date: 2026-10, label: 심포지엄 개최 (9~10월경), type: 마일스톤, status: 예정 }
  - { date: 2026-11-30, label: 최종 산출물 납품, type: 마감, status: 예정 }
  - { date: 2026-12-01, label: 과업 공식 종료, type: 마감, status: 예정 }
---

## 과제 개요

WHO/UNECE 수관피복 권고와 **3-30-300 규칙**을 한국 맥락으로 재해석하여, 기존의 *면적 중심* 도시숲 정책을
**형평성 기반의 단계적 조성 전략**으로 전환하는 연구다. 기후·사회·경제 취약성 지표를 통합한 **K-TES(한국형 Tree
Equity Score)** 를 설계하고, 2SFCA 접근성·NDVI 수관피복률을 결합해 **Tier 1(전국·공공데이터)** 과
**Tier 2(거점도시·고해상도)** 이원 분석체계로 우선 조성 대상지를 도출한다.

- **분석 방법:** 3-30-300, K-TES(GAPScore × KEI), G2SFCA/MAH-G2SFCA, GVI(녹시율), NDVI 기반 수관피복(TCC), ODI(구도심 지수), A/B/C Zone 분류
- **과업 4단계:** 가. 실태조사 → 나. 지표개발 → 다. 전략마련 → 라. 기타(심포지엄·홍보)
- **수행기관:** 서울시립대학교 산학협력단 / SDC Lab
