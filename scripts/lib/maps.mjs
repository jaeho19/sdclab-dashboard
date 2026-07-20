// 고정 룩업 테이블 — 매핑 명세 §1·§3·§4 정본.
// 색·체크박스가 아니라 텍스트가 상태를 담는다(§0). 여기 값은 시트 라벨→목업 캐논 매핑.

/** 학생 한글 이름 → URL-safe 슬러그 (명세 §1). JSON은 name·slug 둘 다 저장. */
export const NAME_TO_SLUG = {
  김은솔: 'eunsol',
  김주현: 'juhyeon',
  김가인: 'gain',
  배성훈: 'seonghun',
  이은진: 'eunjin',
  최희진: 'heejin',
};

/** 학생 처리 순서 (목업 STUDENTS 순서와 동일). */
export const STUDENT_ORDER = ['김은솔', '김주현', '김가인', '배성훈', '이은진', '최희진'];

/** 요건 히트맵 열 캐논 순서(7). 시트 행 41→47이 1:1 대응 (명세 §3). */
export const REQ_COLS = ['이수학점', '어학', '종합시험', '논문자격', '예비심사', '본심사', '최종제출'];

/** 방법론 짧은 라벨 — 시트 행 23~29(인덱스 0~6)에 1:1 (명세 §4.1). */
export const METHOD_LABELS = [
  '공간분석(GIS)·접근성',
  '통계분석·인과추론',
  '설문·인터뷰',
  '딥러닝·컴퓨터비전',
  'VLM·생성형 AI',
  '사례연구·문헌분석',
  '시뮬레이션·모델링',
];

/** 데이터 짧은 라벨 — 시트 행 31~36(인덱스 0~5)에 1:1 (명세 §4.2). */
export const DATA_LABELS = [
  '공간데이터',
  '거리영상(로드뷰)',
  '위성·항공영상',
  '설문·인터뷰',
  '공공데이터·통계',
  '현장조사',
];

/** 일정 구분(시트 B) → sched.t 코드 (명세 §4.3). 미지값은 파서가 R로 폴백. */
export const SCHED_CAT = {
  학위논문연구: 'R',
  학위논문집필: 'R',
  학회발표: 'C',
  저널투고: 'J',
  '심사·졸업': 'D',
};

/** 트래커 상태(H) → 화면 라벨 st + 영문 stEn (명세 §4.4). */
export const PAPER_STATUS = {
  투고: { st: '투고 완료', stEn: 'Submitted' },
  심사중: { st: '심사 중', stEn: 'Under Review' },
  수정요청: { st: '수정 중', stEn: 'Under Revision' },
  재제출: { st: '재투고', stEn: 'Resubmitted' },
  '거절·재타깃': { st: '거절', stEn: 'Rejected' },
  게재확정: { st: '게재확정', stEn: 'Accepted' },
  게재: { st: '게재', stEn: 'Published' },
};

/** 등급(트래커 E) → tier. 미정→und (명세 §4.4). */
export const TIER = { SCIE: 'SCIE', SSCI: 'SSCI', KCI: 'KCI', 미정: 'und' };
