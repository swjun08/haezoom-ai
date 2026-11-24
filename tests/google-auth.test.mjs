import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthUrl, CALENDAR_SCOPE, parseAuthRedirect, shouldUseWebFlow } from '../extension/google-auth.mjs';

const redirect = 'https://nlfhehdelekmadneoopeciaemejkmale.chromiumapp.org/';

test('getAuthToken이 안 되는 브라우저·로그인 안 된 프로필이면 웹 인증으로 넘어간다', () => {
  assert.equal(shouldUseWebFlow(new Error('This API is not supported on Microsoft Edge.')), true);
  assert.equal(shouldUseWebFlow(new Error('The user is not signed in.')), true);
  assert.equal(shouldUseWebFlow(new Error('The user turned off browser signin')), true);
  assert.equal(shouldUseWebFlow(new Error('The user did not approve access.')), false);
  assert.equal(shouldUseWebFlow(new Error('bad client id')), false);
});

test('인증 주소에 클라이언트·리디렉션·캘린더 범위·state를 담고, 조용한 갱신은 prompt=none', () => {
  const url = new URL(
    buildAuthUrl({ clientId: 'abc.apps.googleusercontent.com', redirectUri: redirect, interactive: true, state: 's1' }),
  );
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.equal(url.searchParams.get('redirect_uri'), redirect);
  assert.equal(url.searchParams.get('scope'), CALENDAR_SCOPE);
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(
    new URL(buildAuthUrl({ clientId: 'a', redirectUri: redirect, interactive: false, state: 's' })).searchParams.get(
      'prompt',
    ),
    'none',
  );
  assert.throws(() => buildAuthUrl({ clientId: '', redirectUri: redirect, interactive: true }));
});

test('리디렉션에서 토큰과 만료 시각을 읽고, 오류·state 불일치·권한 누락을 거른다', () => {
  const ok = parseAuthRedirect(
    `${redirect}#access_token=t0k&expires_in=3599&scope=${encodeURIComponent(CALENDAR_SCOPE)}&state=s1`,
    's1',
    1000,
  );
  assert.deepEqual(ok, { token: 't0k', expiresAt: 1000 + 3599000 });
  assert.throws(() => parseAuthRedirect(`${redirect}#error=access_denied&state=s1`, 's1'), /취소/);
  assert.throws(() => parseAuthRedirect(`${redirect}#error=interaction_required&state=s1`, 's1'), /만료/);
  assert.throws(() => parseAuthRedirect(`${redirect}#access_token=x&state=other`, 's1'), /확인할 수 없어요/);
  assert.throws(() => parseAuthRedirect(`${redirect}#access_token=x&scope=email&state=s1`, 's1'), /권한/);
  assert.throws(() => parseAuthRedirect(undefined, 's1'), /취소/);
});
