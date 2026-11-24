# 해줌 AI · 3.1.0

학교 공지를 할 일과 일정으로 정리하는 Chrome 확장 프로그램입니다. 웹페이지에서 문장 선택·화면 캡처·PDF 가져오기로 시작하고, 결과와 날짜를 확인한 뒤 메모와 함께 저장합니다. 평소 입력은 페이지 안에서, 일정 확인과 관리는 워크스페이스에서 진행합니다.

## 현재 기능

- 상단 확장 아이콘: 화면 오른쪽 위에서 내려오는 둥근 메뉴. 페이지의 원형 h. 버튼: 드래그 이동, 버튼 옆 메뉴, 화면 경계 보정.
- 선택 문장·영역 캡처·PDF 페이지를 같은 페이지 안에서 확인하고 AI로 분석. 캡처 이미지는 비율을 유지합니다.
- 분석 결과: 왼쪽 항목 목록, 오른쪽 날짜·내용·준비물·비용·제출 방법·메모. 저장 버튼은 하단 고정.
- 할 일/일정 분류 수정, 날짜 확인, 로컬 영구 저장, 메모 수정, 검색·필터·완료·되돌리기, JSON 백업.
- 오늘의 할 일과 작은 달력, 월간 캘린더와 선택 날짜 목록. 날짜 칸 전체를 클릭할 수 있습니다.
- Google 연결 없이 Chrome 알림: 3일 전·하루 전·당일, 일정 시작 30분 전. 항목별 끄기, 재시작 복구, 중복 발송 방지.
- **우클릭 메뉴·단축키 (3.1)**: 문장을 고르고 우클릭 → ‘해줌으로 정리’, 페이지·이미지 우클릭 → 화면 캡처. `Alt+Shift+H` 선택 문장 정리(없으면 메뉴), `Alt+Shift+C` 화면 캡처. 단축키는 `chrome://extensions/shortcuts`에서 바꿀 수 있습니다.
- **애매한 날짜 후보 (3.1)**: ‘다음 주 금요일’, ‘11월 27일’, ‘30일까지’처럼 연도·정확한 날짜가 없는 표현에 가져온 날 기준 후보 날짜를 보여 줍니다. 후보를 눌러야 입력되고, 사용자가 확인해야 확정됩니다.
- **캘린더 파일 받기 (3.1)**: 달력 화면의 ‘캘린더 파일 받기’ 또는 항목별 ‘캘린더 파일’로 `.ics`를 내려받아 Apple·Google·Outlook·삼성 캘린더에 가져갈 수 있습니다. Google 로그인이 필요 없고, 날짜를 확인한 미완료 항목만 담기며 하루 전(시간 있는 일정은 30분 전) 알림이 포함됩니다.
- **Google Calendar 직접 등록**: 등록·수정·삭제와 오류 복구. 3.1에서 확장 ID를 고정하고 전용 Google Cloud 프로젝트의 OAuth 클라이언트를 연결했습니다. Chrome 로그인 계정으로 바로 연결하고, Chrome에 로그인하지 않았거나 Edge·Whale이면 Google 로그인 창으로 연결합니다. 앱이 테스트 모드라 **테스트 사용자로 등록된 계정만** 연결할 수 있습니다.

![분석 결과와 항목별 메모](docs/screenshots/28-result-details.png)
![저장한 항목의 상세 화면](docs/screenshots/29-saved-note.png)

## Chrome 설치 / 업데이트

> **3.0.x에서 3.1.0으로 올릴 때:** 3.1.0부터 확장 ID가 `nlfhehdelekmadneoopeciaemejkmale`로 고정됩니다. 기존 설치와 ID가 달라 Chrome이 새 확장으로 인식하므로, 업데이트 전에 **알림 · 연결 설정 → 데이터 백업 → 내려받기**로 저장 항목을 받아 두고, 새로 설치한 뒤 같은 곳의 **가져오기**로 복원해 주세요. 기존 해줌 카드는 백업 후 삭제합니다. 사이트 권한(해줌 버튼 표시)과 툴바 고정도 다시 설정합니다.

