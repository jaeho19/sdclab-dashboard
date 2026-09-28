import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrlFor, debounce, dropIndex, fmtUpdated } from './client.ts';

test('apiUrlFor: localhost·netlify.app은 상대 경로, 그 외(미러)는 프로덕션 절대 주소', () => {
  assert.equal(apiUrlFor('localhost'), '/api/papers');
  assert.equal(apiUrlFor('127.0.0.1'), '/api/papers');
  assert.equal(apiUrlFor('sdclab-dashboard-156.netlify.app'), '/api/papers');
  assert.equal(apiUrlFor('68d0--sdclab-dashboard-156.netlify.app'), '/api/papers', '초안 배포 URL도 상대 경로');
  assert.equal(apiUrlFor('jaeho19.github.io'), 'https://sdclab-dashboard-156.netlify.app/api/papers');
});

test('dropIndex: 다음 카드의 그룹 내 순번(드래그 카드 제외), 없으면 undefined', () => {
  const members = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
  assert.equal(dropIndex(members, 'D', 'A'), 0);
  assert.equal(dropIndex(members, 'A', 'C'), 1, 'A를 빼면 [B,C,D]에서 C는 1');
  assert.equal(dropIndex(members, 'B', 'B'), undefined, '자기 자신 앞은 위치 없음 → 끝');
  assert.equal(dropIndex(members, 'A', null), undefined);
  assert.equal(dropIndex(members, 'A', 'zz'), undefined);
});

test('fmtUpdated: KST YYYY-MM-DD HH:mm', () => {
  assert.equal(fmtUpdated('2026-09-28T05:02:00.000Z'), '2026-09-28 14:02');
  assert.equal(fmtUpdated('not a date'), '');
});

test('debounce: 마지막 호출만, cancel 가능', async () => {
  const calls: number[] = [];
  const d = debounce((n: number) => calls.push(n), 20);
  d(1); d(2); d(3);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, [3]);
  d(4); d.cancel();
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, [3]);
});
