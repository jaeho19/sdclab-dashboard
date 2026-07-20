// 학생 상세 페이지 클라이언트 동작 (spec §4). 정적 빌드 결과 위에 얹는 점진적 향상(progressive enhancement):
//   1) 공유 툴팁(#tip) — [data-tip] 위임 (간트 막대·학기 세그먼트 등)
//   2) '다가오는 일정' D-day 갱신 (.fd[data-dday]) — 리빌드 없이 최신 유지
//   3) 학회 발표 배지 상태·D-day 갱신 (.badge[data-conf-start])
//   4) 개인 간트 오늘선(+캡) SVG에 추가 (svg[data-gantt])
// 날짜 파싱은 src/lib/dates.ts와 동일 규칙(YYYY-MM / YYYY-MM-DD)을 미러링한다(mockup의 new Date(s+"T…") 미사용).

const now = new Date();
const TODAY = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
const DAY = 86400000;

function parse(s: string): number {
  const [y, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
function parseEnd(s: string): number {
  const p = s.split('-').map(Number);
  const [y, m = 12, d] = p;
  return (d ? new Date(y, m - 1, d) : new Date(y, m, 0)).getTime();
}
const dday = (s: string): number => Math.round((parse(s) - TODAY) / DAY);
const fmtD = (n: number): string => (n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`);

// 1) 공유 툴팁 (#tip)
const tip = document.getElementById('tip');
if (tip) {
  document.addEventListener('mousemove', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (!el) {
      tip.style.opacity = '0';
      return;
    }
    tip.textContent = el.getAttribute('data-tip') ?? '';
    tip.style.opacity = '1';
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tw - 8) + 'px';
    tip.style.top = e.clientY + 16 + 'px';
  });
}

// 2) 다가오는 일정 D-day 갱신 (.fd[data-dday]) — ≤45d hot
document.querySelectorAll<HTMLElement>('.fd[data-dday]').forEach((el) => {
  const date = el.dataset.dday;
  if (!date) return;
  const n = dday(date);
  el.textContent = fmtD(n);
  el.classList.toggle('hot', n <= 45);
});

// 3) 학회 발표 배지 상태·D-day 갱신 (.badge[data-conf-start])
document.querySelectorAll<HTMLElement>('.badge[data-conf-start]').forEach((el) => {
  const s = el.dataset.confStart;
  const e = el.dataset.confEnd;
  if (!s || !e) return;
  const start = parse(s);
  const end = parseEnd(e);
  el.classList.remove('rq-done', 'rq-doing', 'rq-todo');
  if (TODAY < start) {
    const n = dday(s);
    el.classList.add(n <= 60 ? 'rq-doing' : 'rq-todo');
    el.textContent = `${fmtD(n)} 예정`;
  } else if (TODAY <= end) {
    el.classList.add('rq-doing');
    el.textContent = '준비 구간 진행 중';
  } else {
    el.classList.add('rq-done');
    el.textContent = '종료';
  }
});

// 4) 개인 간트 오늘선 (svg[data-gantt])
const svg = document.querySelector<SVGSVGElement>('svg[data-gantt]');
if (svg) {
  const min = Number(svg.dataset.min);
  const span = Number(svg.dataset.span);
  const W = Number(svg.dataset.w);
  const LP = Number(svg.dataset.lp);
  const TOP = Number(svg.dataset.top);
  const H = Number(svg.dataset.h);
  if (Number.isFinite(min) && span > 0 && TODAY >= min && TODAY <= min + span) {
    const tx = LP + ((TODAY - min) / span) * (W - LP - 6);
    const NS = 'http://www.w3.org/2000/svg';
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(tx));
    line.setAttribute('y1', String(TOP - 8));
    line.setAttribute('x2', String(tx));
    line.setAttribute('y2', String(H - 10));
    line.setAttribute('class', 'today');
    const cap = document.createElementNS(NS, 'text');
    cap.setAttribute('x', String(tx + 3));
    cap.setAttribute('y', String(H - 2));
    cap.setAttribute('class', 'todaycap');
    cap.textContent = '오늘';
    svg.appendChild(line);
    svg.appendChild(cap);
  }
}
