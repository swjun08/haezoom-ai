// 시연 자료 — 텍스트 자료의 날짜는 방문한 날을 기준으로 자동 계산돼요.
import { fromToday, fmt } from './dates.js';

const T = (key, text) => `<span class="u target" data-t="${key}">${text}</span>`;

/* ───────────── 1단계: 빽빽한 가정통신문 (찾기 게임) ───────────── */
export function skiNotice() {
  const today = fromToday(0);
  const apply = fromToday(9, { weekday: true });
  const pay = fromToday(14, { weekday: true });
  const brief = fromToday(16, { weekday: true });
  const campStart = fromToday(50, { weekdayIs: 3 });
  const campEnd = fromToday(52, { weekdayIs: 5 });
  const refundDay = new Date(campStart); refundDay.setDate(refundDay.getDate() - 7);

  const targets = [
    { key: 'apply', label: '신청 기한' },
    { key: 'fee', label: '비용' },
    { key: 'items', label: '준비물' },
    { key: 'brief', label: '설명회 일정' },
    { key: 'camp', label: '캠프 일정' },
    { key: 'refund', label: '환불 기한' },
  ];

  const html = `
  <header class="paper-head no-unit">
    <div class="paper-seal"><span>校</span><small>[○○중학교] 안내</small></div>
    <h3>가 정 통 신 문</h3>
    <dl><dt>교 무 실</dt><dd>02-3456-7890</dd><dt>체 육 부</dt><dd>02-3456-7894</dd><dt>행 정 실</dt><dd>02-3456-7892</dd></dl>
  </header>
  <div class="paper-no no-unit"><span>제 2026-118호</span><strong>2026학년도 겨울방학 스키캠프 참가 안내</strong></div>
  <p>학부모님 안녕하십니까? 늘 본교 교육활동에 관심을 가져 주셔서 감사드립니다. 본교에서는 겨울방학을 맞아 학생들의 체력 증진과 공동체 의식 함양을 위하여 겨울방학 스키캠프를 아래와 같이 운영하고자 합니다. 안전하고 의미 있는 캠프가 될 수 있도록 가정에서의 많은 관심과 협조 부탁드립니다.</p>
  <h4>1. 일시 및 장소</h4>
  <p>${T('camp', `기간: ${fmt.long(campStart)} ~ ${fmt.long(campEnd)} (2박 3일), 장소: 강원도 평창군 ○○리조트`)}</p>
  <h4>2. 참가 대상 및 인원</h4>
  <p>1~2학년 재학생 중 희망자 80명 이내 (신청 인원이 많을 경우 학년별 추첨으로 선발하며, 선발 결과는 개별 안내합니다.)</p>
  <h4>3. 신청 방법</h4>
  <p>${T('apply', `참가를 희망하는 학생은 ${fmt.long(apply)} 오후 4시까지 하단의 참가 동의서를 작성하여 담임 선생님께 제출해 주시기 바랍니다.`)} 기한 이후에는 접수가 어렵습니다.</p>
  <h4>4. 참가비 및 납부 방법</h4>
  <table class="paper-table">
    <thead><tr><th>구분</th><th>내역</th><th>금액</th></tr></thead>
    <tbody>
      <tr><td>숙박·식비</td><td>2박 6식 (리조트 내 숙소)</td><td>52,000원</td></tr>
      <tr><td>리프트·강습</td><td>리프트권 2일, 수준별 강습 4시간</td><td>28,000원</td></tr>
      <tr><td>보험·기타</td><td>여행자 보험, 장비 대여 일부</td><td>5,000원</td></tr>
    </tbody>
  </table>
  <p>${T('fee', `참가비 85,000원은 ${fmt.dot(pay)} 스쿨뱅킹 계좌에서 일괄 출금됩니다.`)} 출금일 전날까지 계좌 잔액을 확인해 주시기 바랍니다. 교육급여 수급 가정은 행정실로 문의해 주십시오.</p>
  <h4>5. 준비물</h4>
  <p>${T('items', '스키복(대여 가능), 방수 장갑, 고글, 개인 상비약, 세면도구, 3일분 갈아입을 옷을 준비해 주세요.')} 헬멧과 스키 장비는 현장에서 무료로 대여합니다.</p>
  <h4>6. 학부모 사전 설명회</h4>
  <p>${T('brief', `${fmt.long(brief)} 오후 6시, 본관 3층 시청각실에서 학부모 사전 설명회를 진행합니다.`)} 일정, 안전 수칙, 비상 연락 체계를 안내해 드립니다.</p>
  <h4>7. 유의 사항</h4>
  <ul>
    <li>캠프 기간 중 휴대전화는 취침 시간에 인솔 교사가 일괄 보관합니다.</li>
    <li>${T('refund', `출발 7일 전(${fmt.long(refundDay)})까지 취소하면 전액 환불되며, 이후에는 환불되지 않습니다.`)}</li>
    <li>지병이나 알레르기가 있는 학생은 동의서의 건강 상태란에 반드시 적어 주시기 바랍니다.</li>
  </ul>
  <div class="paper-cut no-unit">✂ 절 취 선</div>
  <div class="paper-form">
    <strong>2026학년도 겨울방학 스키캠프 참가 동의서</strong>
    <p>학년 반 번 성명: ____________ 보호자: ____________ (서명)</p>
    <p>위 학생의 스키캠프 참가에 동의합니다.</p>
  </div>
  <p class="paper-date no-unit">${fmt.long(today).replace(/\(.\)/, '')}</p>
  <p class="paper-sign no-unit">○ ○ 중 학 교 장</p>`;
  return { id: 'ski', kind: 'paper', label: '스키캠프 가정통신문', html, targets };
}

