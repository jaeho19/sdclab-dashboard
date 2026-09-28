#!/usr/bin/env node
// 웹 편집 데이터(Netlify Blobs, /api/papers) ↔ content/dashboard/papers.json 동기화 (설계 문서 §11)
//
//   node scripts/papers-sync.mjs pull            서버 최신본 → papers.json (다를 때만 씀). 네트워크 실패는 경고 후 exit 0
//   node scripts/papers-sync.mjs pull --strict   실패 시 exit 1
//   node scripts/papers-sync.mjs push            papers.json → 서버 전체 교체 (복구용)
//   node scripts/papers-sync.mjs history         서버 스냅샷 목록(최근 30개)
//   node scripts/papers-sync.mjs restore <rev>   그 스냅샷으로 서버 교체
//   공통: --api <URL> (기본 프로덕션). 서버에 PAPERS_EDIT_PIN이 설정돼 있으면 같은 이름의 환경변수로 넘긴다.
//
// 이 PC처럼 TLS 가로채기가 있는 환경에서는 `node --use-system-ca scripts/papers-sync.mjs …`로 실행한다
// (package.json의 prebuild가 그렇게 호출한다). 프로덕션 정본은 서버이고 papers.json은 씨앗·백업이다.
import { readFile, writeFile } from 'node:fs/promises';
import { validatePapers } from '../src/lib/papers/model.ts';

const DEFAULT_API = 'https://sdclab-dashboard-156.netlify.app/api/papers';
const FILE = new URL('../content/dashboard/papers.json', import.meta.url);

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const API = opt('--api') ?? DEFAULT_API;
const strict = args.includes('--strict');
const headers = { 'content-type': 'application/json' };
if (process.env.PAPERS_EDIT_PIN) headers['x-papers-pin'] = process.env.PAPERS_EDIT_PIN;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-store' } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.ok) throw new Error(b.error || `HTTP ${r.status}`);
  return b;
}
async function post(op) {
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(op) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.ok) throw new Error(b.error || `HTTP ${r.status}`);
  return b;
}
const stringify = (papers) => JSON.stringify(papers, null, 2) + '\n';

async function pull() {
  let remote;
  try {
    remote = await getJson(API);
  } catch (err) {
    console.warn(`[papers-sync] API 접근 실패 — papers.json을 그대로 둡니다: ${err.message}`);
    process.exit(strict ? 1 : 0);
  }
  if (remote.source === 'seed') {
    console.log('[papers-sync] 서버에 웹 편집 데이터 없음(씨앗 상태) — 변경 없음');
    return;
  }
  const v = validatePapers(remote.papers);
  if (!v.ok) {
    console.error(`[papers-sync] 서버 데이터 검증 실패: ${v.error}`);
    process.exit(1);
  }
  const next = stringify(v.papers);
  const cur = await readFile(FILE, 'utf8').catch(() => '');
  if (cur === next) {
    console.log(`[papers-sync] 변경 없음 (rev ${remote.rev}, ${v.papers.length}건)`);
    return;
  }
  await writeFile(FILE, next, 'utf8');
  console.log(`[papers-sync] papers.json 갱신: ${v.papers.length}건 (rev ${remote.rev}, ${remote.updatedAt})`);
}

async function push() {
  const local = JSON.parse(await readFile(FILE, 'utf8'));
  const v = validatePapers(local);
  if (!v.ok) throw new Error(`papers.json 검증 실패: ${v.error}`);
  const r = await post({ op: 'replace', papers: v.papers });
  console.log(`[papers-sync] 서버 교체 완료: ${r.papers.length}건 → rev ${r.rev}`);
}

async function history() {
  const r = await getJson(`${API}?history=1`);
  if (!r.snapshots.length) {
    console.log('스냅샷 없음');
    return;
  }
  for (const s of r.snapshots) console.log(`rev ${String(s.rev).padStart(5)}  ${s.updatedAt}  ${s.count}건`);
  console.log('복구: node scripts/papers-sync.mjs restore <rev>');
}

async function restore(rev) {
  if (!/^\d+$/.test(rev ?? '')) throw new Error('사용법: restore <rev>  (history로 번호 확인)');
  const snap = await getJson(`${API}?snap=${rev}`);
  const r = await post({ op: 'replace', papers: snap.papers });
  console.log(`[papers-sync] rev ${rev} 스냅샷으로 복구: ${r.papers.length}건 → rev ${r.rev}`);
}

const run = { pull, push, history, restore: () => restore(args[1]) }[cmd];
if (!run) {
  console.error('사용법: node scripts/papers-sync.mjs <pull|push|history|restore REV> [--api URL] [--strict]');
  process.exit(2);
}
run().catch((err) => {
  console.error(`[papers-sync] ${err.message}`);
  process.exit(1);
});
