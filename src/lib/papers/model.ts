// 투고 논문 도메인 규칙 (설계 문서 §5·§6-1).
// 브라우저(낙관적 반영)·Netlify 함수(서버 적용)·scripts/papers-sync.mjs(검증)가 이 한 파일을 함께 쓴다.
// 의존성 없음. Node 24가 TS를 그대로 실행(type stripping)하므로 지울 수 있는 문법만 쓴다:
// enum·namespace·parameter property 금지, 타입만 가져올 때는 `import type`, 상대 import는 `.ts` 확장자 명시.

export const STATUSES = ['투고 완료', '심사 중', '수정 중', '재투고', '거절', '게재확정', '게재'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_EN = {
  '투고 완료': 'Submitted',
  '심사 중': 'Under Review',
  '수정 중': 'Under Revision',
  '재투고': 'Resubmitted',
  '거절': 'Rejected',
  '게재확정': 'Accepted',
  '게재': 'Published',
} as const;
export type StatusEn = (typeof STATUS_EN)[Status];

export const KANBAN_STATUSES: readonly Status[] = ['투고 완료', '심사 중', '수정 중', '재투고', '거절'];
export const ARCHIVE_STATUSES: readonly Status[] = ['게재확정', '게재'];

export const TIERS = ['SCIE', 'SSCI', 'KCI', 'und'] as const;
export type Tier = (typeof TIERS)[number];

export interface Paper {
  id: string;
  kind: '실제';
  stu: string;
  t: string;
  tier: Tier;
  jr: string;
  st: Status;
  stEn: StatusEn;
  fund?: string | null;
  sub?: string;
  pub?: string;
  note?: string | null;
}

export interface PapersDoc {
  v: 1;
  rev: number;
  updatedAt: string;
  papers: Paper[];
}

/** 정렬 그룹: 칸반 열은 상태 자체, 게재확정·게재는 합쳐서 'archive'. */
export function groupOf(st: Status): string {
  return ARCHIVE_STATUSES.includes(st) ? 'archive' : st;
}
export const isArchived = (p: Paper): boolean => groupOf(p.st) === 'archive';
export const isStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
export const isTier = (v: unknown): v is Tier => typeof v === 'string' && (TIERS as readonly string[]).includes(v);
/** KPI·화면 집계용: 게재확정도 '게재' 단계로 본다. */
export const stageOf = (p: Paper): string => (p.st === '게재확정' ? '게재' : p.st);

export const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
export const LIMITS = { t: 300, stu: 40, jr: 120, fund: 40, note: 2000 } as const;

export interface PaperFields {
  t?: string;
  stu?: string;
  jr?: string;
  tier?: Tier;
  /** null = 필드 제거 */
  fund?: string | null;
  /** null = 필드 제거 */
  sub?: string | null;
  /** null = 필드 제거 */
  pub?: string | null;
  st?: Status;
}
export const EDITABLE_KEYS = ['t', 'stu', 'jr', 'tier', 'fund', 'sub', 'pub', 'st'] as const;

export type Ok<T> = { ok: true } & T;
export type Fail = { ok: false; error: string };
type TextResult = Ok<{ value: string | null }> | Fail;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(v: unknown, label: string, max: number, required: boolean): TextResult {
  if (v === undefined || v === null) return required ? { ok: false, error: `${label}을(를) 입력하세요` } : { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error: `${label}은(는) 문자열이어야 합니다` };
  const s = v.trim();
  if (!s) return required ? { ok: false, error: `${label}을(를) 입력하세요` } : { ok: true, value: null };
  if (s.length > max) return { ok: false, error: `${label}은(는) ${max}자 이하여야 합니다` };
  return { ok: true, value: s };
}

function ym(v: unknown, label: string): TextResult {
  const r = text(v, label, 7, false);
  if (!r.ok) return r;
  if (r.value !== null && !YM.test(r.value)) return { ok: false, error: `${label}은(는) YYYY-MM 형식이어야 합니다` };
  return r;
}

/**
 * 편집 입력을 정규화한다. partial=true(update)면 온 필드만 검사하고, false(add)면 제목·주저자·저널이 필수다.
 * 반환 fields의 null은 "필드 제거"를 뜻한다(fund·sub·pub만 해당).
 */
export function normalizeFields(input: unknown, opts: { partial: boolean }): Ok<{ fields: PaperFields }> | Fail {
  if (!isObj(input)) return { ok: false, error: '필드 객체가 필요합니다' };
  for (const k of Object.keys(input)) {
    if (!(EDITABLE_KEYS as readonly string[]).includes(k)) return { ok: false, error: `허용되지 않는 필드: ${k}` };
  }
  const out: PaperFields = {};
  const req = !opts.partial;
  const has = (k: string) => k in input;
  if (req || has('t')) { const r = text(input.t, '제목', LIMITS.t, true); if (!r.ok) return r; out.t = r.value!; }
  if (req || has('stu')) { const r = text(input.stu, '주저자', LIMITS.stu, true); if (!r.ok) return r; out.stu = r.value!; }
  if (req || has('jr')) { const r = text(input.jr, '저널', LIMITS.jr, true); if (!r.ok) return r; out.jr = r.value!; }
  if (has('tier')) { if (!isTier(input.tier)) return { ok: false, error: '등급 값이 올바르지 않습니다' }; out.tier = input.tier; }
  if (has('fund')) { const r = text(input.fund, '사사', LIMITS.fund, false); if (!r.ok) return r; out.fund = r.value; }
  if (has('sub')) { const r = ym(input.sub, '투고 연월'); if (!r.ok) return r; out.sub = r.value; }
  if (has('pub')) { const r = ym(input.pub, '게재 연월'); if (!r.ok) return r; out.pub = r.value; }
  if (has('st')) { if (!isStatus(input.st)) return { ok: false, error: '상태 값이 올바르지 않습니다' }; out.st = input.st; }
  return { ok: true, fields: out };
}

/** 메모 정규화: 줄바꿈 통일, 양끝 공백 제거, 공백뿐이면 null(제거). */
export function normalizeNote(v: unknown): Ok<{ note: string | null }> | Fail {
  if (v === undefined || v === null) return { ok: true, note: null };
  if (typeof v !== 'string') return { ok: false, error: '메모는 문자열이어야 합니다' };
  const s = v.replace(/\r\n?/g, '\n').trim();
  if (s.length > LIMITS.note) return { ok: false, error: `메모는 ${LIMITS.note}자 이하여야 합니다` };
  return { ok: true, note: s || null };
}

/** 다음 빈 id: R·A 접두사의 숫자 최댓값 + 1 → R##(두 자리 이상). 아카이브해도 id는 바뀌지 않는다. */
export function nextId(papers: readonly Paper[]): string {
  let max = 0;
  for (const p of papers) {
    const m = /^[RA](\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R${String(max + 1).padStart(2, '0')}`;
}

/** 키 순서를 papers.json 관례(id kind stu t tier jr st stEn fund sub pub note)로 맞춘 사본. 빈 선택 필드는 뺀다. */
export function canonical(p: Paper): Paper {
  const out: Paper = { id: p.id, kind: '실제', stu: p.stu, t: p.t, tier: p.tier, jr: p.jr, st: p.st, stEn: STATUS_EN[p.st] };
  if (p.fund !== undefined && p.fund !== null && p.fund !== '') out.fund = p.fund;
  if (p.sub) out.sub = p.sub;
  if (p.pub) out.pub = p.pub;
  if (p.note) out.note = p.note;
  return out;
}

/** 필드 적용: null은 제거. st가 오면 stEn도 함께 바뀐다. */
export function withFields(p: Paper, f: PaperFields): Paper {
  const n: Paper = { ...p };
  if (f.t !== undefined) n.t = f.t;
  if (f.stu !== undefined) n.stu = f.stu;
  if (f.jr !== undefined) n.jr = f.jr;
  if (f.tier !== undefined) n.tier = f.tier;
  if (f.fund !== undefined) { if (f.fund === null) delete n.fund; else n.fund = f.fund; }
  if (f.sub !== undefined) { if (f.sub === null) delete n.sub; else n.sub = f.sub; }
  if (f.pub !== undefined) { if (f.pub === null) delete n.pub; else n.pub = f.pub; }
  if (f.st !== undefined) { n.st = f.st; n.stEn = STATUS_EN[f.st]; }
  return canonical(n);
}

/** 배열 전체 검증(교체·동기화·씨앗용). 성공 시 정본 키 순서로 정규화된 사본을 돌려준다. jr·tier는 옛 데이터 관용(빈 값·미정 허용). */
export function validatePapers(input: unknown): Ok<{ papers: Paper[] }> | Fail {
  if (!Array.isArray(input)) return { ok: false, error: 'papers는 배열이어야 합니다' };
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw: unknown = input[i];
    const at = `papers[${i}]`;
    if (!isObj(raw)) return { ok: false, error: `${at}: 객체가 아닙니다` };
    if (typeof raw.id !== 'string' || !raw.id.trim()) return { ok: false, error: `${at}: id가 없습니다` };
    const id = raw.id.trim();
    if (seen.has(id)) return { ok: false, error: `${at}: id 중복 ${id}` };
    seen.add(id);
    if (raw.kind !== undefined && raw.kind !== '실제') return { ok: false, error: `${at}: kind는 '실제'여야 합니다` };
    if (!isStatus(raw.st)) return { ok: false, error: `${at}: 상태 값이 올바르지 않습니다 (${String(raw.st)})` };
    const t = text(raw.t, '제목', LIMITS.t, true); if (!t.ok) return { ok: false, error: `${at}: ${t.error}` };
    const stu = text(raw.stu, '주저자', LIMITS.stu, true); if (!stu.ok) return { ok: false, error: `${at}: ${stu.error}` };
    const jr = text(raw.jr, '저널', LIMITS.jr, false); if (!jr.ok) return { ok: false, error: `${at}: ${jr.error}` };
    const fund = text(raw.fund, '사사', LIMITS.fund, false); if (!fund.ok) return { ok: false, error: `${at}: ${fund.error}` };
    const sub = ym(raw.sub, '투고 연월'); if (!sub.ok) return { ok: false, error: `${at}: ${sub.error}` };
    const pub = ym(raw.pub, '게재 연월'); if (!pub.ok) return { ok: false, error: `${at}: ${pub.error}` };
    const note = normalizeNote(raw.note); if (!note.ok) return { ok: false, error: `${at}: ${note.error}` };
    out.push(canonical({
      id, kind: '실제', stu: stu.value!, t: t.value!, tier: isTier(raw.tier) ? raw.tier : 'und', jr: jr.value ?? '',
      st: raw.st, stEn: STATUS_EN[raw.st], fund: fund.value, sub: sub.value ?? undefined, pub: pub.value ?? undefined, note: note.note,
    }));
  }
  return { ok: true, papers: out };
}

/** 그룹 안 index 위치에 삽입. papers에는 moved가 없어야 한다. index 생략·범위 밖 → 그룹 끝(그룹이 비었으면 배열 끝). */
export function placeInGroup(papers: readonly Paper[], moved: Paper, index?: number): Paper[] {
  const g = groupOf(moved.st);
  const members: number[] = [];
  papers.forEach((p, i) => { if (groupOf(p.st) === g) members.push(i); });
  let at: number;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= members.length) {
    at = members.length ? members[members.length - 1] + 1 : papers.length;
  } else {
    at = members[index];
  }
  return [...papers.slice(0, at), moved, ...papers.slice(at)];
}

export type ApplyResult = Ok<{ doc: PapersDoc }> | { ok: false; status: 400 | 404; error: string };
const bad = (error: string): ApplyResult => ({ ok: false, status: 400, error });
const notFound = (id: unknown): ApplyResult => ({ ok: false, status: 404, error: `해당 논문이 없습니다: ${String(id)}` });

/** 작업 하나를 적용한 새 문서를 돌려준다(입력 불변). raw는 네트워크에서 온 값이므로 여기서 모양까지 검사한다. */
export function applyOp(doc: PapersDoc, raw: unknown, now: string): ApplyResult {
  if (!isObj(raw) || typeof raw.op !== 'string') return bad('op가 필요합니다');
  const done = (papers: Paper[]): ApplyResult => ({ ok: true, doc: { v: 1, rev: doc.rev + 1, updatedAt: now, papers } });
  const find = (id: unknown): number => (typeof id === 'string' ? doc.papers.findIndex((p) => p.id === id) : -1);

  switch (raw.op) {
    case 'move': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      if (!isStatus(raw.st)) return bad('상태 값이 올바르지 않습니다');
      const index = raw.index === undefined || raw.index === null ? undefined : Number(raw.index);
      if (index !== undefined && !Number.isInteger(index)) return bad('index는 정수여야 합니다');
      const cur = doc.papers[i];
      const moved = canonical({ ...cur, st: raw.st, stEn: STATUS_EN[raw.st] });
      if (index === undefined && groupOf(cur.st) === groupOf(raw.st)) {
        const papers = doc.papers.slice();
        papers[i] = moved;
        return done(papers);
      }
      return done(placeInGroup(doc.papers.filter((_, k) => k !== i), moved, index));
    }
    case 'note': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      const n = normalizeNote(raw.note);
      if (!n.ok) return bad(n.error);
      const papers = doc.papers.slice();
      papers[i] = canonical({ ...papers[i], note: n.note });
      return done(papers);
    }
    case 'update': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      const f = normalizeFields(raw.fields, { partial: true });
      if (!f.ok) return bad(f.error);
      const cur = doc.papers[i];
      const next = withFields(cur, f.fields);
      if (f.fields.st !== undefined && groupOf(cur.st) !== groupOf(f.fields.st)) {
        return done(placeInGroup(doc.papers.filter((_, k) => k !== i), next));
      }
      const papers = doc.papers.slice();
      papers[i] = next;
      return done(papers);
    }
    case 'add': {
      const f = normalizeFields(raw.paper, { partial: false });
      if (!f.ok) return bad(f.error);
      const st = f.fields.st ?? '투고 완료';
      const base: Paper = {
        id: nextId(doc.papers), kind: '실제', stu: f.fields.stu!, t: f.fields.t!, tier: f.fields.tier ?? 'und', jr: f.fields.jr!,
        st, stEn: STATUS_EN[st],
      };
      return done([...doc.papers, withFields(base, { fund: f.fields.fund, sub: f.fields.sub, pub: f.fields.pub })]);
    }
    case 'delete': {
      const i = find(raw.id);
      if (i < 0) return notFound(raw.id);
      return done(doc.papers.filter((_, k) => k !== i));
    }
    case 'replace': {
      const v = validatePapers(raw.papers);
      if (!v.ok) return bad(v.error);
      return done(v.papers);
    }
    default:
      return bad(`알 수 없는 op: ${raw.op}`);
  }
}

export function seedDoc(papers: Paper[], now: string): PapersDoc {
  return { v: 1, rev: 0, updatedAt: now, papers };
}
