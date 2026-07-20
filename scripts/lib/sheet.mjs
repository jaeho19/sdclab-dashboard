// exceljs 셀 접근 + 워크북 로딩 유틸. 병합 셀은 top-left만 값이 유효(§0).

import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

/**
 * 셀 원값 해석. Date는 Date 그대로(normDate가 처리), richText/formula/hyperlink는
 * 텍스트로 평탄화. 빈 셀 → null. 병합 구성 셀은 exceljs가 값을 복제하므로 top-left만 조회할 것.
 */
export function cellVal(ws, addr) {
  const v = ws.getCell(addr).value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.result !== undefined) return v.result; // 수식 결과
    if (v.text !== undefined) return v.text; // 하이퍼링크 등
    return null;
  }
  return v; // string | number | boolean
}

/** 텍스트 셀 조회(trim). Date/number도 문자열화. */
export function cellStr(ws, addr) {
  const v = cellVal(ws, addr);
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** URL에서 xlsx 바이트를 받아 임시 파일에 쓰고 exceljs로 읽는다(명세: fetch→temp→readFile). */
export async function loadWorkbookFromUrl(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`시트 fetch 실패(네트워크): ${url} — ${err.message}`);
  }
  if (!res.ok) throw new Error(`시트 fetch 실패 status=${res.status}: ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const tmp = join(tmpdir(), `sdclab-sheet-${randomUUID()}.xlsx`);
  await writeFile(tmp, bytes);
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    return wb;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/** 로컬 파일에서 워크북을 읽는다(트래커 폴백). */
export async function loadWorkbookFromFile(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb;
}
