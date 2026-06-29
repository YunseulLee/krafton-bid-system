export function getSupabaseConfig(env = import.meta.env || {}) {
  const url = env.VITE_SUPABASE_URL || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY || '';
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}

export function createMissingSupabaseConfigMessage() {
  return 'Supabase 환경변수가 설정되지 않았습니다. VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정한 뒤 다시 배포하세요.';
}
