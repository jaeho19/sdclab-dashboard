// 빌드타임 시트 동기화 — 매핑 명세(docs/대시보드개편_구현계획서.md 및 mapping-spec) 구현.
// 두 워크북(졸업계획서 · 투고논문 트래커)을 읽어 content/dashboard/*.json 4종을 생성한다.
//
//   students.json / papers.json / conferences.json  → 커밋(공개)
//   comments.json (교수 코멘트·학생 답변)            → gitignore(프라이버시)
//
// 단, 투고논문 트래커 워크북이 없으면 papers.json은 생성하지 않고 그대로 둔다.
// 트래커가 소실된 뒤로 papers.json이 논문 데이터의 정본이며 직접 편집한다. (README 참고)
//
// 실행: node scripts/sync-sheet.mjs  (반드시 repo 루트에서 — exceljs 임포트 해석)

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadWorkbookFromFile, loadWorkbookFromUrl } from './lib/sheet.mjs';
import { STUDENT_ORDER } from './lib/maps.mjs';
import { buildConferences, parsePapers, parseStudent } from './lib/parse.mjs';
import { CommentsSchema, ConfsSchema, PapersSchema, StudentsSchema } from './lib/schemas.mjs';

const MAIN_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1WZ3qdFrrZmZ9pMMibT9GpD-CHVWTECt5U7uZOLOT7IQ/export?format=xlsx';
const PAPER_TAB = '06_투고논문';
const PAPER_FALLBACK = 'C:/Users/1/Downloads/06_투고논문_트래커.xlsx';
const CONF_TAB = '03_학회일정';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'dashboard');

async function main() {
  const today = new Date();
  const warnings = [];

  console.log('[sync] 메인 시트 fetch 중…');
  const wbMain = await loadWorkbookFromUrl(MAIN_SHEET_URL);

  const { paperWs, paperSource } = await resolvePaperSource(wbMain);
  const ws03 = requireWorksheet(wbMain, CONF_TAB);

  // 학생 6탭 → students / comments / 학회 참여행
  const students = [];
  const comments = {};
  const confRows = [];
  for (const name of STUDENT_ORDER) {
    const ws = requireWorksheet(wbMain, name);
    const { student, comment, confRows: rows } = parseStudent(ws, name, today, warnings);
    students.push(student);
    comments[student.slug] = { prof: comment.prof, reply: comment.reply };
    confRows.push(...rows);
  }

  // 트래커가 없으면(paperWs=null) papers.json은 읽지도 쓰지도 않는다 — 그 파일이 정본.
  const { papers, excludedP } = paperWs ? parsePapers(paperWs, warnings) : { papers: null, excludedP: 0 };
  const conferences = buildConferences(confRows, ws03);

  // 경계 검증 (permissive 스키마 — blank→null, 날조 금지)
  const validStudents = StudentsSchema.parse(students);
  const validPapers = papers ? PapersSchema.parse(papers) : null;
  const validConferences = ConfsSchema.parse(conferences);
  const validComments = CommentsSchema.parse(comments);

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    writeJson('students.json', validStudents),
    ...(validPapers ? [writeJson('papers.json', validPapers)] : []),
    writeJson('conferences.json', validConferences),
    writeJson('comments.json', validComments),
  ]);

  printSummary({ paperSource, students: validStudents, papers: validPapers, excludedP, conferences: validConferences, comments: validComments, warnings, generatedAt: today });
}

/**
 * 트래커: 메인 워크북의 06_투고논문 우선, 없으면 로컬 폴백 (명세 §0).
 *
 * 둘 다 없으면 throw 하지 않고 paperWs=null 을 돌려준다. 트래커 워크북이 사라진 뒤로
 * content/dashboard/papers.json 자체가 논문 데이터의 정본이므로, 동기화는 그 파일을
 * 건드리지 않고 학생·학회만 갱신해야 한다. (예전에는 여기서 예외를 던져 동기화 전체가
 * 중단됐고, 그 바람에 학생·학회 데이터까지 갱신할 수 없었다.)
 */
async function resolvePaperSource(wbMain) {
  const inMain = wbMain.getWorksheet(PAPER_TAB);
  if (inMain) return { paperWs: inMain, paperSource: `메인 시트 탭 '${PAPER_TAB}'` };
  console.warn(`[sync] 메인 시트에 '${PAPER_TAB}' 탭 없음 → 로컬 폴백 확인: ${PAPER_FALLBACK}`);
  let wbFallback;
  try {
    wbFallback = await loadWorkbookFromFile(PAPER_FALLBACK);
  } catch (err) {
    if (err.code !== 'ENOENT' && !/not found|no such file/i.test(err.message)) throw err;
    console.warn('[sync] 폴백 트래커도 없음 → papers.json은 손대지 않고 학생·학회만 동기화');
    return { paperWs: null, paperSource: '없음 — papers.json을 정본으로 유지' };
  }
  const ws = wbFallback.getWorksheet(PAPER_TAB);
  if (!ws) throw new Error(`폴백 파일에도 '${PAPER_TAB}' 탭 없음: ${PAPER_FALLBACK}`);
  return { paperWs: ws, paperSource: `로컬 폴백 '${PAPER_FALLBACK}' 탭 '${PAPER_TAB}'` };
}

function requireWorksheet(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`워크시트 없음: '${name}'`);
  return ws;
}

async function writeJson(file, data) {
  await writeFile(join(OUT_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function printSummary({ paperSource, students, papers, excludedP, conferences, comments, warnings, generatedAt }) {
  const replyKeys = Object.entries(comments).filter(([, c]) => c.reply.length > 0).map(([k]) => k);
  const paperLine = papers
    ? `${papers.length}건 (R##=${papers.filter((p) => p.id.startsWith('R')).length}, ` +
      `A##=${papers.filter((p) => p.id.startsWith('A')).length}) · P##=${excludedP}건 제외`
    : '건드리지 않음 — 트래커 없음, 이 파일이 정본';

  console.log('\n===== SYNC 요약 =====');
  console.log(`생성 시각      : ${generatedAt.toISOString()}`);
  console.log(`트래커 소스     : ${paperSource}`);
  console.log(`students.json  : ${students.length}명`);
  console.log(`papers.json    : ${paperLine}`);
  console.log(`conferences.json: ${conferences.length}건 — ${conferences.map((c) => c.n).join(', ')}`);
  console.log(`comments.json  : ${Object.keys(comments).length}키 (reply 있음: ${replyKeys.join(', ') || '없음'})`);
  console.log(`경고           : ${warnings.length}건`);
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  console.log('=====================');
}

main().catch((err) => {
  console.error('[sync] 실패:', err.message);
  process.exitCode = 1;
});
