// 시트 → 목적지 JSON 파싱. 매핑 명세 §3~§8. 색이 아니라 텍스트 내용으로 판단(§0).

import { cellStr, cellVal } from './sheet.mjs';
import {
  DATA_LABELS,
  METHOD_LABELS,
  NAME_TO_SLUG,
  PAPER_STATUS,
  REQ_COLS,
  SCHED_CAT,
  TIER,
} from './maps.mjs';
import {
  computeElapsedRemain,
  flat,
  normDate,
  normEntry,
  parseGap,
  parseGoal,
  parseKw,
  parseRq,
  textOrNull,
} from './normalize.mjs';

const isChecked = (v) => String(v ?? '').includes('☑'); // ☑=선택, ☐=미선택 (§4.1)
const REQ_STATES = ['완료', '진행', '미착수'];

/** iso 문자열(YYYY-MM | YYYY-MM-DD)을 비교용 일자로 확장. */
function toDay(iso) {
  if (!iso) return null;
  return Date.parse(iso.length === 7 ? `${iso}-01` : iso);
}

// ── 학생 탭 ──────────────────────────────────────────────

/** 학생 1명 파싱. { student, comment, confRows } 반환. warnings 배열에 이슈 push. */
export function parseStudent(ws, name, today, warnings) {
  const slug = NAME_TO_SLUG[name];
  const entry = normEntry(cellStr(ws, 'C7'));
  const { goal, goalDate } = parseGoal(cellStr(ws, 'C8'));
  const { elapsed, remain } = computeElapsedRemain(entry, goalDate, today);
  const comment = parseComment(ws);
  const { sched, confRows } = parseSched(ws, name, slug, warnings);

  const student = {
    name: cellStr(ws, 'C5') || name,
    slug,
    deg: cellStr(ws, 'C6'),
    entry,
    goal,
    goalDate,
    remain,
    elapsed,
    career: textOrNull(cellStr(ws, 'C12')),
    careerNeed: textOrNull(cellStr(ws, 'C14')),
    gapTxt: textOrNull(cellStr(ws, 'C15')),
    kw: parseKw(cellStr(ws, 'C18')),
    rq: parseRq(cellStr(ws, 'C19')),
    gap: parseGap(cellStr(ws, 'C20')),
    methods: pickChecked(ws, 23, METHOD_LABELS),
    datas: pickDatas(ws),
    reqs: parseReqs(ws, name, warnings),
    sched,
    hasComments: comment.prof.length > 0 || comment.reply.length > 0,
    profCount: comment.prof.length,
    replyCount: comment.reply.length,
  };
  return { student, comment, confRows };
}

/** ☑ 체크된 행만 짧은 라벨 배열로 (methods: 시작행 23, datas: 31). */
function pickChecked(ws, startRow, labels) {
  return labels.filter((_, i) => isChecked(cellStr(ws, `B${startRow + i}`)));
}

/** datas + 기타(C37) 비공란 시 말미 append (§4.2). */
function pickDatas(ws) {
  const out = pickChecked(ws, 31, DATA_LABELS);
  const etc = flat(cellStr(ws, 'C37'));
  if (etc) out.push(etc);
  return out;
}

/** 요건 7행 파싱 (§3). std←C, now←D, st←E. 3값 외 → 미착수 폴백 + 경고. */
function parseReqs(ws, name, warnings) {
  return REQ_COLS.map((c, i) => {
    const row = 41 + i;
    let st = cellStr(ws, `E${row}`);
    if (!REQ_STATES.includes(st)) {
      warnings.push(`[req-state] ${name} ${c}: 예상 밖 완료여부 '${st}' → 미착수 폴백`);
      st = '미착수';
    }
    return { c, std: flat(cellStr(ws, `C${row}`)), now: flat(cellStr(ws, `D${row}`)), st };
  });
}

/** 일정 행 파싱 (§5.3). 경계=구분 소진 또는 간트 헤더 도달. */
function parseSched(ws, name, slug, warnings) {
  const sched = [];
  const confRows = [];
  for (let r = 52; r <= 110; r++) {
    const cat = cellStr(ws, `B${r}`);
    if (!cat) break; // 구분 소진
    if (/간트|작업\s*\/\s*마일스톤|분기\s*(시작|종료)/.test(cat)) break; // 간트 헤더
    const entry = buildSchedRow(ws, r, cat, name, slug, warnings);
    sched.push(entry.emit);
    if (entry.emit.t === 'C') {
      confRows.push({ name, venueRaw: entry.target, title: entry.title, startIso: entry.emit.s, endIso: entry.emit.e });
    }
  }
  return { sched, confRows };
}

