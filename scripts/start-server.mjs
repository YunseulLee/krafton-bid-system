import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('.');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function resolveRequestPath(url) {
  const pathname = new URL(url, `http://${host}:${port}`).pathname;
  const normalizedPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const filePath = resolve(join(root, normalizedPath === '/' ? 'index.html' : normalizedPath));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

const server = createServer(async (request, response) => {
  const filePath = resolveRequestPath(request.url || '/');
  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    const actualPath = fileStat.isDirectory() ? join(filePath, 'index.html') : filePath;
    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(actualPath)) || 'application/octet-stream',
    });
    createReadStream(actualPath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.on('error', (error) => {
  if (error.code === 'EPERM') {
    console.error('로컬 미리보기 서버를 시작하지 못했습니다.');
    console.error('원인: 현재 Codex 샌드박스가 새 네트워크 포트 바인딩을 차단했습니다.');
    console.error('해결 1: 일반 터미널에서 이 프로젝트 폴더로 이동한 뒤 npm start를 실행하세요.');
    console.error('해결 2: 4173 포트가 막혀 있으면 PORT=4174 npm start를 실행하고 http://127.0.0.1:4174/로 접속하세요.');
    console.error('확인: lsof -nP -iTCP:4173 -sTCP:LISTEN');
    process.exit(1);
  }

  if (error.code === 'EADDRINUSE') {
    console.error(`포트 ${port}가 이미 사용 중입니다.`);
    console.error(`확인: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    console.error(`종료: kill <PID>`);
    console.error('우회: PORT=4174 npm start를 실행하고 http://127.0.0.1:4174/로 접속하세요.');
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  console.log(`입찰 플랫폼 미리보기: http://${host}:${port}/`);
});
