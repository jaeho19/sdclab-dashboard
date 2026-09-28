// /papers 클라이언트 컨트롤러 (설계 문서 §8). 정적 빌드 위에 얹는 점진적 향상:
//  1) 필터 칩  2) /api/papers 라이브 로드·마지막 수정 표시·오프라인 안내  3) 편집 스위치
//  4) 드래그 이동·카드 메뉴  5) 메모 자동 저장  6) 수정/새 논문 대화상자  7) 토스트·PIN 여지
// 이벤트는 컨테이너에 위임한다 → 다시 그려도 재바인딩 불필요. 렌더 템플릿은 src/lib/papers/view.ts(빌드와 동일).
import type { Paper, PapersDoc, Status } from '../lib/papers/model.ts';
import { applyOp, groupOf, isArchived, KANBAN_STATUSES } from '../lib/papers/model.ts';
import { renderArchive, renderChips, renderKanban, renderKpis, summary } from '../lib/papers/view.ts';
import type { FilterState } from '../lib/papers/view.ts';
import { apiUrlFor, dropIndex, fmtUpdated } from '../lib/papers/client.ts';

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
const LS_EDIT = 'papers.edit'; // 편집 스위치 상태(브라우저별 기억)
const LS_PIN = 'papers.pin'; // PIN 여지(서버에 PAPERS_EDIT_PIN이 설정된 경우에만 쓰임)
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
    let wantEdit = false;
    try {
      wantEdit = localStorage.getItem(LS_EDIT) === '1';
    } catch {
      /* 저장소 접근 불가 → 열람 모드 */
    }
    setEditing(wantEdit); // 안에서 render()
    showUpdated();
  } catch (err) {
    live = false;
    setBanner('실시간 데이터를 불러오지 못해 빌드 시점 상태를 표시합니다. 편집은 잠시 사용할 수 없습니다.');
    if (els.editBtn) els.editBtn.disabled = true;
    editing = false;
    document.body.classList.remove('editing');
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

// ── 토스트 ────────────────────────────────────────────
let toastTimer = 0;
function toast(msg: string, kind: 'ok' | 'error' = 'ok'): void {
  const t = els.toast;
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), kind === 'error' ? 5000 : 1800);
}

// ── 편집 스위치 ───────────────────────────────────────
function setEditing(on: boolean): void {
  editing = on && live;
  document.body.classList.toggle('editing', editing);
  if (els.editBtn) {
    els.editBtn.setAttribute('aria-checked', String(editing));
    els.editBtn.textContent = editing ? '편집 중' : '편집';
  }
  if (els.newBtn) els.newBtn.hidden = !editing;
  try {
    localStorage.setItem(LS_EDIT, editing ? '1' : '0');
  } catch {
    /* 무시 */
  }
  render();
}
els.editBtn?.addEventListener('click', () => setEditing(!editing));

// ── 저장: 낙관적 반영 → POST → 실패 시 롤백 ─────────────
type Op = Record<string, unknown> & { op: string };
interface CommitOpts {
  busyId?: string; // 저장 중 반투명 처리할 카드
  rerender?: boolean; // false면 응답 후 다시 그리지 않음(메모 입력 중 포커스 보존)
  quiet?: boolean; // true면 성공 토스트 생략
}

