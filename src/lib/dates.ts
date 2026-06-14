// 'YYYY-MM' 또는 'YYYY-MM-DD' 문자열을 Date로 파싱한다.
export function parseDate(s: string): Date {
  const [y, m = 1, d = 1] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

// 기간 끝(period_end)은 해당 월의 마지막 날로 처리해 막대 길이를 자연스럽게 한다.
export function parseDateEnd(s: string): Date {
  const parts = s.split('-').map((n) => parseInt(n, 10));
  const [y, m = 12, d] = parts;
  if (d !== undefined) return new Date(y, m - 1, d);
  return new Date(y, m, 0); // m월의 0일 = (m-1)월 마지막 날 → 즉 m월 말일
}

export function today(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export function dday(target: string): number {
  return Math.round((parseDate(target).getTime() - today().getTime()) / 86400000);
}

export function fmtDday(n: number): string {
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${Math.abs(n)}`;
}

// 'YYYY.MM.DD' 또는 'YYYY.MM' 표기
export function fmtDate(s: string): string {
  const parts = s.split('-');
  if (parts.length >= 3) return `${parts[0]}.${parts[1]}.${parts[2]}`;
  return `${parts[0]}.${parts[1]}`;
}

export function fmtRange(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

// min~max 구간에서 date의 위치(%)
export function pct(date: Date, min: Date, max: Date): number {
  const span = max.getTime() - min.getTime();
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((date.getTime() - min.getTime()) / span) * 100));
}