/* ───────────── 클래스룸 느낌 공지 ───────────── */
export function classroomInfo() {
  const due = fromToday(6, { weekday: true });
  const pres = fromToday(13, { weekday: true });
  const posted = fromToday(0);
  return {
    id: 'cls-info', kind: 'classroom', label: '정보 수행평가', sub: '2학년 3반 정보',
    className: '2학년 3반 정보', room: '정보실 2', color: '#1f6f63',
    teacher: '이서윤 선생님', posted: fmt.md(posted), type: '과제',
    title: '[수행평가] 생활 속 문제 해결 앱 기획서',
    due: `${fmt.md(due)} 오후 11:59`,
    body: [
      '2학기 정보 수행평가 안내입니다. 우리 반 생활에서 불편한 점을 하나 골라 해결하는 앱을 기획합니다.',
      `기획서는 ${fmt.long(due)} 밤 11시 59분까지 이 과제에 PDF로 제출해 주세요. 분량은 A4 3장 이내입니다.`,
      '모둠은 4명이며, 모둠 명단은 내일 수업 시간에 정합니다.',
      `${fmt.long(pres)} 2교시에 모둠별 5분 발표가 있습니다. 발표 자료는 기획서 내용을 그대로 써도 됩니다.`,
      '평가 기준표는 첨부 파일을 참고하세요. 질문은 수업 댓글로 남겨 주세요.',
    ],
    comments: [{ who: '김도윤', text: '선생님 발표 자료도 따로 제출해야 하나요?' }, { who: '이서윤 선생님', text: '아니요, 발표 당일 화면에 띄우면 됩니다.' }],
  };
}

export function classroomScience() {
  const lab = fromToday(4, { weekday: true });
  const pre = fromToday(3, { weekday: true });
  return {
    id: 'cls-sci', kind: 'classroom', label: '통합과학 실험 준비', sub: '1학년 통합과학',
    className: '1학년 통합과학', room: '과학실 1', color: '#355c9a',
    teacher: '박지호 선생님', posted: fmt.md(fromToday(0)), type: '공지',
    title: '[통합과학] 산·염기 중화 반응 실험 준비 안내',
    due: null,
    body: [
      `다음 실험은 ${fmt.long(lab)} 5교시, 과학실 1에서 진행합니다.`,
      `실험 전 사전 보고서(가설과 실험 순서)를 ${fmt.long(pre)} 오후 6시까지 클래스 과제에 올려 주세요.`,
      '개인 준비물: 실험복, 일회용 니트릴 장갑, 필기도구. 보안경은 학교에서 빌려줍니다.',
      '긴 머리는 꼭 묶고 오세요. 슬리퍼는 착용할 수 없습니다.',
    ],
    comments: [{ who: '정하린', text: '장갑 없으면 매점에서 사도 되나요?' }],
  };
}

