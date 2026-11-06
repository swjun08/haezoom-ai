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
  const hide = () => { host.style.display = 'none'; };
  const update = () => {
    if (shadow.activeElement) return;
    const active = document.activeElement;
    if (active?.matches('input,textarea,select') || active?.isContentEditable) return hide();
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || selection.anchorNode?.parentElement?.closest('input,textarea,[contenteditable="true"]')) return hide();
    selectedText = selection.toString().trim();
    if (selectedText.length < 5) return hide();
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
  document.addEventListener('keyup', event => { if (event.key === 'Escape') hide(); else if (event.key === 'Shift' || event.shiftKey) schedule(); }, { signal: controller.signal });
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
      hide();
    } catch { hint.textContent = '확장 아이콘에서 다시 시도해 주세요.'; }
    finally { main.disabled = false; main.textContent = '해줌으로 정리 →'; }
  };
  const disable = message => { if (message.type !== 'disableHelper') return; controller.abort(); clearTimeout(timer); host.remove(); chrome.runtime.onMessage.removeListener(disable); delete globalThis.__haezoomHelper; };
  chrome.runtime.onMessage.addListener(disable); globalThis.__haezoomHelper = true;
})();
