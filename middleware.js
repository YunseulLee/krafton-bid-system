const OPERATOR_ALLOWED_IPS = new Set([
  '103.114.126.33',
  '103.114.126.34',
]);

const DEFAULT_OPERATOR_LOGIN_REVIEW_MODE = false;

function normalizePathname(pathname) {
  const normalized = String(pathname || '/').replace(/\/+$/, '');
  return normalized || '/';
}

function firstForwardedIp(value) {
  return String(value || '').split(',')[0].trim();
}

export function isOperatorLoginRequest(url) {
  const pathname = normalizePathname(url.pathname);
  return pathname === '/operator' || url.searchParams.get('operator') === '1';
}

export function getClientIpFromRequest(request) {
  const headers = request.headers;
  return firstForwardedIp(headers.get('x-forwarded-for'))
    || firstForwardedIp(headers.get('x-vercel-forwarded-for'))
    || firstForwardedIp(headers.get('x-real-ip'))
    || firstForwardedIp(headers.get('cf-connecting-ip'));
}

export function isAllowedOperatorIp(ipAddress) {
  return OPERATOR_ALLOWED_IPS.has(String(ipAddress || '').trim());
}

export function isOperatorLoginReviewModeEnabled(value = globalThis.process?.env?.OPERATOR_LOGIN_REVIEW_MODE) {
  if (value === undefined || value === null || value === '') return DEFAULT_OPERATOR_LOGIN_REVIEW_MODE;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

export function protectOperatorLoginRequest(request, options = {}) {
  const url = new URL(request.url);
  if (!isOperatorLoginRequest(url)) return undefined;

  const reviewMode = options.reviewMode ?? isOperatorLoginReviewModeEnabled();
  if (reviewMode) return undefined;

  const clientIp = getClientIpFromRequest(request);
  if (isAllowedOperatorIp(clientIp)) return undefined;

  const redirectUrl = new URL('/', url.origin);
  return Response.redirect(redirectUrl, 302);
}

export default function middleware(request) {
  return protectOperatorLoginRequest(request);
}
