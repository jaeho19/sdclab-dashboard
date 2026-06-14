import { getCollection } from 'astro:content';

// Obsidian 볼트의 날짜 자동 프리픽스(예: '06-14_plan')로 생긴 중복 파일을 무시한다.
const isDatePrefixed = (id: string) => /^\d{2,4}-\d{2}[-_]/.test(id);

export async function getProjects() {
  const all = await getCollection('projects');
  return all
    .filter((e) => !isDatePrefixed(e.id))
    .sort((a, b) => a.data.order - b.data.order);
}

export async function getTeaching() {
  const all = (await getCollection('teaching')).filter((e) => !isDatePrefixed(e.id));
  return all.find((e) => e.id === 'plan') ?? all[0];
}
