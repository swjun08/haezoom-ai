# 개발 인계 · 3.1.0

## 구조

| 위치 | 역할 |
|---|---|
| `extension/selection-helper.js` | 상단 드롭다운, 드래그 가능한 h. 버튼, 선택 문장 도우미 |
| `extension/review.js` | 원문/PDF/캡처와 결과의 페이지 내 UI, 항목 선택·메모 |
| `extension/capture.js` | 현재 화면 캡처, 영역 선택과 크롭 |
| `extension/background.js` | 입력 메시지 검증, 저장 큐, PDF 처리 큐, OAuth/Calendar 조정, 우클릭 메뉴·단축키 |
| `extension/google-auth.mjs`, `google-config.mjs` | 웹 인증(launchWebAuthFlow) URL 생성·응답 해석, 웹 OAuth 클라이언트 ID |
| `extension/date-hints.js` | 애매한 날짜 표현의 후보 날짜 계산(일반 스크립트, `globalThis.haezoomDateHints`) |
| `extension/ics.mjs` | `.ics` 캘린더 파일 생성(RFC 5545 이스케이프·75바이트 줄 접기·알림) |
| `extension/core.mjs`, `item-store.mjs` | AI 결과 검증, 항목 변환, 저장·백업 검증 |
| `extension/calendar.mjs` | 날짜/시간과 Google 이벤트 변환, API 오류 복구 |
| `extension/reminders.mjs`, `reminder-service.mjs` | 알림 계산, 발송 기록, 재시작 복구 |
| `extension/workspace.*`, `workspace-v3.css`, `service.css` | 오늘·목록·달력·설정 |
| `extension/ocr.mjs`, `capture-processor.*` | PDF 페이지 렌더링 및 offscreen 처리 |
| `demo/` | 클래스룸 시연 사이트와 가상 공지·PDF (3.0 이전 체험 사이트) |
| `booth/` | 2026 성과발표회 부스 시연 사이트(정적, 실제 AI). `meta[name=haezoom-demo]`가 있는 페이지에서 확장의 진행 이벤트를 받습니다 |

## 항목 계약

`kind`는 `task` 또는 `schedule`. 공통으로 `id`, `title`, `date`, `originalDate`, `source`, `evidence`, `confirmed`, `needs_review`, `completed`, `revision`을 보관합니다.

- `action` / `details`: 각각 할 일 행동과 일정 설명.
- `materials`, `cost`, `submission`: 준비물, 비용, 제출 방법.
- `time`, `endTime`, `endDate`, `location`: 일정 시간·범위·장소.
- `documentSummary`: 분석한 공지 전체 요약. 새로 저장하는 항목에 보존됩니다.
- `notes`: 사용자가 입력하는 개인 메모, 최대 5,000자. AI 분석 요청에 넣는 추가 문맥과 별개입니다.
- `reminderEnabled`: 항목별 알림. 생략하면 전체 알림 설정을 따릅니다.

저장 키는 `haezoomItems`. updateItem은 허용 필드와 revision을 확인하고 직렬화합니다. content script는 saveAnalysis만 사용하고 임의 저장 API는 확장 페이지에서만 받습니다. 백업은 version 3, 복원 시 새 ID를 부여하고 Google 이벤트 연결 ID는 제거합니다.

## 중요한 동작

- 원문 날짜가 모호하면 추정하지 않습니다. 정확한 날짜 확인 전에는 알림·Google 등록에서 제외합니다.
- PDF는 최대 30페이지까지 열고 사용자가 선택한 페이지 한 장을 분석합니다. 숨겨진 offscreen에서는 PDF.js `intent: 'print'` 렌더링을 사용합니다.
- 캡처/분석 입력 이미지는 지속 저장하지 않습니다. 저장한 정리 내용·근거·요약·메모만 재사용합니다.
- Google Calendar는 사용자가 명시적으로 등록/업데이트합니다. notes와 summary는 이벤트 설명에도 포함됩니다. 해줌의 완료·삭제가 Google 이벤트를 자동 삭제하지 않습니다.
- 일정 종료 시간이 없으면 시작 1시간 후를 사용합니다. 수정 UI에서 표시합니다. 종일 범위 종료는 Google의 배타 종료일 규칙으로 변환합니다.
- 날짜 후보는 결과 창에서는 지금, 워크스페이스에서는 저장 시각(`createdAt`)의 한국 날짜 기준이며 최대 2개입니다. 후보를 눌러도 확인 체크 전에는 확정되지 않습니다.
- `.ics`는 Google 등록과 같은 `makeGoogleEvent` 규칙을 쓰고, 날짜를 확인한 미완료 항목만 담습니다. UID는 `<항목 id>@haezoom.ai`라 다시 가져오면 같은 일정이 갱신됩니다.
- 우클릭 메뉴는 `onInstalled`에서 만듭니다. 단축키(`Alt+Shift+H`/`Alt+Shift+C`)가 막힌 페이지에서는 Chrome 알림으로 이유를 알려 줍니다.
- 알림은 한국 시간 기준. 전달 기록으로 중복을 막고, Chrome 재시작 시 24시간 이내 누락을 복구합니다. 활성화 전 알림은 소급하지 않습니다.

## 연결 정보

Worker 주소는 `extension/api-config.js`에 있습니다. 사용자에게 서비스 키를 요구하거나 확장 코드에 넣지 않습니다.

Google 인증은 두 경로입니다.

1. `chrome.identity.getAuthToken` — `manifest.json`의 `oauth2.client_id`(Google Cloud ‘Chrome 확장 프로그램’ 유형, 항목 ID = 확장 ID). Chrome에 로그인한 계정을 씁니다.
2. `chrome.identity.launchWebAuthFlow` — `google-config.mjs`의 `GOOGLE_WEB_CLIENT_ID`(‘웹 애플리케이션’ 유형, 리디렉션 `https://<확장 ID>.chromiumapp.org/`). 1이 지원되지 않거나(Edge·Whale) Chrome 로그인이 없을 때 대화형 요청에서만 시도합니다. 토큰은 `chrome.storage.session`에만 두고 만료 1분 전부터 새로 받습니다.

어느 경로로 연결했는지는 `calendarAuth`(`chrome`/`web`)에 저장하고, 연결 해제 시 함께 지웁니다. 확장 ID는 `manifest.json`의 `key`(공개키)로 `nlfhehdelekmadneoopeciaemejkmale`에 고정돼 있습니다. 대응하는 개인키(.pem)는 저장소에 넣지 않습니다(`.gitignore`). 클라이언트 ID는 비밀값이 아닙니다. Google Cloud 프로젝트는 `haezoom-ai`이며 테스트 모드라 테스트 사용자만 연결됩니다. 검증 경계는 [QA.md](QA.md)를 참조합니다.
