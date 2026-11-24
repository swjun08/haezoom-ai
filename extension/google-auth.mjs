// Google OAuth 도우미 — 브라우저 API와 분리해 테스트할 수 있게 둔 순수 함수
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** chrome.identity.getAuthToken이 안 되는 환경이면 웹 인증 흐름으로 넘어갑니다. */
export function shouldUseWebFlow(error) {
  const reason = String(error?.message || error || '');
  return /not supported|unsupported|not signed in|not logged in|turned off browser sign|sign-?in (is )?disabled|OAuth2 request failed|identity API is disabled/i.test(
    reason,
  );
}

export function buildAuthUrl({ clientId, redirectUri, interactive, state }) {
  if (!clientId) throw new Error('Google 웹 연결 설정(GOOGLE_WEB_CLIENT_ID)이 비어 있어요.');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: CALENDAR_SCOPE,
    include_granted_scopes: 'true',
    prompt: interactive ? 'select_account' : 'none',
    state,
  }).toString();
  return url.href;
}

/** 리디렉션 주소(#access_token=…)에서 토큰을 꺼냅니다. */
export function parseAuthRedirect(redirectUrl, expectedState, now = Date.now()) {
  if (typeof redirectUrl !== 'string' || !redirectUrl) throw new Error('Google 연결이 취소됐어요.');
  const hash = new URL(redirectUrl).hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const error = params.get('error');
  if (error) {
    if (/access_denied/.test(error)) throw new Error('Google 연결이 취소됐어요. 필요할 때 다시 연결할 수 있어요.');
    if (/interaction_required|login_required|consent_required/.test(error))
      throw new Error('Google 연결이 만료됐어요. 다시 연결해 주세요.');
    throw new Error(`Google 연결을 완료하지 못했어요. (${error})`);
  }
  if (expectedState && params.get('state') !== expectedState)
    throw new Error('Google 연결 응답을 확인할 수 없어요. 다시 시도해 주세요.');
  const token = params.get('access_token');
  if (!token) throw new Error('Google 인증 토큰이 없습니다.');
  const scope = params.get('scope') || '';
  if (scope && !scope.split(/\s+/).includes(CALENDAR_SCOPE)) throw new Error('캘린더 일정 권한을 허용해 주세요.');
  const seconds = Number(params.get('expires_in')) || 3600;
  return { token, expiresAt: now + seconds * 1000 };
}