function markSaving(id: string, on: boolean): void {
  document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`).forEach((el) => el.classList.toggle('saving', on));
}

function readPin(): string | null {
  try {
    return localStorage.getItem(LS_PIN);
  } catch {
    return null;
  }
}

async function post(op: Op): Promise<ApiDoc> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const pin = readPin();
  if (pin) headers['x-papers-pin'] = pin;
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(op) });
  const body = (await r.json().catch(() => ({}))) as Partial<ApiDoc> & { error?: string };
  if (!r.ok || !body.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body as ApiDoc;
}

async function commit(op: Op, o: CommitOpts = {}): Promise<boolean> {
  const prev = doc;
  const local = applyOp(doc, op, new Date().toISOString());
  if (!local.ok) {
    toast(local.error, 'error');
    return false;
  }
  doc = local.doc;
  if (o.rerender !== false) render();
  if (o.busyId) markSaving(o.busyId, true);
  saving += 1;
  try {
    adopt(await post(op));
    if (o.rerender !== false) render();
    showUpdated();
    if (!o.quiet) toast('저장됨');
    return true;
  } catch (err) {
    doc = prev;
    render();
    toast(`저장 실패: ${err instanceof Error ? err.message : String(err)}`, 'error');
    return false;
  } finally {
    saving -= 1;
    if (o.busyId) markSaving(o.busyId, false);
  }
}

// ── 드래그 이동 (HTML5 DnD, 편집 모드에서만) ────────────
let dragId: string | null = null;
const dropLine = document.createElement('div');
dropLine.className = 'drop-line';

document.addEventListener('dragstart', (e) => {
  const card = (e.target as Element | null)?.closest?.<HTMLElement>('[data-id][draggable="true"]');
  if (!card || !editing) return;
  dragId = card.dataset.id ?? null;
  e.dataTransfer?.setData('text/plain', dragId ?? ''); // Firefox는 setData 없이는 드래그를 시작하지 않는다
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
document.addEventListener('dragend', () => {
  dragId = null;
  dropLine.remove();
  document.querySelectorAll('.dragging, .drop-target').forEach((el) => el.classList.remove('dragging', 'drop-target'));
});

/** 열 안에서 포인터 아래에 올 첫 카드(보이는 것만, 드래그 중 카드 제외). 없으면 null = 열 끝. */
function nextCardAt(col: HTMLElement, y: number): HTMLElement | null {
  const cards = [...col.querySelectorAll<HTMLElement>('.pcard[data-id]:not([hidden]):not(.dragging)')];
  return (
    cards.find((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    }) ?? null
  );
}

els.kanban?.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const col = (e.target as Element).closest<HTMLElement>('.kcol');
  if (!col) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const next = nextCardAt(col, e.clientY);
  col.insertBefore(dropLine, next ?? col.querySelector('.kempty'));
});
els.kanban?.addEventListener('drop', (e) => {
  if (!dragId) return;
  const col = (e.target as Element).closest<HTMLElement>('.kcol');
  if (!col) return;
  e.preventDefault();
  const id = dragId;
  const st = col.dataset.stage as Status;
  const next = nextCardAt(col, e.clientY);
  // index = 놓는 자리 다음 카드의 그룹 내 순번(숨겨진 카드 포함, 드래그 카드 제외) — 서버 placeInGroup과 같은 셈법
  const members = doc.papers.filter((p) => groupOf(p.st) === groupOf(st));
  const index = dropIndex(members, id, next?.dataset.id ?? null);
  dropLine.remove();
  const op: Op = { op: 'move', id, st };
  if (index !== undefined) op.index = index;
  void commit(op, { busyId: id });
});

// 아카이브 박스에 놓으면 게재확정(Accepted). 이미 아카이브된 행은 대상이 아니다.
els.archiveBox?.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const p = doc.papers.find((x) => x.id === dragId);
  if (!p || isArchived(p)) return;
  e.preventDefault();
  els.archiveBox?.classList.add('drop-target');
});
els.archiveBox?.addEventListener('dragleave', (e) => {
  if (!els.archiveBox?.contains(e.relatedTarget as Node | null)) els.archiveBox?.classList.remove('drop-target');
});
els.archiveBox?.addEventListener('drop', (e) => {
  if (!dragId) return;
  const p = doc.papers.find((x) => x.id === dragId);
  if (!p || isArchived(p)) return;
  e.preventDefault();
  els.archiveBox?.classList.remove('drop-target');
  void commit({ op: 'move', id: p.id, st: '게재확정' }, { busyId: p.id });
});

// 카드 안의 입력 요소(메모·메뉴·select)를 조작하는 동안은 카드 드래그가 시작되지 않게 잠시 끈다.
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Element;
  if (!t.closest?.('textarea, input, select, button, .pmenu')) return;
  const card = t.closest<HTMLElement>('[data-id][draggable="true"]');
  if (card) {
    card.draggable = false;
    card.dataset.dragOff = '1';
  }
});
document.addEventListener('pointerup', () => {
  document.querySelectorAll<HTMLElement>('[data-drag-off]').forEach((el) => {
    el.draggable = true;
    delete el.dataset.dragOff;
  });
});

// ── 카드 메뉴(⋯): 터치·키보드용 이동 수단 + 아카이브·복원·게재 전환 ─────
let menuEl: HTMLElement | null = null;
function closeMenu(): void {
  menuEl?.remove();
  menuEl = null;
}

function openMenu(anchor: HTMLElement, id: string): void {
  closeMenu();
  const p = doc.papers.find((x) => x.id === id);
  if (!p) return;
  const archived = isArchived(p);
  const options = KANBAN_STATUSES.filter((s) => s !== p.st)
    .map((s) => `<option value="${s}">${s}</option>`)
    .join('');
  const m = document.createElement('div');
  m.className = 'pmenu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `
    <label class="pmenu-move">${archived ? '복원' : '이동'}
      <select data-act="move" aria-label="상태 선택"><option value="">상태 선택…</option>${options}</select>
    </label>
    ${
      archived
        ? `<button type="button" role="menuitem" data-act="toggle-pub">${p.st === '게재확정' ? '게재(Published)로 표시' : '게재확정(Accepted)으로 되돌리기'}</button>`
        : `<button type="button" role="menuitem" data-act="archive">아카이브로 (게재확정)</button>`
    }`;
  m.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button[data-act]');
    if (b) act(b.dataset.act ?? '', id);
  });
  m.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    if (sel.dataset.act === 'move' && sel.value) {
      closeMenu();
      void commit({ op: 'move', id, st: sel.value }, { busyId: id });
    }
  });
  anchor.closest<HTMLElement>('[data-id]')?.appendChild(m);
  menuEl = m;
}

function act(kind: string, id: string): void {
  closeMenu();
  const p = doc.papers.find((x) => x.id === id);
  if (!p) return;
  if (kind === 'archive') void commit({ op: 'move', id, st: '게재확정' }, { busyId: id });
  else if (kind === 'toggle-pub') void commit({ op: 'move', id, st: p.st === '게재확정' ? '게재' : '게재확정' }, { busyId: id });
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('.pmenu-btn');
  if (btn) {
    e.preventDefault();
    openMenu(btn, btn.dataset.menu ?? '');
    return;
  }
  if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

// ── 부팅 ─────────────────────────────────────────────
void load();
