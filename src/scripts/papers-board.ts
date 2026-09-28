// /papers 클라이언트 컨트롤러 (설계 문서 §8). 정적 빌드 위에 얹는 점진적 향상:
//  1) 필터 칩  2) /api/papers 라이브 로드·마지막 수정 표시·오프라인 안내  3) 편집 스위치
//  4) 드래그 이동·카드 메뉴  5) 메모 자동 저장  6) 수정/새 논문 대화상자  7) 토스트·PIN 여지
// 이벤트는 컨테이너에 위임한다 → 다시 그려도 재바인딩 불필요. 렌더 템플릿은 src/lib/papers/view.ts(빌드와 동일).
import type { Paper, PapersDoc } from '../lib/papers/model.ts';
import { renderArchive, renderChips, renderKanban, renderKpis, summary } from '../lib/papers/view.ts';
import type { FilterState } from '../lib/papers/view.ts';
import { apiUrlFor, fmtUpdated } from '../lib/papers/client.ts';

type ApiDoc = { ok: true; source: 'blob' | 'seed'; rev: number; updatedAt: string; papers: Paper[] };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const els = {
  kpis: $('#kpis'),
  filters: $('#pfilters'),
  kanban: $('#kanban'),
  archive: $('#archive'),
  archiveBox: $('#archive-box'),
  archCount: $('#arch-count'),
  actCount: $('#act-count'),
  archTotal: $('#arch-total'),
  updated: $('#papers-updated'),
  banner: $('#papers-banner'),
  editBtn: $<HTMLButtonElement>('#edit-toggle'),
  newBtn: $<HTMLButtonElement>('#new-paper'),
  toast: $('#toast'),
  dialog: $<HTMLDialogElement>('#paper-dialog'),
  pinDialog: $<HTMLDialogElement>('#pin-dialog'),
};

// ── 상태 ──────────────────────────────────────────────
const API = apiUrlFor(location.hostname);
let doc: PapersDoc = readSeed();
let source: 'seed' | 'blob' = 'seed';
let live = false; // API에서 문서를 받았는가
let editing = false; // 편집 모드
let saving = 0; // 진행 중인 쓰기 수
const filter: FilterState = { f: '전체', t: '전체', y: '전체' };

function readSeed(): PapersDoc {
  const el = document.getElementById('papers-seed');
  const papers = el ? (JSON.parse(el.textContent || '[]') as Paper[]) : [];
  return { v: 1, rev: 0, updatedAt: '', papers };
}

// ── 렌더·필터 ─────────────────────────────────────────
function render(): void {
  if (!els.kpis || !els.filters || !els.kanban || !els.archive) return;
  const o = { editing };
  if (!doc.papers.some((p) => p.stu === filter.f)) filter.f = '전체'; // 삭제된 주저자 필터 해제
  els.kpis.innerHTML = renderKpis(doc.papers);
  els.filters.innerHTML = renderChips(doc.papers, filter);
  els.kanban.innerHTML = renderKanban(doc.papers, o);
  els.archive.innerHTML = renderArchive(doc.papers, o);
  const s = summary(doc.papers);
  if (els.actCount) els.actCount.textContent = String(s.act);
  if (els.archTotal) els.archTotal.textContent = String(s.arch);
  applyFilter();
}

// 기존 인라인 필터(spec §4.4) 이관 — 보이기/숨기기만 하고 다시 그리지 않는다.
function matches(el: HTMLElement): boolean {
  const stu = el.dataset.stu ?? '';
  const tier = el.dataset.tier ?? '';
  const year = el.dataset.year ?? '';
  const okAuthor = filter.f === '전체' || stu === filter.f;
  const okTier = filter.t === '전체' || (filter.t === 'KCI' ? tier === 'KCI' : tier !== 'KCI');
  const okYear = filter.y === '전체' || !year || year === filter.y;
  return okAuthor && okTier && okYear;
}

function applyFilter(): void {
  document.querySelectorAll<HTMLElement>('.pcard[data-id]').forEach((el) => {
    el.hidden = !matches(el);
  });
  document.querySelectorAll<HTMLElement>('.kcol').forEach((col) => {
    const visible = col.querySelectorAll('.pcard[data-id]:not([hidden])').length;
    const n = col.querySelector('h4 .n');
    if (n) n.textContent = String(visible);
    const empty = col.querySelector<HTMLElement>('.kempty');
    if (empty) empty.hidden = visible > 0;
  });
  let archVisible = 0;
  document.querySelectorAll<HTMLElement>('.reqrow[data-id]').forEach((el) => {
    const ok = matches(el);
    el.hidden = !ok;
    if (ok) archVisible += 1;
  });
  if (els.archCount) els.archCount.textContent = `— ${archVisible}건`;
  const archEmpty = document.getElementById('arch-empty');
  if (archEmpty) archEmpty.hidden = archVisible > 0;
}

els.filters?.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('.fc');
  if (!btn || !els.filters) return;
  const ds = btn.dataset;
  const group: keyof FilterState = ds.f !== undefined ? 'f' : ds.t !== undefined ? 't' : 'y';
  filter[group] = ds[group] ?? '전체';
  els.filters.querySelectorAll(`[data-${group}]`).forEach((b) => b.classList.remove('on'));
  btn.classList.add('on');
  applyFilter();
});

// ── 라이브 로드 ───────────────────────────────────────
function setBanner(msg: string | null): void {
  if (!els.banner) return;
  els.banner.hidden = !msg;
  els.banner.textContent = msg ?? '';
}

function showUpdated(): void {
  if (!els.updated) return;
  if (!live) els.updated.textContent = '빌드 시점 데이터';
  else if (source === 'seed') els.updated.textContent = '실시간 · 아직 웹 편집 없음';
  else els.updated.textContent = `마지막 수정 ${fmtUpdated(doc.updatedAt)} · 실시간`;
}

async function fetchDoc(): Promise<ApiDoc> {
  const r = await fetch(API, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as ApiDoc;
  if (!d.ok || !Array.isArray(d.papers)) throw new Error('응답 형식 오류');
  return d;
}

function adopt(d: ApiDoc): void {
  doc = { v: 1, rev: d.rev, updatedAt: d.updatedAt, papers: d.papers };
  source = d.source;
}

async function load(): Promise<void> {
  try {
    adopt(await fetchDoc());
    live = true;
    setBanner(null);
    if (els.editBtn) els.editBtn.disabled = false;
    render();
    showUpdated();
  } catch (err) {
    live = false;
    setBanner('실시간 데이터를 불러오지 못해 빌드 시점 상태를 표시합니다. 편집은 잠시 사용할 수 없습니다.');
    if (els.editBtn) els.editBtn.disabled = true;
    showUpdated();
    console.warn('[papers] live load failed:', err);
  }
}

// 다른 탭·기기에서 바꾼 내용 반영: 탭이 다시 보일 때, 입력 중이 아니고 저장 중이 아닐 때만.
async function refresh(): Promise<void> {
  if (!live || saving > 0 || els.dialog?.open) return;
  if (document.activeElement?.matches('textarea.memo, input, select')) return;
  try {
    const d = await fetchDoc();
    if (d.rev !== doc.rev) {
      adopt(d);
      render();
      showUpdated();
    }
  } catch {
    /* 조용히 무시 — 다음 기회에 */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});

// ── 부팅 ─────────────────────────────────────────────
void load();
