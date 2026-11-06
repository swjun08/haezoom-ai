chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !['selection', 'openWorkspace', 'captureViewport', 'captureResult', 'startCapture'].includes(message.type)) return false;
  const open = async () => {
    if (message.type === 'startCapture') {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = sender.tab || active;
      if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('일반 웹페이지에서 캡쳐해 주세요. PDF 파일은 PDF 업로드를 이용해 주세요.');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'startCapture' });
      if (!result?.ok) throw new Error(result?.error || '캡쳐를 시작하지 못했어요.');
      return;
    }
    if (message.type === 'captureViewport') {
      if (!sender.tab?.id) throw new Error('캡쳐할 페이지를 찾지 못했어요.');
      const [active] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
      if (active?.id !== sender.tab.id) throw new Error('캡쳐를 시작한 탭으로 돌아와 주세요.');
      try { return await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }); }
      catch { throw new Error('상단 해줌 아이콘에서 ‘현재 화면 캡쳐하기’를 눌러 시작해 주세요.'); }
    }
    if (message.type === 'captureResult') {
      const image = message.payload?.image;
      if (!sender.tab || typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 8 * 1024 * 1024) throw new Error('캡쳐 영역이 너무 커요. 더 작은 영역을 골라 주세요.');
      const url = new URL(sender.tab.url);
      await chrome.storage.session.set({ pendingCapture: { image, source: { title: sender.tab.title || '화면 캡쳐', url: url.origin + url.pathname } } });
      await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html#analyze') });
      return;
    }
    if (message.type === 'openWorkspace') {
      const view = ['analyze', 'tasks', 'settings', 'upload'].includes(message.payload?.view) ? message.payload.view : 'analyze';
      await chrome.tabs.create({ url: chrome.runtime.getURL(`workspace.html#${view}`) });
      return;
    }
    const text = message.payload?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 45000) throw new Error('분석할 내용을 45,000자 이내로 선택해 주세요.');
    const url = sender.tab?.url ? new URL(sender.tab.url) : null;
    const source = url ? { title: sender.tab.title || '선택한 공지', url: url.origin + url.pathname } : message.payload.source;
    await chrome.storage.session.set({ pendingSelection: { text, source } });
    await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html#analyze') });
  };
  open().then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
  return true;
});
