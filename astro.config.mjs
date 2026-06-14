// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// 배포 대상에 따라 base 경로가 달라진다.
//  - GitHub Pages(프로젝트 페이지): https://jaeho19.github.io/sdclab-dashboard/
//  - Netlify(루트):                 https://<site>.netlify.app/
// GitHub Actions 환경에서는 자동으로 Pages 설정을 사용한다.
const isPages = process.env.DEPLOY_TARGET === 'pages' || process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  site: isPages ? 'https://jaeho19.github.io' : 'https://sdclab-dashboard-156.netlify.app',
  base: isPages ? '/sdclab-dashboard/' : '/',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
