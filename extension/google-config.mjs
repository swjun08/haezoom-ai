// Google 캘린더 연결 설정
// - manifest.json의 oauth2.client_id: Google Cloud의 'Chrome 확장 프로그램' 유형 OAuth 클라이언트 (Chrome 로그인 계정으로 바로 연결)
// - GOOGLE_WEB_CLIENT_ID: '웹 애플리케이션' 유형 OAuth 클라이언트. Chrome에 로그인하지 않았거나 Edge·Whale처럼
//   chrome.identity.getAuthToken을 지원하지 않는 브라우저에서 쓰는 예비 경로입니다.
//   승인된 리디렉션 URI: https://<확장 ID>.chromiumapp.org/  (manifest의 key로 ID가 고정돼 있어요)
export const GOOGLE_WEB_CLIENT_ID = '1089348356723-8rel21ebq2ct214eultji2gaq7r6u9n7.apps.googleusercontent.com';
