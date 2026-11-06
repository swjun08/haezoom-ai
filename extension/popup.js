const open = hash => chrome.tabs.create({ url: chrome.runtime.getURL(`workspace.html#${hash}`) });
const status = document.getElementById('status');
document.getElementById('tasks').onclick = () => open('tasks');
document.getElementById('upload').onclick = () => open('upload');
document.getElementById('settings').onclick = () => open('settings');
document.getElementById('capture').onclick = async () => {
  try { const result = await chrome.runtime.sendMessage({ type: 'startCapture' }); if (!result?.ok) throw new Error(result?.error); window.close(); }
  catch (error) { status.textContent = error.message || '캡쳐할 웹페이지를 열어 주세요.'; }
};
document.getElementById('selection').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('공지 웹페이지에서 문장을 드래그해 주세요.');
    const [selection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ text: window.getSelection()?.toString() || '', source: { title: document.title, url: location.origin + location.pathname } }) });
    const response = await chrome.runtime.sendMessage({ type: 'selection', payload: selection.result });
    if (!response.ok) throw new Error(response.error);
  } catch (error) { status.textContent = error.message; }
};
const helper = document.getElementById('helper');
let currentOrigin; let registrationId;
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('file:') || /\.pdf(?:[?#]|$)/i.test(tab?.url || '')) {
    status.textContent = 'PDF 화면에는 해줌 버튼이 표시되지 않아요. 아래 PDF 업로드로 문서를 선택해 주세요.';
    document.getElementById('upload').textContent = '이 PDF를 해줌에 업로드하기';
    document.getElementById('capture').disabled = true;
    document.getElementById('capture').title = '로컬 PDF는 PDF 업로드를 이용해 주세요.';
    document.getElementById('selection').disabled = true;
    throw new Error('PDF는 아래 업로드 버튼을 이용해 주세요.');
  }
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('일반 웹페이지에서 켤 수 있어요.');
  currentOrigin = new URL(tab.url).origin;
  registrationId = 'hz-' + [...new TextEncoder().encode(currentOrigin)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: [registrationId] });
  helper.textContent = registrations.length ? '이 사이트 해줌 버튼 끄기' : '이 사이트 해줌 버튼 켜기';
} catch (error) { helper.disabled = true; helper.textContent = error.message; }
helper.onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: [registrationId] });
    if (registrations.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [registrationId] });
      const tabs = await chrome.tabs.query({ url: `${currentOrigin}/*` });
      await Promise.allSettled(tabs.map(entry => chrome.tabs.sendMessage(entry.id, { type: 'disableHelper' })));
      await chrome.permissions.remove({ origins: [`${currentOrigin}/*`] });
      helper.textContent = '이 사이트 해줌 버튼 켜기'; status.textContent = '이 사이트의 드래그 도우미를 껐어요.';
    } else {
      if (!await chrome.permissions.request({ origins: [`${currentOrigin}/*`] })) return;
      await chrome.scripting.registerContentScripts([{ id: registrationId, matches: [`${currentOrigin}/*`], js: ['selection-helper.js'], runAt: 'document_idle' }]);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] });
      helper.textContent = '이 사이트 해줌 버튼 끄기'; status.textContent = '오른쪽 아래 동그란 해줌 버튼을 눌러 기능을 열어보세요. 문장 드래그도 지원해요.';
    }
  } catch { status.textContent = '이 페이지에서는 도우미를 켤 수 없어요. 복사해 직접 붙여 넣어 주세요.'; }
};
