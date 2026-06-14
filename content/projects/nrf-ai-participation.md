---
title: AI 기반 농촌 주민참여 방법론
title_en: AI-based Inclusive Rural Resident-Participation Methodology
agency: 한국연구재단 (중견연구·인문사회)
period_start: 2026-06
period_end: 2027-05
status: 초기
progress: 18
color: "#7b2ff7"
order: 3
pi: 이재호 (서울시립대 공간데이터커뮤니티랩)
team:
  - 김소영 (로캐츠 대표)
  - 송채림 (로캐츠 연구원)
  - 강은지 (경기농수산진흥원 농촌재생지원센터장)
  - 권기덕 (과장)
summary: Arnstein 사다리·IAP2 기반 4대 생성형AI 도구로 형식적 참여를 파트너십 수준으로 격상 (3개년 중 1차년도)
keywords: [생성형AI, 주민참여, Arnstein, IAP2, RAG, IRAPM]
years:
  - { label: 1차년도, start: 2026-06, end: 2027-05 }
purpose: 4대 생성형 AI 도구로 형식적 주민참여를 파트너십 수준으로 끌어올리는 통합 방법론(IRAPM)을 개발한다. 1차년도에는 이론 정립과 방법론 ①③ 프로토타입 + 파일럿 1개 마을을 목표로 한다.
current_stage: "1차년도 착수 초기. 마스터플랜·선행연구·프로토타입 ①③ mock 완료. IRB 신청과 여주 금사면 파일럿 마을 섭외가 임박한 핵심 단계. (1차년도 진척 ~18%) ※ 한국연구재단 과제로 별도 착수보고는 없음."
meetings:
  - date: 2026-06-10
    title: 3자 공식 협의 (시립대·로캐츠·경기농수산진흥원)
    summary: 4단계 방법론의 은현면 워크숍 적용안, 문산마을 페르소나 8인 토론 시연. 1~4회차 녹취·인터뷰를 시립대에 제공, 8회차 미래상 AI 영상 제공. 연계 용역(양주 은현면) 일정에 NRF 협력 반영.
  - date: 2026-06-10
    title: 로캐츠 회의 (워크숍 AI 접목)
    summary: 양주 은현면 8회차 워크숍에 4대 AI 접목, 디지털 페르소나 수용성·취약계층(청년·외국인) 수렴전략 논의. 1~4회차 데이터 축적 → 5~6회차 AI 결과 공개·비교 합의.
  - date: 2026-06-08
    title: 양주용역 연계방안 확정
    summary: 완전 통합(v1) 대신 부분 겹침(v2)으로 재정렬. 용역 현황·녹취를 NRF 베이스라인으로 활용, NRF는 방법론 ③(미래 청사진) 중심. 협력 계획서·AI 4종 데모 작성.
next_tasks:
  - { task: IRB 신청서 제출 — 임계경로, due: 2026-06-30 }
  - { task: 여주 금사면 파일럿 마을 섭외 + 실 API 연동 }
  - { task: 노년·방언 STT WER 벤치마크 }
  - { task: 은현면 워크숍 1~8회차 진행 (7~9월) }
  - { task: 방법론 ①③ 프로토타입 v1.0 완성, due: 2026-12 }
  - { task: 1차년도 KCI 1편 투고, due: 2027-05 }
events:
  - { date: 2026-06-07, label: 마스터플랜 + 프로토타입 ①③ mock 완료, type: 마일스톤, status: 완료 }
  - { date: 2026-06-08, label: 양주용역 연계방안 v2 확정, type: 마일스톤, status: 완료 }
  - { date: 2026-06-10, label: 3자 협의 (시립대·로캐츠·경기농수산진흥원), type: 회의, status: 완료 }
  - { date: 2026-06-30, label: IRB 신청서 제출 (임계경로), type: 제출, status: 예정 }
  - { date: 2026-07-15, label: 은현면 워크숍 1회차, type: 회의, status: 예정 }
  - { date: 2026-08-19, label: 은현면 워크숍 5회차 (의견분류·지도화), type: 회의, status: 예정 }
  - { date: 2026-09-30, label: 은현면 워크숍 8회차 (미래상 AI영상), type: 마일스톤, status: 예정 }
  - { date: 2026-12, label: 프로토타입 v1.0 (방법론 ①③), type: 마일스톤, status: 예정 }
  - { date: 2027-03, label: 여주 금사면 파일럿 완료, type: 마일스톤, status: 예정 }
  - { date: 2027-05, label: 1차년도 종료 — KCI 1편 투고, type: 제출, status: 예정 }
---

## 과제 개요

Arnstein의 **참여 사다리**와 **IAP2 스펙트럼**을 이론 기반으로, **4대 생성형 AI 도구**를 개발·실증하여
형식적(tokenistic) 주민참여를 **placation·partnership 수준**으로 끌어올린다. 통합 프레임워크는
**IRAPM(Inclusive Rural AI Participation Methodology)**. 3개년 과제이며, **이 페이지는 1차년도(2026.06~2027.05)** 만 표시한다.
시범지는 여주 금사면이며, 경기도 농촌공간계획 주민참여 실행 용역(양주 은현면)과 보조 트랙으로 연계한다.

**4대 방법론**
1. **STT+LLM 의견수렴·시각화** (Whisper STT + LLM 분류 + 지도 시각화)
2. **LLM 페르소나·시나리오** (사회과학적 디지털 트윈)
3. **Text-to-Image 미래상 시뮬레이션** (Before/After + 미래뉴스)
4. **RAG 기반 주민 주도 계획지원**

**연차 구조:** 1차(이론+①③ 개발+파일럿 1개 마을) → 2차(②④ 개발+금사면 3개 마을) → 3차(IRAPM 통합·확산·정책화)