1. 저장소를 내려받습니다.
2. `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드에서 **extension 폴더**를 선택합니다.
3. 기존 설치는 해줌 카드의 새로고침을 누릅니다. 열려 있던 분석 내용을 저장한 뒤 공지 페이지도 새로고침합니다.
4. 상단 해줌 아이콘을 고정합니다. 원형 버튼을 모든 일반 사이트에서 사용하려면 **연결·설정 → 해줌 버튼 표시**에서 허용합니다.
5. 로컬 PDF에서 버튼을 사용하려면 확장 상세 설정의 **파일 URL에 대한 액세스 허용**을 켭니다.

Chrome 설정·웹스토어 등 제한된 페이지에서는 페이지 내 메뉴를 띄울 수 없어 워크스페이스를 엽니다. 캡처 권한 안내가 나오면 상단 해줌 아이콘 → 화면 캡처로 시작합니다. 내장 PDF 내부의 선택 문장 직접 읽기 대신 화면 캡처 또는 PDF 업로드를 사용합니다.

## 데이터와 알림

분석 버튼에서 동의한 원문·선택 이미지가 `haezoom.sleepwhale.workers.dev`의 Worker를 거쳐 Claude로 전송됩니다. API 키는 확장에 넣지 않습니다. 저장한 할 일·일정·정리 내용·메모는 현재 Chrome 프로필의 로컬 저장소에 보관됩니다. Google 등록은 사용자가 별도로 실행합니다.

PDF는 20MB·30페이지까지 열 수 있으며 **선택한 한 페이지**를 이미지로 분석합니다. 문서 전체 일괄 분석이 아닙니다. 이미지 입력은 5MB까지입니다. 연도 없는 날짜는 추정하지 않고 확인 필요로 남깁니다.

Chrome 알림은 설정에서 켭니다. Chrome 종료·OS 알림 차단 상태에서는 정시 표시를 보장하지 않습니다. 다시 실행하면 24시간 이내 놓친 알림을 복구합니다. Google 연결은 Chrome 자체 알림에 필요하지 않습니다.

## Google Calendar 연결 설정

Google Cloud 프로젝트 `haezoom-ai`(소유: 개발자 계정)에 다음을 설정했습니다.

| 항목 | 값 |
|---|---|
| API | Google Calendar API 사용 |
| OAuth 동의 화면 | 앱 이름 ‘해줌 AI’, 외부, 테스트 모드, 범위 `calendar.events` |
| Chrome 확장 클라이언트 | 항목 ID `nlfhehdelekmadneoopeciaemejkmale` → `extension/manifest.json`의 `oauth2.client_id` |
| 웹 애플리케이션 클라이언트 | 리디렉션 `https://nlfhehdelekmadneoopeciaemejkmale.chromiumapp.org/` → `extension/google-config.mjs` |

다른 계정으로 연결하려면 Google Cloud 콘솔 → Google 인증 플랫폼 → 대상 → 테스트 사용자에 추가합니다(최대 100명). 일반 공개는 Google 앱 인증 심사가 필요합니다. 클라이언트 ID는 비밀값이 아니며, 웹 클라이언트의 보안 비밀은 확장에서 쓰지 않으므로 저장소에 넣지 않습니다. Chrome 웹 스토어에 올리면 스토어가 부여한 ID로 Chrome 확장 클라이언트를 하나 더 만들어야 합니다.

## 부스 시연 사이트 (`booth/`)

2026 서울학생 AI 개발 성과발표회 부스용 체험 사이트입니다. 첫 화면 → 찾아보기 게임 → 맡겨보기(문장 선택·확장과 같은 결과 창) → 챙기기(워크스페이스·알림) → 설치된 확장으로 직접 해보기 순서로 진행합니다. 각 단계는 실제 AI로 분석합니다.

```sh
python3 -m http.server 4180 --directory booth
```