/** 한 일정 행 → { emit:{t,n,s,e,fix?,warn?}, target, title }. */
function buildSchedRow(ws, r, cat, name, slug, warnings) {
  let t = SCHED_CAT[cat];
  if (!t) {
    warnings.push(`[sched-cat] ${name} row ${r}: 미지 구분 '${cat}' → R 폴백`);
    t = 'R';
  }
  const content = flat(cellStr(ws, `C${r}`));
  const title = flat(cellStr(ws, `E${r}`));
  const target = flat(cellStr(ws, `D${r}`)); // 대상: conferences 조인용, sched엔 emit 안 함
  const s = normDate(cellVal(ws, `F${r}`));
  const e = normDate(cellVal(ws, `G${r}`));
  const emit = { t, n: title ? `${content} — ${title}` : content, s: s.iso, e: e.iso };
  applyTypoFix(slug, emit, e, warnings, name);
  flagDateIssues(emit, name, warnings);
  return { emit, target, title };
}

/** 알려진 오타 보정: 최희진 저널투고 종료 '2026.02' → '2027-02' (§2.3). */
function applyTypoFix(slug, emit, e, warnings, name) {
  if (slug === 'heejin' && emit.t === 'J' && e.iso === '2026-02') {
    emit.e = '2027-02';
    emit.fix = "원본 '2026.02' → 2027-02 보정";
    warnings.push(`[typo-fix] ${name} 저널투고 종료 '${e.raw}' → 2027-02 (게재<투고 역전 보정)`);
  }
}

/** 역전·누락·장기구간 로깅 (§2.4). 드롭 금지 — warn 부착·로그만. */
function flagDateIssues(emit, name, warnings) {
  if (!emit.s || !emit.e) {
    warnings.push(`[missing-date] ${name}: "${emit.n}" s=${emit.s} e=${emit.e} → 간트 막대 스킵`);
    return;
  }
  const ds = toDay(emit.s);
  const de = toDay(emit.e);
  if (de < ds) {
    emit.warn = '종료<시작 — 원본 확인 필요';
    warnings.push(`[date-reversal] ${name}: "${emit.n}" ${emit.s} > ${emit.e}`);
  } else if (de - ds > 400 * 86400000) {
    warnings.push(`[long-span] ${name}: "${emit.n}" ${emit.s}~${emit.e} (~${Math.round((de - ds) / 2592000000)}개월, 종료 확인 권고)`);
  }
}

/** 교수 코멘트/학생 답변 파싱 (§7). B3(병합 B3:G3) 멀티라인. '- ' 시작=답변. */
export function parseComment(ws) {
  const raw = String(cellVal(ws, 'B3') ?? '').replace(/\r/g, '');
  const prof = [];
  const reply = [];
  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (/^📝\s*지도교수\s*코멘트/.test(line)) {
      const rest = line.replace(/^📝\s*지도교수\s*코멘트\s*[:：]?\s*/, '').trim();
      if (rest) prof.push(rest);
    } else if (/^-\s+/.test(line)) {
      reply.push(line.replace(/^-\s+/, '').trim());
    } else {
      prof.push(line);
    }
  }
  return { prof, reply };
}

// ── 투고논문 트래커 (06_투고논문) ────────────────────────

/** R##·A## 행만 papers[]로 (§6). P## 제외. 반환 { papers, excludedP }. */
export function parsePapers(ws, warnings) {
  const papers = [];
  let excludedP = 0;
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // 헤더
    const id = flat(cellStr(ws, `A${rowNum}`));
    if (/^P\d{2}$/.test(id)) {
      excludedP += 1; // 계획 행 — 3파일 스코프 밖(§6-D)
      return;
    }
    if (!/^[RA]\d{2}$/.test(id)) return; // R·A만 (빈행·기타 제외)
    papers.push(buildPaper(ws, rowNum, id, warnings));
  });
  return { papers, excludedP };
}

