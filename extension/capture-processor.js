import { extractText } from './ocr.mjs';
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message.type !== 'processCapture') return false;
  (async () => {
    if (typeof message.image !== 'string' || !message.image.startsWith('data:image/png;base64,') || message.image.length > 8 * 1024 * 1024) throw new Error('캡쳐 영역을 더 작게 선택해 주세요.');
    const blob = await (await fetch(message.image)).blob();
    return extractText(new File([blob], '화면 캡쳐.png', { type: 'image/png' }));
  })().then(text => reply({ ok: true, text }), () => reply({ ok: false, error: '글자를 읽지 못했어요. 인터넷 연결과 이미지 선명도를 확인해 주세요.' }));
  return true;
});
