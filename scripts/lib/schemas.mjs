// Zod 스키마 — 매핑 명세 §9. 전부 permissive: 타입·enum은 검증하되 선택 데이터
// 누락으로 reject 금지. 빈값은 nullable/optional 통과, 데이터 날조 금지.

import { z } from 'zod';

const isoOrPartial = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/); // YYYY | YYYY-MM | YYYY-MM-DD
const dateField = z.union([isoOrPartial, z.string()]).nullable(); // 파싱 실패 원문·자유텍스트 허용

// ── students.json ──
export const ReqSchema = z.object({
  c: z.enum(['이수학점', '어학', '종합시험', '논문자격', '예비심사', '본심사', '최종제출']),
  std: z.string().default(''),
  now: z.string().default(''),
  st: z.enum(['완료', '진행', '미착수']).catch('미착수'),
});

export const SchedSchema = z.object({
  t: z.enum(['R', 'C', 'J', 'D']).catch('R'),
  n: z.string(),
  s: dateField,
  e: dateField,
  fix: z.string().optional(),
  warn: z.string().optional(),
});

export const StudentSchema = z.object({
  name: z.string(),
  slug: z.string(),
  deg: z.enum(['박사', '석사']),
  entry: z.string().regex(/^\d{4}-[12]$/),
  goal: z.string(),
  goalDate: isoOrPartial,
  remain: z.number().int().nullable().optional(),
  elapsed: z.number().int().nullable().optional(),
  career: z.string().nullable(),
  careerNeed: z.string().nullable(),
  gapTxt: z.string().nullable(),
  kw: z.string().nullable(),
  rq: z.array(z.string()).nullable(),
  gap: z.string().nullable(),
  methods: z.array(z.string()).default([]),
  datas: z.array(z.string()).default([]),
  reqs: z.array(ReqSchema).length(7),
  sched: z.array(SchedSchema).default([]),
  hasComments: z.boolean().default(false),
  profCount: z.number().int().default(0),
  replyCount: z.number().int().default(0),
});
export const StudentsSchema = z.array(StudentSchema).length(6);

// ── papers.json (R·A만) ──
export const PaperSchema = z.object({
  id: z.string().regex(/^[RA]\d{2}$/), // P## 는 이 파일에 없어야 함
  kind: z.literal('실제'),
  stu: z.string(),
  t: z.string(),
  tier: z.enum(['SCIE', 'SSCI', 'KCI', 'und']).catch('und'),
  jr: z.string().nullable(),
  st: z.enum(['투고 완료', '심사 중', '수정 중', '재투고', '거절', '게재확정', '게재']),
  stEn: z.enum(['Submitted', 'Under Review', 'Under Revision', 'Resubmitted', 'Rejected', 'Accepted', 'Published']),
});
export const PapersSchema = z.array(PaperSchema);

// ── conferences.json ──
export const ConfSchema = z
  .object({
    n: z.string(),
    when: z.string().default(''),
    abs: z.string().default(''),
    dl: isoOrPartial.optional(),
    tbd: z.boolean().optional(),
    who: z.array(z.string()).default([]),
    items: z.array(z.string()).default([]),
  })
  .refine((c) => !(c.dl && c.tbd), { message: 'dl과 tbd는 상호배타' });
export const ConfsSchema = z.array(ConfSchema);

// ── comments.json (gitignore) ──
export const CommentsSchema = z.record(
  z.string(),
  z.object({ prof: z.array(z.string()).default([]), reply: z.array(z.string()).default([]) }),
);