export function classroomTrip() {
  const apply = fromToday(6, { weekday: true });
  const trip = fromToday(20, { weekday: true });
  return {
    id: 'cls-trip', kind: 'classroom', label: '대학 탐방 신청', sub: '3학년 진로',
    className: '3학년 진로', room: '진로상담실', color: '#7a4a9a',
    teacher: '최유진 선생님', posted: fmt.md(fromToday(0)), type: '공지',
    title: '[진로] 겨울 대학 전공 탐방 참가자 모집',
    due: null,
    body: [
      `서울 소재 대학 2곳의 컴퓨터·AI 전공 탐방 프로그램 참가자를 모집합니다. 탐방일은 ${fmt.long(trip)}입니다.`,
      `참가 신청은 ${fmt.long(apply)}까지 아래 설문으로 해 주세요. 선착순 30명입니다.`,
      '참가비는 없으며, 점심은 학교에서 제공합니다.',
      '당일 오전 8시 40분 학교 정문에서 출발합니다. 학생증을 꼭 챙기세요.',
    ],
    comments: [],
  };
}

/* ───────────── 단톡방 느낌 대화 ───────────── */
export function chatParents() {
  const apply = fromToday(5, { weekday: true });
  const s = fromToday(10, { weekdayIs: 1 });
  const e = new Date(s); e.setDate(e.getDate() + 4);
  return {
    id: 'chat-parents', kind: 'chat', label: '학부모 단톡방', sub: '3학년 2반 학부모방 · 26명',
    room: '3학년 2반 학부모방', count: 26, dateHeader: fmt.long(fromToday(0)),
    messages: [
      { who: '담임 김수연', time: '오후 3:12', text: `안녕하세요, 2반 담임입니다. 2학기 학부모 상담 주간 안내드립니다.` },
      { who: '담임 김수연', time: '오후 3:12', text: `상담은 ${fmt.md(s)}부터 ${fmt.md(e)}까지 진행하고, 대면과 전화 중에 고르실 수 있어요. 신청은 ${fmt.md(apply)}까지 e알리미 설문으로 해 주세요.` },
      { who: '도윤맘', time: '오후 3:20', text: '네 감사합니다 선생님~' },
      { who: '서아 아빠', time: '오후 3:31', text: '혹시 화상 상담도 가능할까요? 평일엔 회사라서요ㅠ' },
      { who: '담임 김수연', time: '오후 3:40', text: '네 화상도 가능합니다. 설문에 화상 상담으로 체크해 주시면 링크 보내드릴게요.' },
      { me: true, time: '오후 3:41', text: '감사합니다! 신청할게요' },
      { who: '하준맘', time: '오후 4:02', text: '그리고 내일 체육대회라 체육복 입고 등교하는 거 맞죠?' },
      { who: '담임 김수연', time: '오후 4:05', text: '네 맞습니다. 물병도 챙겨 보내 주세요.' },
    ],
  };
}

