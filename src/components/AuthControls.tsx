import type { User } from '@supabase/supabase-js';

type Props = {
  enabled: boolean;
  ready: boolean;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
};

export function AuthControls({ enabled, ready, user, onSignIn, onSignOut }: Props) {
  if (!enabled || !ready) return null;

  if (!user) {
    return <button className="auth-btn" onClick={onSignIn}>Google로 로그인</button>;
  }

  const name = user.user_metadata?.full_name ?? user.email ?? '내 계정';
  const avatar = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="auth-user">
      {avatar && <img className="auth-avatar" src={avatar} alt="" referrerPolicy="no-referrer" />}
      <span>{name}</span>
      <button className="secondary auth-btn" onClick={onSignOut}>로그아웃</button>
    </div>
  );
}
