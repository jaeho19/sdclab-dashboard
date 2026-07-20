// Fixed lookup tables shared by the build-time sync parser.
// Source of truth: docs 대시보드개편_구현계획서 + mapping-spec.md §3·§4.

export const NAME_TO_SLUG = {
  김은솔: "eunsol",
  김주현: "juhyeon",
  김가인: "gain",
  배성훈: "seonghun",
  이은진: "eunjin",
  최희진: "heejin",
};

// Canonical heatmap column order (sheet rows 41→47 map 1:1).
export const REQ_COLS = [
  "이수학점",
  "어학",
  "종합시험",
  "논문자격",
  "예비심사",
  "본심사",
  "최종제출",
];

// 방법론: sheet rows 23~29, ☑ in B{row}. Short mockup labels by row index.
export const METHOD_ROWS = [23, 24, 25, 26, 27, 28, 29];
export const METHOD_LABELS = [
  "공간분석(GIS)·접근성",
  "통계분석·인과추론",
  "설문·인터뷰",
  "딥러닝·컴퓨터비전",
  "VLM·생성형 AI",
  "사례연구·문헌분석",
  "시뮬레이션·모델링",
];

// 데이터: sheet rows 31~36, ☑ in B{row}.
export const DATA_ROWS = [31, 32, 33, 34, 35, 36];
export const DATA_LABELS = [
  "공간데이터",
  "거리영상(로드뷰)",
  "위성·항공영상",
  "설문·인터뷰",
  "공공데이터·통계",
  "현장조사",
];

// 일정 구분(B열) → sched.t 코드 (mapping-spec §4.3).
export const SCHED_CAT = {
  학위논문연구: "R",
  학위논문집필: "R",
  학회발표: "C",
  저널투고: "J",
  "심사·졸업": "D",
};

// 완료여부 허용값 (그 외 → 미착수 폴백, mapping-spec §3).
export const REQ_STATES = ["완료", "진행", "미착수"];

// 트래커 H(상태) → 화면 라벨 st + 영문 stEn (mapping-spec §4.4).
export const PAPER_STATUS = {
  투고: { st: "투고 완료", stEn: "Submitted" },
  심사중: { st: "심사 중", stEn: "Under Review" },
  수정요청: { st: "수정 중", stEn: "Under Revision" },
  재제출: { st: "재투고", stEn: "Resubmitted" },
  "거절·재타깃": { st: "거절", stEn: "Rejected" },
  게재확정: { st: "게재확정", stEn: "Accepted" },
  게재: { st: "게재", stEn: "Published" },
};

// 등급(트래커 E) → tier (mapping-spec §4.4). 미정/미상 → und.
export const TIER_MAP = {
  SCIE: "SCIE",
  SSCI: "SSCI",
  KCI: "KCI",
  미정: "und",
};
