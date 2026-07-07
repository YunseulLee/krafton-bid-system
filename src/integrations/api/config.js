function getPublicBrowserEnv() {
  return {
    ...(import.meta.env || {}),
    ...(globalThis.__BID_ENV__ || {}),
  };
}

export function getBidApiConfig(env = getPublicBrowserEnv()) {
  const baseUrl = String(env.VITE_BID_API_BASE_URL || '').replace(/\/+$/, '');
  return {
    baseUrl,
    configured: Boolean(baseUrl),
  };
}

export function createMissingBidApiConfigMessage() {
  return 'AWS EKS API 주소가 설정되지 않았습니다. VITE_BID_API_BASE_URL을 설정한 뒤 다시 배포하세요.';
}