export function chatClass() {
  const consent = fromToday(2, { weekday: true });
  const math = fromToday(3, { weekdayIs: 5 });
  return {
    id: 'chat-class', kind: 'chat', label: '반 단톡방', sub: '1학년 3반 ❤️ · 31명',
    room: '1학년 3반 ❤️', count: 31, dateHeader: fmt.long(fromToday(0)),
    messages: [
      { who: '반장 지민', time: '오후 9:02', text: '공지!!! 다들 봐줘' },
      { who: '반장 지민', time: '오후 9:03', text: `현장체험학습 동의서 ${fmt.md(consent)}까지 담임쌤한테 내야 됨. 안 내면 못 간대` },
      { who: '반장 지민', time: '오후 9:03', text: `그리고 수학 학습지 3단원 ${fmt.md(math)}까지 교무실 앞 바구니에 제출` },
      { who: '태현', time: '오후 9:05', text: 'ㅋㅋㅋ 학습지 그거 몇 장이었지' },
      { who: '수빈', time: '오후 9:06', text: '앞뒤로 2장' },
      { me: true, time: '오후 9:07', text: '체험학습 비용 따로 내는 거 있어?' },
      { who: '반장 지민', time: '오후 9:08', text: '없대! 대신 점심 도시락 싸 와야 됨' },
      { who: '태현', time: '오후 9:10', text: '헐 도시락 ㅠㅠ' },
    ],
  };
}

export function chatSoccer() {
  const fee = fromToday(7, { weekday: true });
  const match = fromToday(11, { weekdayIs: 6 });
  return {
    id: 'chat-soccer', kind: 'chat', label: '축구부 학부모방', sub: '유소년 축구부 학부모 · 18명',
    room: '유소년 축구부 학부모', count: 18, dateHeader: fmt.long(fromToday(0)),
    messages: [
      { who: '코치 박정우', time: '오전 10:15', text: `어머님 아버님 안녕하세요. 구청장배 대회 일정 공지드립니다.` },
      { who: '코치 박정우', time: '오전 10:16', text: `${fmt.md(match)} 오전 8시까지 ○○구민체육센터 정문으로 집결해 주세요. 경기는 9시 30분 시작입니다.` },
      { who: '코치 박정우', time: '오전 10:16', text: `대회 참가비 30,000원은 ${fmt.md(fee)}까지 회비 통장으로 입금 부탁드립니다. 준비물은 유니폼, 축구화, 정강이 보호대, 물입니다.` },
      { who: '예준맘', time: '오전 10:30', text: '네 코치님 확인했습니다!' },
      { who: '코치 박정우', time: '오전 10:42', text: '아 그리고 다음 주 수요일 연습은 쉽니다.' },
      { me: true, time: '오전 10:45', text: '넵 감사합니다~' },
    ],
  };
}

/* ───────────── 이미지·PDF 자료 ───────────── */
export const noticeImages = [
  { id: 'img-1', label: '생존수영 실기교육', src: 'assets/notices/notice-1.png' },
  { id: 'img-2', label: '학교폭력 예방 · 납입금', src: 'assets/notices/notice-2.png' },
  { id: 'img-3', label: '독서마라톤 대회', src: 'assets/notices/notice-3.png' },
  { id: 'img-4', label: '건강검진 안내', src: 'assets/notices/notice-4.png' },
  { id: 'img-5', label: '가온제 · 사진으로 찍은 통신문', src: 'assets/notices/notice-5.png' },
  { id: 'img-6', label: '스쿨존 · 기말고사 일정', src: 'assets/notices/notice-6.png' },
  { id: 'img-7', label: '수능 원서 접수', src: 'assets/notices/notice-7.png' },
  { id: 'img-8', label: '재난대응 안전훈련', src: 'assets/notices/notice-8.png' },
];

export const pdfDoc = {
  id: 'pdf', label: '학교 안내문 모음.pdf', file: 'assets/pdf/school-notices.pdf',
  pages: [
    '생존수영 및 수영실기교육 안내', '학교폭력 예방 · 2분기 납입금 정산', '독서마라톤 대회 및 도서관 이용',
    '1학년 건강검진 및 구강검진', '동아리 발표회 및 가온제', '스쿨존 안전 · 2차 지필평가 일정',
    '수능 응시원서 접수 안내', '재난대응 안전한국훈련 안내',
  ].map((title, i) => ({ n: i + 1, title, src: `assets/pdf/page-${i + 1}.jpg`, thumb: `assets/pdf/thumb-${i + 1}.jpg` })),
};

export const textSources = () => [chatParents(), chatClass(), chatSoccer(), classroomInfo(), classroomScience(), classroomTrip()];
