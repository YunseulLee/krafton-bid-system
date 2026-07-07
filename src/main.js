import { bootBidPlatformApp } from './ui/app.js';

const app = document.querySelector('#app');

function renderStartupError(error) {
  console.error(error);
  if (!app) return;
  app.innerHTML = `
    <section class="empty-state">
      <h1>앱을 시작하지 못했습니다</h1>
      <p>AWS EKS API 주소와 네트워크 상태를 확인한 뒤 다시 열어 주세요.</p>
    </section>
  `;
}

bootBidPlatformApp(app).catch(renderStartupError);