macOS에서는 `booth/시연_시작.command`를 더블클릭해도 됩니다. 진행자 준비와 단계별 안내는 [booth/README.md](booth/README.md)에 있습니다.

## 해줌 소개 · 직접 체험하기

[해줌 AI 홈페이지](https://haezoom-classroom-demo.swjun08.chatgpt.site/) · [체험 시작](https://haezoom-classroom-demo.swjun08.chatgpt.site/experience/) — 현재 소유자 로그인 전용입니다.

이편한자막의 사용자 제공 소스에서 글꼴·여백·버튼 비율을 참고하고, 해줌의 서비스 설명·팀 소개·체험 흐름으로 구성했습니다. 요금제와 계정 생성 화면은 없습니다.

- 첫 화면: 공지의 중요한 문장이 선택되고 할 일·일정·준비물로 나뉘는 모션. 세 가지 입력 방식 전환, 다시 보기, 모션 줄이기 지원.
- `/experience/select/`: 코딩 워크숍 공지에서 신청과 참석을 구분하고 메모 저장.
- `/experience/capture/`: 세 가지 제출 자료의 기한을 표에서 캡처.
- `/experience/date/`: 정확한 날짜가 없는 독서 모임 공지를 원문과 대조하고 메모 보완.
- `/experience/pdf/`: 사용자 제공 8페이지 PDF 내려받기·미리보기, 확장 업로드 안내.
- `/classroom/`: 기존 Classroom 형태 교실을 보존했습니다.

체험 안내는 확장이 보낸 가져오기·분석·저장 단계에 따라 바뀝니다. 분석 결과를 흉내 내거나 자동 저장하지 않습니다. 공지 내용·AI 응답·개인 메모를 체험 사이트에 보내지 않으며, 체험 완료 표시는 탭의 sessionStorage에만 보관합니다.

```sh
python3 -m http.server 4173 --directory demo
```

브라우저에서 `http://localhost:4173`을 엽니다. 자세한 진행 안내는 [demo/README.md](demo/README.md)에 있습니다.

## 개발 및 검증

Node 22 이상. 확장은 빌드 없이 로드합니다.

```sh
npm ci
npx playwright install chromium
npm test
npm run check
npm run format:check
node tests/browser.mjs
node tests/notes-browser.mjs
node tests/global.mjs
node tests/offscreen.mjs
node tests/pdf.mjs
node tests/enhance-browser.mjs
node tests/booth-browser.mjs
```

위 검사는 GitHub Actions(`.github/workflows/ci.yml`)에서 push·PR마다 실행됩니다. 코드 형식은 Prettier(`npm run format`)로 맞춥니다.

`tests/demo-browser.mjs`와 `tests/service-browser.mjs`는 4173번 `demo/` 서버가 필요하고, 3.0 이후 바뀐 `demo/` 화면을 반영하지 못해 **현재 실패합니다**(CI 제외). `demo/`를 계속 쓸 경우 갱신이 필요합니다. `tests/release-browser.mjs`와 `scripts/verify-live-ai.mjs`는 실제 AI API를 사용하며 비용이 발생할 수 있습니다. 다른 UI 검사는 모의 응답과 별도 임시 브라우저 프로필을 사용합니다. 실제 계정 검증과 모의 검증의 구분은 [QA 기록](docs/QA.md)을 확인해 주세요.

- [구현 범위와 팀원 후속 업무](docs/TEAM_HANDOFF.md)
- [구조·데이터 계약](docs/HANDOFF.md)
- [디자인 결정과 검수](docs/DESIGN.md)

기준 저장소 `wodlelflt/haezoom-ai`의 `b08cc6d` 위에 개선했습니다. PDF.js·Tesseract·Pretendard의 기존 라이선스를 유지하며 새 UI 아이콘의 라이선스는 `extension/icons/LICENSE`에 있습니다. 공개 출시 전 실제 OAuth, OS 알림, 문서 정확도 및 운영 정책 검증이 남아 있습니다.
