/**
 * SDC Lab 대시보드 — 투고 논문 쓰기 백엔드 (Google Apps Script)
 * ------------------------------------------------------------------
 * 「학생 졸업계획서」 구글 시트에 컨테이너-바인딩으로 붙여 쓴다.
 * (시트 열기 → 확장 프로그램 > Apps Script → 이 코드 전체 붙여넣기)
 * '06_투고논문' 탭에서 논문ID로 행을 찾아 상태/날짜/텍스트 셀을 갱신한다.
 *
 * 배포: 배포 > 새 배포 > 유형=웹 앱 > 실행=나 / 액세스=링크가 있는 모든 사용자.
 * 자세한 절차는 같은 폴더의 DEPLOY.md 참고.
 */

// ── 1) 반드시 바꾸세요 ────────────────────────────────────────────
// 길고 무작위한 문자열로 교체(예: 32자 랜덤). 클라이언트 설정에도 같은 값을 넣습니다.
const SHARED_TOKEN = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

const SHEET_NAME = '06_투고논문';

// 시트에 기록 가능한 상태 화이트리스트(그 외 값은 거부)
const ALLOWED_STATUS = ['구상', '집필', '투고', '심사중', '수정요청', '재제출', '게재확정', '게재', '거절·재타깃', '보류'];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.token !== SHARED_TOKEN) return json({ ok: false, error: 'unauthorized' });

    const id = String(body.id || '').trim();
    if (!id) return json({ ok: false, error: 'missing id' });

    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sh) return json({ ok: false, error: 'sheet not found: ' + SHEET_NAME });

    const col = resolveCols(sh);                       // 헤더 이름으로 열 위치 해석(열 순서가 바뀌어도 안전)
    for (const k of ['id', 'status', 'statusDate']) {
      if (col[k] < 0) return json({ ok: false, error: 'header not found: ' + k });
    }

    const row = findRow(sh, col.id, id);
    if (row < 0) return json({ ok: false, error: 'id not found: ' + id });

    const op = body.op;
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (op === 'status') {
      const st = String(body.value || '').trim();
      if (ALLOWED_STATUS.indexOf(st) < 0) return json({ ok: false, error: 'bad status: ' + st });
      sh.getRange(row, col.status).setValue(st);
      sh.getRange(row, col.statusDate).setValue(today);   // 상태변경일 = 오늘 자동 기록 (§2-5)
      return json({ ok: true, id: id, op: op, status: st, statusDate: today });
    }

    if (op === 'month') {                                // 투고/게재 연월(YYYY-MM) 또는 빈값
      const c = body.field === '게재' ? col.publish : body.field === '투고' ? col.submit : -1;
      if (c < 0) return json({ ok: false, error: 'bad field: ' + body.field });
      sh.getRange(row, c).setValue(String(body.value || ''));
      return json({ ok: true, id: id, op: op, field: body.field, value: String(body.value || '') });
    }

    if (op === 'text') {                                 // 제목/저널명
      const c = body.field === '제목' ? col.title : body.field === '저널' ? col.journal : -1;
      if (c < 0) return json({ ok: false, error: 'bad field: ' + body.field });
      sh.getRange(row, c).setValue(String(body.value || ''));
      return json({ ok: true, id: id, op: op, field: body.field, value: String(body.value || '') });
    }

    return json({ ok: false, error: 'unknown op: ' + op });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// 브라우저에서 배포 URL을 열면 헬스체크가 보인다({"ok":true,...ping}).
function doGet() {
  return json({ ok: true, service: 'sdclab papers writer', ping: true });
}

// 헤더 행(1행) 이름으로 열 위치를 찾는다. 공백 제거 후 매칭.
function resolveCols(sh) {
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((x) => String(x).replace(/\s/g, ''));
  const find = (pred) => {
    for (let i = 0; i < hdr.length; i++) if (pred(hdr[i])) return i + 1;
    return -1;
  };
  return {
    id: find((h) => /논문ID|^ID$/.test(h)),
    title: find((h) => h.indexOf('제목') >= 0),
    journal: find((h) => h.indexOf('저널') >= 0 && h.indexOf('2') < 0), // 1지망(2지망 제외)
    status: find((h) => h === '상태'), // '상태변경일'과 구분하려 정확히 '상태'
    statusDate: find((h) => h.indexOf('변경') >= 0),
    submit: find((h) => h.indexOf('투고') >= 0 && h.indexOf('일') >= 0),
    publish: find((h) => h.indexOf('게재') >= 0 && h.indexOf('일') >= 0),
  };
}

function findRow(sh, idCol, id) {
  const ids = sh.getRange(1, idCol, sh.getLastRow(), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 1; // 1-based
  }
  return -1;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
