const globalOrigins = ['https://*/*', 'http://*/*'];
let globalQueue = Promise.resolve();
function enableGlobal() {
  const work = globalQueue.then(async () => {
    if (!await chrome.permissions.contains({ origins: globalOrigins })) return false;
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (!scripts.some(script => script.id === 'hz-global')) await chrome.scripting.registerContentScripts([{ id: 'hz-global', matches: globalOrigins, js: ['selection-helper.js'], runAt: 'document_idle' }]);
    const oldIds = scripts.filter(script => script.id.startsWith('hz-') && script.id !== 'hz-global').map(script => script.id);
    if (oldIds.length) await chrome.scripting.unregisterContentScripts({ ids: oldIds });
    const tabs = await chrome.tabs.query({ url: globalOrigins });
    await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] })));
    return true;
  });
  globalQueue = work.catch(() => {}); return work;
}
chrome.permissions.onAdded.addListener(() => { enableGlobal().catch(console.error); });
chrome.runtime.onInstalled.addListener(() => { enableGlobal().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { enableGlobal().catch(console.error); });
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !['selection', 'openWorkspace', 'captureViewport', 'captureResult', 'startCapture', 'enableGlobal', 'disableGlobal'].includes(message.type)) return false;
  const open = async () => {
    if (message.type === 'enableGlobal' || message.type === 'disableGlobal') {
      if (!sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('확장 설정에서 변경해 주세요.');
      if (message.type === 'enableGlobal') return enableGlobal();
      await globalQueue;
      const scripts = await chrome.scripting.getRegisteredContentScripts();
      const ids = scripts.filter(script => script.id.startsWith('hz-')).map(script => script.id);
      if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
      const tabs = await chrome.tabs.query({ url: globalOrigins });
      await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'disableHelper' })));
      await chrome.permissions.remove({ origins: globalOrigins });
      return true;
    }
    if (message.type === 'startCapture') {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = sender.tab || active;
      if (!tab?.id || !/^(https?|file):/.test(tab.url || '')) throw new Error('웹페이지 또는 PDF 파일에서 캡쳐해 주세요.');
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
      await chrome.storage.session.set({ pendingCapture: { image, source: { title: sender.tab.title || '화면 캡쳐', url: url.protocol === 'file:' ? '' : url.origin + url.pathname } } });
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
    const source = url ? { title: sender.tab.title || '선택한 공지', url: url.protocol === 'file:' ? '' : url.origin + url.pathname } : message.payload.source;
    await chrome.storage.session.set({ pendingSelection: { text, source } });
    await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html#analyze') });
  };
  open().then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
  return true;
});
