// /papers 화면 조각 렌더 (설계 문서 §6-2). 빌드(Astro set:html)와 브라우저가 같은 함수를 쓴다.
// 사용자 입력은 전부 esc()를 거친다. 마크업·클래스는 예전 KpiTiles/FilterChips/PaperKanban/ArchiveList.astro와
// TierBadge/StatusBadge/FundChip.astro의 출력을 그대로 옮겼다(스타일은 global.css의 기존 규칙).
import type { Paper } from './model.ts';
import { KANBAN_STATUSES, isArchived, stageOf } from './model.ts';

export interface ViewOpts {
  editing?: boolean;
}
export interface FilterState {
  f: string;
  t: string;
  y: string;
}
export const DEFAULT_FILTER: FilterState = { f: '전체', t: '전체', y: '전체' };

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}
export const fmtYM = (s?: string | null): string => (s ? s.slice(0, 7).replace('-', '.') : '');
export const yearOf = (p: Paper): string => (p.sub ? p.sub.slice(0, 4) : '');

export const tierBadge = (tier: string): string =>
  `<span class="tier ${esc(tier)}">${esc(tier === 'und' ? '미정' : tier === 'SCIE' ? 'SCI급' : tier)}</span>`;
export const stageBadge = (stEn: string): string =>
  `<span class="sten s-${esc(stEn.replace(/\s+/g, ''))}">${esc(stEn)}</span>`;
export const fundChip = (fund?: string | null): string => {
  const l = fund?.trim();
  return l ? `<span class="fund">사사 ${esc(l)}</span>` : `<span class="fund none">사사 기입 필요</span>`;
};

const dataAttrs = (p: Paper): string =>
  `data-id="${esc(p.id)}" data-status="${esc(p.st)}" data-stu="${esc(p.stu)}" data-tier="${esc(p.tier)}" data-year="${esc(yearOf(p))}"`;

// 메모: 열람 모드는 있을 때만 회색 상자, 편집 모드는 항상 textarea(없는 메모도 새로 적을 수 있게).
function memoBox(p: Paper, editing: boolean): string {
  if (editing) {
    return `<textarea class="memo" data-note="${esc(p.id)}" rows="1" placeholder="메모…" aria-label="메모">${esc(p.note ?? '')}</textarea>`;
  }
  return p.note ? `<div class="memo view">${esc(p.note)}</div>` : '';
}
const menuBtn = (p: Paper): string =>
  `<button type="button" class="pmenu-btn" data-menu="${esc(p.id)}" aria-label="카드 메뉴" aria-haspopup="menu">⋯</button>`;

export function renderCard(p: Paper, o: ViewOpts = {}): string {
  const ed = !!o.editing;
  return `<div class="pcard" ${dataAttrs(p)}${ed ? ' draggable="true"' : ''}>
  <div class="t">${esc(p.t)}</div>
  <div class="m">${tierBadge(p.tier)}${stageBadge(p.stEn)}<span class="stu2">주저자 ${esc(p.stu)}</span>${fundChip(p.fund)}</div>
  <div class="m"><span class="jr">${esc(p.jr)}</span></div>
  <div class="m"><span class="stu2 num">${p.sub ? `투고 ${esc(fmtYM(p.sub))}` : '투고 연월 기입 필요'}</span></div>
  ${memoBox(p, ed)}${ed ? menuBtn(p) : ''}
</div>`;
}

export function renderKanban(papers: Paper[], o: ViewOpts = {}): string {
  return KANBAN_STATUSES.map((stage) => {
    const items = papers.filter((p) => p.st === stage);
    return `<div class="kcol" data-stage="${esc(stage)}">
  <h4>${esc(stage)} <span class="n num">${items.length}</span></h4>
  ${items.map((p) => renderCard(p, o)).join('\n')}
  <div class="kempty"${items.length ? ' hidden' : ''}>해당 상태의 논문 없음</div>
</div>`;
  }).join('\n');
}