function buildPaper(ws, r, id, warnings) {
  const statusRaw = flat(cellStr(ws, `H${r}`));
  const status = PAPER_STATUS[statusRaw];
  if (!status) warnings.push(`[paper-status] ${id}: 미지 상태 '${statusRaw}'`);
  const tierRaw = flat(cellStr(ws, `E${r}`));
  const tier = TIER[tierRaw];
  if (!tier) warnings.push(`[paper-tier] ${id}: 미지 등급 '${tierRaw}' → und`);
  return {
    id,
    kind: '실제',
    stu: flat(cellStr(ws, `B${r}`)),
    t: flat(cellStr(ws, `D${r}`)),
    tier: tier ?? 'und',
    jr: textOrNull(cellStr(ws, `F${r}`)),
    st: status ? status.st : statusRaw,
    stEn: status ? status.stEn : 'Submitted',
  };
}

// ── conferences (03_학회일정 ⋈ 학생 학회 일정) ───────────

/** 학생 학회발표 행 + 03_학회일정 메타 조인 → conferences[] (§8). */
export function buildConferences(confRows, ws03) {
  const groups = new Map();
  for (const row of confRows) {
    const { base, n } = canonVenue(row.venueRaw, row.endIso);
    if (!groups.has(n)) groups.set(n, { n, base, who: [], items: [], startIso: null });
    const g = groups.get(n);
    if (!g.who.includes(row.name)) g.who.push(row.name);
    g.items.push(`${row.title || base} (${row.name})`);
    if (row.startIso && (!g.startIso || row.startIso < g.startIso)) g.startIso = row.startIso;
  }
  const confs = [...groups.values()].map((g) => finalizeConf(g, ws03));
  return confs.sort((a, b) => (a._start || '').localeCompare(b._start || '') || a.n.localeCompare(b.n)).map(stripInternal);
}

/** 대상(D) 자유텍스트 → { base, n(=base+연도) } 정규화 (§8 조인 키). */
function canonVenue(venueRaw, endIso) {
  const clean = flat(venueRaw).replace(/\(.*?\)/g, '').replace(/가능하다면|가능하면/g, '').trim();
  const year = endIso ? endIso.slice(0, 4) : null;
  let base;
  if (/AAG/i.test(clean)) base = 'AAG';
  else if (/CELA/i.test(clean)) base = 'CELA';
  else if (/농촌계획/.test(clean)) base = '농촌계획학회 추계';
  else if (/조경학회/.test(clean) && /도시설계/.test(clean)) base = '한국조경학회 · 도시설계학회 추계';
  else if (/조경학회/.test(clean)) base = '한국조경학회 추계';
  else base = clean.replace(/\s*\/\s*/g, ' · ') || '학회 미상';
  return { base, n: year ? `${base} ${year}` : base };
}

function finalizeConf(g, ws03) {
  const meta = confMeta(g.base, ws03, g.startIso);
  return { n: g.n, when: meta.when, abs: meta.abs, tbd: true, who: g.who, items: g.items, _start: g.startIso };
}

/** 03_학회일정에서 when·abs 조회. 매칭 없으면 sched 날짜로 유추(§8). 확정 마감 없음 → tbd. */
function confMeta(base, ws03, startIso) {
  const row = find03Row(base, ws03);
  if (row) {
    const when = flat(cellStr(ws03, `D${row}`));
    return { when: when ? `개최 ${when}` : inferWhen(startIso), abs: flat(cellStr(ws03, `E${row}`)) };
  }
  return { when: inferWhen(startIso), abs: '일정 미정 — 확정일 입력 필요' };
}

function find03Row(base, ws03) {
  for (let r = 4; r <= 13; r++) {
    const b = flat(cellStr(ws03, `B${r}`));
    if (!b) continue;
    if (base === 'AAG' && /AAG/i.test(b)) return r;
    if (base === 'CELA' && /CELA/i.test(b)) return r;
    if (base.includes('농촌계획') && b.includes('농촌계획') && b.includes('추계')) return r;
    if (base.includes('조경학회') && b.includes('조경학회') && b.includes('추계')) return r;
  }
  return null;
}

function inferWhen(startIso) {
  if (!startIso) return '';
  const m = Number(startIso.slice(5, 7));
  if (m >= 9 && m <= 11) return '개최 10~11월';
  if (m >= 2 && m <= 4) return '개최 3~4월';
  return '개최 시기 미정';
}

const stripInternal = ({ _start, ...conf }) => conf;
