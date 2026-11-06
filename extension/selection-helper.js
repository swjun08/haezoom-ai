(() => {
  if (globalThis.__haezoomHelper) return;
  const controller = new AbortController();
  const host = document.createElement('div');
  host.setAttribute('data-haezoom-helper', '');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{color-scheme:light}*{box-sizing:border-box}.chip{display:flex;align-items:center;gap:8px;padding:6px;background:#fff;color:#14171f;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 5px 24px #14171f20;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}.main{background:#14171f;color:white;padding:10px 14px;border-radius:10px;border:0;font:inherit;cursor:pointer;white-space:nowrap}.main:disabled{opacity:.5}.count{color:#6b7280;font-size:11px;padding:0 5px}.close{border:0;background:#f3f4f6;color:#14171f;border-radius:8px;width:30px;height:32px;font:18px sans-serif;cursor:pointer}button:focus-visible{outline:2px solid #2298ff;outline-offset:2px}.hint{position:absolute;top:100%;left:5px;margin-top:5px;background:#fff;padding:4px 8px;border-radius:5px;font-size:11px;color:#6b7280;white-space:nowrap}';
  const chip = document.createElement('div'); chip.className = 'chip'; chip.setAttribute('role', 'group'); chip.setAttribute('aria-label', '해줌 선택 문장 도우미');
  const main = document.createElement('button'); main.className = 'main'; main.textContent = '해줌으로 정리 →'; main.type = 'button';
  const count = document.createElement('span'); count.className = 'count';
  const close = document.createElement('button'); close.className = 'close'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '선택 도우미 닫기');
  const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = '먼저 내용을 확인해요 · 자동 전송 없음';
  chip.append(main, count, close, hint); shadow.append(style, chip); document.documentElement.append(host);
  let selectedText = ''; let timer;
  const launcherHost = document.createElement('div');
  launcherHost.setAttribute('data-haezoom-launcher', '');
  launcherHost.style.cssText = 'all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483646;';
  const launcherShadow = launcherHost.attachShadow({ mode: 'closed' });
  const launcherStyle = document.createElement('style');
  launcherStyle.textContent = ':host{color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #2298ff;outline-offset:3px}.wrap{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;color:#14171f;letter-spacing:-.025em}.bubble{display:block;margin-left:auto;width:56px;height:56px;border:1px solid #ffffff50;border-radius:50%;background:#14171f;color:#fff;font-size:30px;font-weight:750;box-shadow:0 3px 8px #14171f1a,0 10px 30px #14171f26;transition:transform .15s}.bubble:hover{transform:translateY(-2px)}.bubble[aria-expanded=true]{background:#313641}.panel{position:absolute;right:0;bottom:70px;width:min(320px,calc(100vw - 40px));max-height:calc(100dvh - 120px);overflow:auto;padding:20px;border:1px solid #e5e7eb;border-radius:22px;background:#fff;box-shadow:0 10px 50px #14171f24}.top{display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:9px;font-weight:750;font-size:16px}.mini{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;color:white;background:#14171f;font-size:21px}.close{border:0;border-radius:50%;background:#f3f4f6;color:#6b7280;width:28px;height:28px;font-size:19px}h2{font-size:23px;line-height:1.4;letter-spacing:-.05em;margin:22px 0 8px}p{margin:0;color:#6b7280;font-size:12px}.selection{margin:16px 0 10px;padding:13px;border-radius:12px;background:#f3f4f6}.selection p{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.selection strong{display:block;font-size:11px;margin-bottom:6px}.action{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;border-radius:12px;padding:12px 14px;margin-top:7px;background:#f3f4f6;color:#14171f;text-align:left;font-size:13px;font-weight:600}.primary{background:#14171f;color:#fff}.action:disabled{opacity:.45;cursor:default}.foot{border-top:1px solid #e5e7eb;margin-top:18px;padding-top:12px}.hide{border:0;background:none;padding:6px 0 0;color:#6b7280;font-size:11px}.status{font-size:11px;color:#775413;margin-top:8px}.tag{font-size:10px;color:#6b7280;margin-top:4px}@media(max-width:480px){.panel{bottom:66px}.bubble{width:52px;height:52px}}@media(prefers-reduced-motion:reduce){.bubble{transition:none}}';
  const create = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
  const wrap = create('div', '', 'wrap');
  const panel = create('section', '', 'panel'); panel.hidden = true; panel.id = 'haezoom-menu'; panel.setAttribute('aria-label', '해줌 도우미 기능');
  const top = create('div', '', 'top'); const brand = create('div', '', 'brand'); brand.append(create('span', 'h.', 'mini'), create('span', '해줌 AI'));
  const dismiss = create('button', '×', 'close'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', '해줌 메뉴 닫기'); top.append(brand, dismiss);
  const introduction = create('p', '공지 속 할 일과 마감일을 한눈에 정리해요.'); introduction.style.marginTop = '16px';
  panel.append(top, introduction);
  const selectionPreview = create('div', '', 'selection'); const selectionLabel = create('strong', '선택한 문장'); const selectionText = create('p', '정리하고 싶은 문장을 드래그해 주세요.'); selectionPreview.append(selectionLabel, selectionText); panel.append(selectionPreview);
  const selectedAction = create('button', '선택한 내용 가져오기 →', 'action primary'); selectedAction.type = 'button'; selectedAction.disabled = true; panel.append(selectedAction);
  const menuStatus = create('p', '', 'status'); menuStatus.setAttribute('role', 'status');
  const openView = async view => {
    try { const response = await chrome.runtime.sendMessage({ type: 'openWorkspace', payload: { view } }); if (!response?.ok) throw new Error(); closeMenu(); }
    catch { menuStatus.textContent = '확장 아이콘에서 다시 열어 주세요.'; }
  };
  const uploadAction = create('button', 'PDF 업로드 ↗', 'action'); uploadAction.type = 'button'; uploadAction.onclick = () => openView('upload'); panel.append(uploadAction);
  const captureAction = create('button', '화면 캡쳐하기 ▣', 'action'); captureAction.type = 'button';
  captureAction.onclick = async () => {
    captureAction.disabled = true;
    try { const result = await chrome.runtime.sendMessage({ type: 'startCapture' }); if (!result?.ok) throw new Error(result?.error || '캡쳐를 시작하지 못했어요.'); closeMenu(); }
    catch (error) { menuStatus.textContent = error.message; }
    finally { captureAction.disabled = false; }
  };
  panel.append(captureAction);
  for (const [label, view] of [['내 할 일 둘러보기 ↗', 'tasks'], ['사용 안내 ↗', 'settings']]) {
    const action = create('button', label, 'action'); action.type = 'button'; action.onclick = () => openView(view); panel.append(action);
  }
  const foot = create('div', '', 'foot'); foot.append(create('p', '드래그만으로 내용을 전송하지 않아요.'));
  const hideLauncher = create('button', '이 페이지에서 버튼 숨기기', 'hide'); hideLauncher.type = 'button'; foot.append(hideLauncher); panel.append(menuStatus, foot);
  const launcher = create('button', 'h.', 'bubble'); launcher.type = 'button'; launcher.setAttribute('aria-label', '해줌 도우미 열기'); launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', panel.id); launcher.title = '해줌 도우미';
  wrap.append(panel, launcher); launcherShadow.append(launcherStyle, wrap); document.documentElement.append(launcherHost);
  launcher.style.touchAction = 'none';
  launcher.style.userSelect = 'none';
  launcher.style.cursor = 'grab';
  launcher.title = '해줌 도우미 · 끌어서 이동';
  let drag = null; let suppressClick = false; let customPosition = false;
  function placeMenu() {
    if (panel.hidden) return;
    const anchor = launcher.getBoundingClientRect();
    panel.style.position = 'fixed'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
    panel.style.maxHeight = `${Math.max(80, innerHeight - 24)}px`;
    const size = panel.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.right - size.width, innerWidth - size.width - 12));
    const top = anchor.top >= size.height + 24 ? anchor.top - size.height - 12 : Math.min(anchor.bottom + 12, innerHeight - size.height - 12);
    panel.style.left = `${left}px`; panel.style.top = `${Math.max(12, top)}px`;
  }
  function moveLauncher(left, top) {
    const size = launcher.getBoundingClientRect();
    launcherHost.style.right = 'auto'; launcherHost.style.bottom = 'auto';
    launcherHost.style.left = `${Math.max(8, Math.min(left, innerWidth - size.width - 8))}px`;
    launcherHost.style.top = `${Math.max(8, Math.min(top, innerHeight - size.height - 8))}px`;
    customPosition = true;
  }
  launcher.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const rect = launcher.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    suppressClick = false; launcher.setPointerCapture(event.pointerId); event.preventDefault();
  });
  launcher.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const deltaX = event.clientX - drag.x; const deltaY = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 6) return;
    drag.moved = true; closeMenu(); launcher.style.cursor = 'grabbing';
    moveLauncher(drag.left + deltaX, drag.top + deltaY);
  });
  const finishDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved; drag = null; launcher.style.cursor = 'grab';
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
  };
  launcher.addEventListener('pointerup', finishDrag);
  launcher.addEventListener('pointercancel', finishDrag);
  launcher.addEventListener('lostpointercapture', finishDrag);
  launcher.addEventListener('keydown', event => {
    if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); const rect = launcher.getBoundingClientRect();
      moveLauncher(rect.left + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), rect.top + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0)); placeMenu();
    }
  });
  window.addEventListener('resize', () => { if (customPosition) { const rect = launcher.getBoundingClientRect(); moveLauncher(rect.left, rect.top); } placeMenu(); }, { signal: controller.signal });
  function closeMenu() { panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-label', '해줌 도우미 열기'); }
  function syncPreview() {
    selectedAction.disabled = !selectedText || selectedText.length > 45000;
    selectionLabel.textContent = selectedText ? `선택한 문장 · ${selectedText.length.toLocaleString()}자` : '선택한 문장';
    selectionText.textContent = selectedText ? selectedText.slice(0, 240) : '정리하고 싶은 문장을 드래그해 주세요.';
    menuStatus.textContent = selectedText.length > 45000 ? '45,000자 이내로 선택해 주세요.' : '';
  }
  launcher.onclick = event => { if (suppressClick && event.detail !== 0) { suppressClick = false; return; } suppressClick = false; syncPreview(); panel.hidden = !panel.hidden; launcher.setAttribute('aria-expanded', String(!panel.hidden)); launcher.setAttribute('aria-label', panel.hidden ? '해줌 도우미 열기' : '해줌 도우미 닫기'); placeMenu(); };
  dismiss.onclick = () => { closeMenu(); launcher.focus(); };
  hideLauncher.onclick = () => { closeMenu(); launcherHost.style.display = 'none'; };
  selectedAction.addEventListener('pointerdown', event => event.preventDefault());
  selectedAction.onclick = () => main.click();
  document.addEventListener('pointerdown', event => { if (!event.composedPath().includes(launcherHost)) closeMenu(); }, { signal: controller.signal });
  launcherShadow.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); launcher.focus(); event.stopPropagation(); } });
  const hide = () => { host.style.display = 'none'; };
  const update = () => {
    if (shadow.activeElement || launcherShadow.activeElement) return;
    const active = document.activeElement;
    if (active?.matches('input,textarea,select') || active?.isContentEditable) { selectedText = ''; syncPreview(); return hide(); }
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || selection.anchorNode?.parentElement?.closest('input,textarea,[contenteditable="true"]')) { selectedText = ''; syncPreview(); return hide(); }
    selectedText = selection.toString().trim();
    if (selectedText.length < 5) { selectedText = ''; syncPreview(); return hide(); }
    syncPreview();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return hide();
    count.textContent = `${selectedText.length.toLocaleString()}자`; main.disabled = selectedText.length > 45000;
    hint.textContent = main.disabled ? '45,000자 이내로 선택해 주세요' : '먼저 내용을 확인해요 · 자동 전송 없음';
    host.style.display = 'block';
    const width = host.getBoundingClientRect().width;
    host.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
    host.style.top = `${Math.max(8, Math.min(rect.bottom + 10, innerHeight - 96))}px`;
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 160); };
  document.addEventListener('pointerup', schedule, { signal: controller.signal });
  document.addEventListener('keyup', event => { if (event.key === 'Escape') { hide(); closeMenu(); } else if (event.key === 'Shift' || event.shiftKey) schedule(); }, { signal: controller.signal });
  document.addEventListener('selectionchange', schedule, { signal: controller.signal });
  window.addEventListener('scroll', hide, { signal: controller.signal, capture: true });
  window.addEventListener('resize', hide, { signal: controller.signal });
  chip.addEventListener('pointerdown', event => event.preventDefault());
  close.onclick = () => { hide(); selectedText = ''; };
  main.onclick = async () => {
    main.disabled = true; main.textContent = '열고 있어요…';
    try {
      const response = await chrome.runtime.sendMessage({ type: 'selection', payload: { text: selectedText } });
      if (!response?.ok) throw new Error(response?.error || '확장을 다시 불러와 주세요.');
      hide(); closeMenu();
    } catch { hint.textContent = '확장 아이콘에서 다시 시도해 주세요.'; menuStatus.textContent = hint.textContent; }
    finally { main.disabled = false; main.textContent = '해줌으로 정리 →'; }
  };
  const disable = message => { if (message.type !== 'disableHelper') return; controller.abort(); clearTimeout(timer); host.remove(); launcherHost.remove(); chrome.runtime.onMessage.removeListener(disable); delete globalThis.__haezoomHelper; };
  chrome.runtime.onMessage.addListener(disable); globalThis.__haezoomHelper = true;
})();
