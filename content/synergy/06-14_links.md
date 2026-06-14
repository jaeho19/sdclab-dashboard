---
intro: 4개 과제는 방법론·데이터·현장 자원에서 서로 맞물리는 지점이 있습니다. 아래 연계를 통해 한 과제의 산출물을 다른 과제의 입력·검증·고도화 자산으로 공유하고, 공동 실적(논문·데이터셋·실증)으로 발전시킵니다.
links:
  - id: forest-x-early
    a: forest-equity
    b: nrf-early-career
    title: 녹지 접근성·형평성 분석 상호 활용
    theme: 녹지 접근성 공유
    strength: 강
    shared:
      - from: forest-equity
        to: nrf-early-career
        asset: 300m 네트워크 녹지 접근성·2SFCA 산출 결과 및 녹지/수관(NDVI) 레이어
        how: 신진연구의 서울시 3SFCA·형평성 분석의 입력·교차검증 데이터로 활용 (공원+비공원 녹지 정의 정합)
      - from: nrf-early-career
        to: forest-equity
        asset: G2SFCA/3SFCA·Entropy-TOPSIS 매력도 지수·Lorenz/Gini 형평성 기법
        how: 산림청 K-TES의 접근성·형평성 컴포넌트 고도화 및 방법론 검증
    outputs:
      - SFCA 기반 녹지 접근성·형평성 공동 방법론 정리 → 공동 저널/학회 발표
      - 서울·전국 녹지 접근성 데이터셋·분석 코드의 공유 자산화
      - 환경정의(접근성 격차) 지표 상호 검증으로 정책 신뢰도 제고
  - id: gyeonggi-x-ai
    a: gyeonggi-participatory-data
    b: nrf-ai-participation
    title: 현장 전문가·데이터와 AI 주민참여 도구의 결합
    theme: 현장 데이터·AI 참여 공유
    strength: 강
    shared:
      - from: gyeonggi-participatory-data
        to: nrf-ai-participation
        asset: 현장전문가 네트워크, 여주 현장조사 로우데이터·표준 DB, 주민참여 프로세스
        how: AI 도구(STT+LLM 의견수렴·RAG 계획지원)의 학습·검증 베이스라인 및 실증 현장 제공
      - from: nrf-ai-participation
        to: gyeonggi-participatory-data
        asset: AI 페르소나·시나리오, Text-to-Image 미래상, 의견 자동분류·지도 시각화
        how: 참여형 데이터 수집·주민 의견수렴·미래상 도출 단계의 고도화
    outputs:
      - 여주·양주(은현면) 공동 실증 → 공동 실적·보고서
      - AI 주민참여 방법론 + 현장 데이터 표준화 결합 성과 (KCI·정책 가이드)
      - 경기농수산진흥원 공통 발주처 기반 후속 과제·확산 연계
  - id: forest-x-gyeonggi
    a: forest-equity
    b: gyeonggi-participatory-data
    title: 녹지·농촌 공간 자원 데이터 호환
    theme: 녹지·농촌 자원
    strength: 추가
    shared:
      - from: forest-equity
        to: gyeonggi-participatory-data
        asset: NDVI 기반 녹지·수관 데이터, 녹지 자원 지표
        how: 농촌공간 참여형 데이터의 녹지·생태 자원 항목 보강
    outputs:
      - 도시·농촌 녹지 자원 지표 표준의 정합·공유
  - id: ai-x-early
    a: nrf-ai-participation
    b: nrf-early-career
    title: AI 시각화로 접근성 결과 커뮤니케이션
    theme: AI 결과 시각화
    strength: 추가
    shared:
      - from: nrf-ai-participation
        to: nrf-early-career
        asset: Text-to-Image 미래상·결과 시각화 파이프라인
        how: 접근성·형평성 분석 결과를 시민 친화적으로 시각화·시나리오화
    outputs:
      - 접근성·형평성 결과의 대시민 시각화 공동 산출
---
