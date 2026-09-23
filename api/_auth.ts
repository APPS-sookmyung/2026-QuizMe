import { createClient } from '@supabase/supabase-js';

type Headers = Record<string, string | string[] | undefined>;

export type AuthResult =
  | { ok: true; userId: string | null }
  | { ok: false; status: number; error: string };

export async function authenticate(headers: Headers = {}): Promise<AuthResult> {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Allowed only for local dev before Supabase is configured; deployed environments fail closed.
    const isLocal = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development';
    return isLocal
      ? { ok: true, userId: null }
      : { ok: false, status: 500, error: 'Supabase 환경변수가 서버에 설정되지 않았습니다.' };
  }

  const header = headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return { ok: false, status: 401, error: '로그인이 필요합니다.' };

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: '로그인 정보가 유효하지 않습니다.' };

  return { ok: true, userId: data.user.id };
}
