import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDir = resolve('.');
const distDir = resolve(rootDir, 'dist');
const publicEnv = {
  VITE_BID_API_BASE_URL: process.env.VITE_BID_API_BASE_URL || '',
  VITE_OPERATOR_LOGIN_REVIEW_MODE: process.env.VITE_OPERATOR_LOGIN_REVIEW_MODE || '',
};

async function copyRecursive(from, to) {
  await cp(resolve(rootDir, from), resolve(distDir, to), {
    recursive: true,
    force: true,
  });
}

function renderPublicEnvScript() {
  return `<script>window.__BID_ENV__ = ${JSON.stringify(publicEnv).replace(/</g, '\\u003c')};</script>`;
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const indexHtml = await readFile(resolve(rootDir, 'index.html'), 'utf8');
await writeFile(
  resolve(distDir, 'index.html'),
  indexHtml.replace('</head>', `  ${renderPublicEnvScript()}\n  </head>`),
  'utf8'
);

await copyRecursive('src', 'src');

console.log(`정적 빌드 완료: ${distDir}`);