export function renderArchiveRow(p: Paper, o: ViewOpts = {}): string {
  const ed = !!o.editing;
  return `<div class="reqrow" ${dataAttrs(p)}${ed ? ' draggable="true"' : ''}>
  ${stageBadge(p.stEn)}
  <b style="flex:1;min-width:220px">${esc(p.t)}</b>
  ${tierBadge(p.tier)}
  <span class="rq-std" style="flex:0 1 auto;min-width:0">${esc(p.jr)}</span>
  <span class="rq-now">주저자 ${esc(p.stu)}</span>
  ${fundChip(p.fund)}
  <span class="rq-now num">${p.pub ? `게재 ${esc(fmtYM(p.pub))}` : '게재 연월 기입 필요'}</span>
  ${memoBox(p, ed)}${ed ? menuBtn(p) : ''}
</div>`;
}

// 빈 안내(#arch-empty)를 맨 앞에 둔다: `.reqrow:last-child`가 마지막 행의 밑줄을 지우는 규칙을 유지하기 위해.
export function renderArchive(papers: Paper[], o: ViewOpts = {}): string {
  const arch = papers.filter(isArchived);
  return (
    `<div class="kempty" id="arch-empty"${arch.length ? ' hidden' : ''} style="margin:8px 0">표시할 게재 논문 없음</div>\n` +
    arch.map((p) => renderArchiveRow(p, o)).join('\n')
  );
}

export function renderKpis(papers: Paper[]): string {
  const act = papers.filter((p) => stageOf(p) !== '게재');
  const arch = papers.filter((p) => stageOf(p) === '게재');
  const cnt = (st: string) => act.filter((p) => p.st === st).length;
  const grouped = (arr: Paper[], key: (p: Paper) => string): [string, number][] => {
    const m = new Map<string, number>();
    for (const p of arr) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return [...m.entries()];
  };
  const reviewJournals = grouped(act.filter((p) => p.st === '심사 중'), (p) => p.jr)
    .map(([jr, n]) => (n > 1 ? `${jr} ${n}` : jr)).join(' · ');
  const respSub = grouped(act.filter((p) => p.st === '수정 중' || p.st === '재투고'), (p) => p.stEn)
    .map(([k, n]) => `${k} ${n}`).join(' · ');
  const rejectSub = act.filter((p) => p.st === '거절').map((p) => `${p.jr} (${p.stu})`).join(' · ');
  const archSub = grouped(arch, (p) => p.stEn).map(([k, n]) => `${k} ${n}`).join(' · ');
  const tiles = [
    { v: act.length, k: '투고 중인 연구', x: `투고 ${cnt('투고 완료')} · 심사 ${cnt('심사 중')} · 수정 ${cnt('수정 중')} · 재투고 ${cnt('재투고')} · 거절 ${cnt('거절')}` },
    { v: cnt('심사 중'), k: '심사 중', x: reviewJournals },
    { v: cnt('수정 중') + cnt('재투고'), k: '수정·재투고 대응', x: respSub },
    { v: cnt('거절'), k: '거절 — 재투고 검토', x: rejectSub },
    { v: arch.length, k: '아카이브 (게재)', x: archSub },
  ];
  return tiles
    .map((t) => `<div class="card kpi"><div class="v num">${t.v}</div><div class="k">${esc(t.k)}</div><div class="x">${esc(t.x)}</div></div>`)
    .join('\n');
}

export function renderChips(papers: Paper[], s: FilterState = DEFAULT_FILTER): string {
  const authors = ['전체', ...new Set(papers.map((p) => p.stu))];
  const tiers = ['전체', 'KCI', 'SCI급'];
  const derived = [...new Set(papers.map((p) => p.sub?.slice(0, 4)).filter((y): y is string => !!y))].sort();
  const years = ['전체', ...(derived.length ? derived : ['2025', '2026', '2027'])];
  const chip = (attr: string, v: string, on: boolean, label = v) =>
    `<button type="button" class="fc${on ? ' on' : ''}" ${attr}="${esc(v)}">${esc(label)}</button>`;
  const gap = '<span class="inline-block w-2.5" aria-hidden="true"></span>';
  return [
    ...authors.map((n) => chip('data-f', n, n === s.f)),
    gap,
    ...tiers.map((n) => chip('data-t', n, n === s.t)),
    gap,
    ...years.map((n) => chip('data-y', n, n === s.y, n === '전체' ? '전체 연도' : `${n}년`)),
  ].join('\n');
}

export function summary(papers: Paper[]): { act: number; arch: number } {
  const arch = papers.filter(isArchived).length;
  return { act: papers.length - arch, arch };
}
