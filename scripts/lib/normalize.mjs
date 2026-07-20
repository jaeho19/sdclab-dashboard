// 순수 정규화 함수 — 매핑 명세 §2·§5.1. 부작용 없음, 입력 불변.

const p2 = (x) => String(x).padStart(2, '0');

/** 공백·개행을 단일 공백으로 접고 trim. */
export function flat(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/** flat 후 빈 문자열이면 null. */
export function textOrNull(v) {
  const t = flat(v);
  return t === '' ? null : t;
}

/**
 * 날짜 정규화 (명세 §2.2). 반환 { iso, raw, warn? }.
 *  iso = YYYY-MM-DD 또는 YYYY-MM (파싱 불가/빈값 → null)
 *  raw = 원본 문자열(자유텍스트·다중값 보존, 빈값 → null)
 * 날짜를 지어내지 않는다: 월 단위는 월 단위로 유지.
 */
export function normDate(v) {
  if (v == null || v === '') return { iso: null, raw: null };
  if (v instanceof Date) {
    const iso = `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}`;
    return { iso, raw: iso };
  }
  const raw = String(v).trim();
  if (raw === '') return { iso: null, raw: null };
  const s = raw.replace(/[./]/g, '-'); // dot → hyphen 통일
  const full = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); // YYYY-MM-DD
  if (full) return { iso: `${full[1]}-${p2(full[2])}-${p2(full[3])}`, raw };
  const month = s.match(/(\d{4})-(\d{1,2})/); // YYYY-MM (첫 유효 토큰)
  if (month) return { iso: `${month[1]}-${p2(month[2])}`, raw };
  return { iso: null, raw }; // '2027 상반기' 등 → 원문만 보존
}

/** 입학 학기 정규화: "2025-1학기" → "2025-1" (명세 §5). */
export function normEntry(v) {
  const raw = String(v ?? '').trim();
  const m = raw.match(/(\d{4})\s*-\s*([12])/);
  return m ? `${m[1]}-${m[2]}` : raw;
}

/** 졸업 목표: "2028-후기(2028.08)" → { goal:"2028 후기", goalDate:"2028-08-31" } (명세 §5). */
export function parseGoal(v) {
  const raw = String(v ?? '').trim();
  const ym = raw.match(/(\d{4})/);
  const year = ym ? ym[1] : null;
  const half = raw.includes('후기') ? '후기' : raw.includes('전기') ? '전기' : null;
  const goal = year && half ? `${year} ${half}` : raw;
  const goalDate = year && half ? (half === '후기' ? `${year}-08-31` : `${year}-02-28`) : null;
  return { goal, goalDate };
}

// ── 학기 인덱스 계산 (명세 §5.1) — remain/elapsed 부패 방지 스냅샷 ──
const semIndex = (y, half) => y * 2 + (half - 1); // half ∈ {1,2}

function currentSem(today) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  if (m >= 3 && m <= 8) return semIndex(y, 1); // 1학기 3~8월
  if (m >= 9 && m <= 12) return semIndex(y, 2); // 2학기 9~12월
  return semIndex(y - 1, 2); // 1·2월은 전년도 2학기
}

const entrySem = (entry) => {
  const [y, n] = String(entry).split('-').map(Number);
  return semIndex(y, n);
};

const gradSem = (goalDate) => {
  const [y, mo] = String(goalDate).split('-').map(Number);
  return mo === 8 ? semIndex(y, 1) : semIndex(y - 1, 2); // 후기=8월→(Y,1), 전기=2월→(Y-1,2)
};

/** entry+goalDate+오늘 → { elapsed, remain } 스냅샷 (명세 §5.1). */
export function computeElapsedRemain(entry, goalDate, today) {
  const cur = currentSem(today);
  const elapsed = cur - entrySem(entry) + 1; // 입학~현재 학기 포함
  const remain = goalDate ? gradSem(goalDate) - cur : null; // 다음~졸업 학기
  return { elapsed, remain };
}

/** 잠정 제목/키워드(C18) 정규화 (명세 §5·§10.7). 키워드 나열 → " · " 조인, 문장형 → 원문. */
export function parseKw(v) {
  let raw = String(v ?? '').replace(/\r/g, '').replace(/^키워드\s*[:：]?\s*/, '');
  raw = raw.replace(/\s+/g, ' ').trim();
  if (raw === '') return null;
  if (/[,，]/.test(raw)) {
    return raw
      .split(/\s*[,，]\s*/)
      .map((x) => x.trim())
      .filter(Boolean)
      .join(' · ');
  }
  return raw;
}

/** 연구질문(C19, 멀티라인) → 배열 (명세 §5). 빈 셀 → null. */
export function parseRq(v) {
  const raw = String(v ?? '').replace(/\r/g, '').trim();
  if (raw === '') return null;
  const out = raw
    .split('\n')
    .map((l) => stripListPrefix(l.trim()))
    .map((l) => l.trim())
    .filter(Boolean);
  return out.length ? out : null;
}

function stripListPrefix(l) {
  return l
    .replace(/^(RQ|Q)\s*\.?\s*\d+\s*[.):]?\s*/i, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '')
    .replace(/^\d+\s*[.)]\s*/, '');
}

/** 기존연구 공백(C20) → 문자열|null (명세 §5). */
export function parseGap(v) {
  return textOrNull(v);
}
