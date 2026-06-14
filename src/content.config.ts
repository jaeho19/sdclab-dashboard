import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// YAML이 '2026-03-13' 같은 완전한 날짜를 Date 객체로 자동 변환하므로,
// Date면 'YYYY-MM-DD' 문자열로 되돌려 받는다. (편집 시 따옴표 없이 날짜를 써도 됨)
const flexDate = z.preprocess((v) => {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return v;
}, z.string());

// 편집 대상 콘텐츠는 ./content/projects/*.md 에 둔다 (Obsidian에서 편집하기 쉬운 위치).
const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/projects' }),
  schema: z.object({
    title: z.string(),
    title_en: z.string().optional(),
    agency: z.string(),
    period_start: flexDate,                   // 'YYYY-MM' 또는 'YYYY-MM-DD'
    period_end: flexDate,
    status: z.enum(['초기', '진행중', '마무리', '완료']).default('진행중'),
    progress: z.number().min(0).max(100),
    color: z.string().default('#2563eb'),
    keywords: z.array(z.string()).default([]),
    order: z.number().default(99),
    budget: z.string().optional(),            // 예: '9,000만 원'
    pi: z.string().optional(),                // 연구책임자
    team: z.array(z.string()).default([]),    // 참여진
    summary: z.string().optional(),           // 카드/메타 한 줄 요약
    events: z
      .array(
        z.object({
          date: flexDate,                     // 'YYYY-MM' 또는 'YYYY-MM-DD'
          label: z.string(),
          type: z.enum(['회의', '마일스톤', '제출', '마감', '보고']).default('마일스톤'),
          status: z.enum(['완료', '진행', '예정']).default('예정'),
        }),
      )
      .default([]),
  }),
});

export const collections = { projects };
