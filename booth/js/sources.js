// 자료를 화면에 그리고, 문장 단위(.u)로 나눠 선택·근거 표시에 씁니다.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function splitSentences(text) {
  return text.split(/(?<=[.!?…~])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

const unitSpans = text => splitSentences(text).map(s => `<span class="u">${esc(s)}</span>`).join(' ');

/** 아직 .u로 감싸지지 않은 글자를 문장 단위로 감쌉니다. */
export function wrapUnits(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest('.u, .no-unit')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createElement('template');
    const lead = /^\s/.test(node.textContent) ? ' ' : '';
    const trail = /\s$/.test(node.textContent) ? ' ' : '';
    frag.innerHTML = lead + unitSpans(node.textContent) + trail;
    node.replaceWith(frag.content);
  }
}

const initials = name => name.replace(/^(담임|코치|반장)\s*/, '').slice(0, 1);
const hue = name => [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

export function renderSource(src) {
  const el = document.createElement('div');
  if (src.kind === 'paper') {
    el.className = 'src src-paper';
    el.innerHTML = `<article class="paper">${src.html}</article>`;
  } else if (src.kind === 'chat') {
    el.className = 'src src-chat';
    let last = null;
    const msgs = src.messages.map(m => {
      const cont = !m.me && last === m.who;
      last = m.me ? '__me' : m.who;
      if (m.me) return `<div class="msg me"><span class="time no-unit">${m.time}</span><p class="bubble">${unitSpans(m.text)}</p></div>`;
      return `<div class="msg${cont ? ' cont' : ''}">
        ${cont ? '<span class="avatar ghost"></span>' : `<span class="avatar no-unit" style="--h:${hue(m.who)}">${esc(initials(m.who))}</span>`}
        <div>${cont ? '' : `<span class="who no-unit">${esc(m.who)}</span>`}<div class="row"><p class="bubble">${unitSpans(m.text)}</p><span class="time no-unit">${m.time}</span></div></div>
      </div>`;
    }).join('');
    el.innerHTML = `<div class="chat">
      <header class="chat-top no-unit"><span class="chat-back">‹</span><strong>${esc(src.room)}</strong><span class="chat-count">${src.count}</span><span class="chat-icons">⌕ ☰</span></header>
      <div class="chat-body"><div class="chat-date no-unit">${esc(src.dateHeader)}</div>${msgs}</div>
      <footer class="chat-input no-unit"><span>＋</span><div>메시지 입력</div><span>#</span></footer>
    </div>`;
  } else if (src.kind === 'classroom') {
    el.className = 'src src-class';
    el.innerHTML = `<div class="cls" style="--c:${src.color}">
      <div class="cls-banner no-unit"><strong>${esc(src.className)}</strong><span>${esc(src.room)}</span></div>
      <article class="cls-post">
        <header class="no-unit"><span class="cls-icon">${src.type === '과제' ? '✎' : '◉'}</span><div><b>${esc(src.teacher)}</b><small>${esc(src.posted)} · ${src.type}</small></div>${src.due ? `<span class="cls-due">기한: ${esc(src.due)}</span>` : ''}</header>
        <h3>${unitSpans(src.title)}</h3>
        ${src.body.map(p => `<p>${unitSpans(p)}</p>`).join('')}
        ${src.type === '과제' ? '<div class="cls-attach no-unit"><span>PDF</span>수행평가 평가기준표.pdf</div>' : ''}
      </article>
      ${src.comments.length ? `<div class="cls-comments"><small class="no-unit">수업 댓글 ${src.comments.length}개</small>${src.comments.map(c => `<p><b class="no-unit">${esc(c.who)}</b> ${unitSpans(c.text)}</p>`).join('')}</div>` : ''}
    </div>`;
  }
  wrapUnits(el);
  el.querySelectorAll('.u').forEach((u, i) => { u.dataset.i = i; });
  return el;
}

/** AI에 보낼 텍스트 — 화면에 보이는 맥락(방 이름, 보낸 사람, 날짜)을 함께 담아요. */
export function sourceText(src, onlyUnits = null) {
  if (onlyUnits) return onlyUnits.map(u => u.textContent.trim()).join('\n');
  if (src.kind === 'chat') {
    return `[단체 대화방] ${src.room}\n${src.dateHeader}\n` + src.messages.map(m => `${m.me ? '나' : m.who} (${m.time}): ${m.text}`).join('\n');
  }
  if (src.kind === 'classroom') {
    return `[수업 게시판] ${src.className} · ${src.teacher} · 게시일 ${src.posted}\n${src.title}${src.due ? `\n기한: ${src.due}` : ''}\n` + src.body.join('\n') +
      (src.comments.length ? '\n\n댓글\n' + src.comments.map(c => `${c.who}: ${c.text}`).join('\n') : '');
  }
  if (src.kind === 'paper') {
    const tmp = document.createElement('div');
    tmp.innerHTML = src.html;
    tmp.querySelectorAll('tr').forEach(tr => tr.insertAdjacentText('beforeend', '\n'));
    tmp.querySelectorAll('td,th').forEach(td => td.insertAdjacentText('beforeend', ' | '));
    tmp.querySelectorAll('h3,h4,p,li,div,header,table').forEach(b => b.insertAdjacentText('beforeend', '\n'));
    return tmp.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  }
  return '';
}

/* 근거 문장과 화면 문장을 느슨하게 맞춥니다(띄어쓰기·기호 차이 무시). */
const norm = s => (s || '').replace(/[\s"'“”‘’()\[\]·.,:~\-]/g, '');
export function unitsForEvidence(root, evidence) {
  const ne = norm(evidence);
  if (ne.length < 4) return [];
  return [...root.querySelectorAll('.u')].filter(u => {
    const nu = norm(u.textContent);
    if (nu.length < 3) return false;
    if (ne.includes(nu) && nu.length >= 6) return true;
    if (nu.includes(ne)) return true;
    const w = Math.min(12, ne.length, nu.length);
    for (let i = 0; i + w <= ne.length; i += 3) if (nu.includes(ne.slice(i, i + w))) return true;
    return false;
  });
}
