chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !['selection', 'openWorkspace'].includes(message.type)) return false;
  const open = async () => {
    if (message.type === 'openWorkspace') {
      const view = ['analyze', 'tasks', 'settings'].includes(message.payload?.view) ? message.payload.view : 'analyze';
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
  open().then(() => reply({ ok: true }), error => reply({ ok: false, error: error.message }));
  return true;
});
