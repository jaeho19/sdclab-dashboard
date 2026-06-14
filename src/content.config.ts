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
  if (typeof v === 'number') return String(v); // 'target: 2026' 처럼 연도만 쓴 경우
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
    purpose: z.string().optional(),           // 우리 팀의 목적/목표
    current_stage: z.string().optional(),     // 현재 진행 단계
    highlights: z
      .array(z.object({ label: z.string(), items: z.array(z.string()).default([]), note: z.string().optional() }))
      .default([]),                           // 강조 콜아웃(예: MVP 데이터 목록)
    years: z
      .array(z.object({ label: z.string(), start: flexDate, end: flexDate }))
      .default([]),                           // 연차 구분 (다년차 과제)
    meetings: z
      .array(z.object({ date: flexDate, title: z.string(), summary: z.string().optional() }))
      .default([]),                           // 회의 기록 (최신 = 최근 회의)
    next_tasks: z
      .array(z.object({ task: z.string(), due: flexDate.optional(), done: z.boolean().default(false) }))
      .default([]),                           // 향후 주요 과제
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

// ── 강의 · 교과목 연차 계획 ─────────────────────────
const course = z.object({
  name: z.string(),
  level: z.enum(['학부', '대학원', '도시과학대학원', '도시설계정책학과']),
  tag: z.string().optional(),          // 신설 / 미정 / 폐지 / 잠정 등
  confirmed: z.boolean().default(true),
});

const teaching = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/teaching' }),
  schema: z.object({
    title: z.string().default('강의 · 교과목 연차 계획'),
    semesters: z
      .array(
        z.object({
          term: z.string(),            // '2026-1'
          label: z.string(),           // '2026학년도 1학기'
          status: z.enum(['완료', '진행', '예정', '안식년']),
          note: z.string().optional(),
          courses: z.array(course).default([]),
        }),
      )
      .default([]),
    development: z
      .array(
        z.object({
          item: z.string(),
          type: z.string(),            // 폐지 / 개발 / 심의 / 개설
          target: flexDate,           // '2026-09' 등 (완전한 날짜를 써도 문자열로 처리)
          status: z.string(),
          note: z.string().optional(),
        }),
      )
      .default([]),
    grounding_notes: z.string().optional(),
  }),
});

// ── 연구 연계 · 성과 공유 ────────────────────────────
const synergy = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/synergy' }),
  schema: z.object({
    intro: z.string().optional(),
    links: z
      .array(
        z.object({
          id: z.string(),
          a: z.string(),                    // 과제 slug
          b: z.string(),                    // 과제 slug
          title: z.string(),
          theme: z.string(),               // 연계 맵 간선 라벨(짧게)
          strength: z.enum(['강', '추가']).default('강'),
          shared: z
            .array(z.object({ from: z.string(), to: z.string(), asset: z.string(), how: z.string() }))
            .default([]),
          outputs: z.array(z.string()).default([]),
        }),
      )
      .default([]),
  }),
});

export const collections = { projects, teaching, synergy };
