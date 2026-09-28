// 브라우저 컨트롤러(src/scripts/papers-board.ts)가 쓰는 순수 도우미. DOM 의존 없음 → node --test로 검증.

const PROD_API = 'https://sdclab-dashboard-156.netlify.app/api/papers';

/** 같은 Netlify 사이트(초안 배포 포함)·로컬은 상대 경로, GitHub Pages 미러 등은 프로덕션 절대 주소(CORS 허용 목록에 있음). */
export function apiUrlFor(hostname: string, prod: string = PROD_API): string {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.netlify.app')) return '/api/papers';
  return prod;
}

/**
 * 드롭 위치 → move op의 index. members는 대상 그룹 구성원을 문서 순서대로(필터로 숨겨진 카드 포함).
 * 서버(model.placeInGroup)는 드래그 카드를 뺀 뒤 그룹 안 순번으로 삽입하므로 여기서도 드래그 카드를 빼고 센다.
 * nextId(놓는 자리 바로 다음에 보이는 카드)가 없으면 undefined → 그룹 끝.
 */
export function dropIndex(members: readonly { id: string }[], draggedId: string, nextId: string | null): number | undefined {
  if (!nextId) return undefined;
  const i = members.filter((m) => m.id !== draggedId).findIndex((m) => m.id === nextId);
  return i < 0 ? undefined : i;
}

/** ISO → 'YYYY-MM-DD HH:mm' (Asia/Seoul). 파싱 실패 시 ''. */
export function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const run = ((...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = undefined; fn(...args); }, ms);
  }) as ((...args: A) => void) & { cancel(): void };
  run.cancel = () => { if (t) clearTimeout(t); t = undefined; };
  return run;
}
