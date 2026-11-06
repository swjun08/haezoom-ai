import { extractText } from './ocr.mjs';
const find = id => document.getElementById(id);
const notify = text => { find('status').textContent = text; };
const close = () => parent.postMessage({ type: 'haezoom-close-review' }, '*');
parent.postMessage({ type: 'haezoom-review-ready' }, '*');
find('close').onclick = close;
document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
let capture;
let busy = false;
find('read').onclick = async () => {
  if (!capture || busy) return;
  busy = true; find('read').disabled = true;
  try {
    const blob = await (await fetch(capture.image)).blob();
    const text = await extractText(new File([blob], '화면 캡쳐.png', { type: 'image/png' }), notify);
    find('editor').hidden = false; find('text').value = text.slice(0, 45000);
    notify(text.trim() ? '글자를 읽었어요. 원문과 비교해 틀린 부분을 수정해 주세요.' : '글자를 찾지 못했어요. 더 선명한 영역을 선택하거나 내용을 직접 입력해 주세요.');
    find('text').focus();
  } catch (error) { find('editor').hidden = false; notify(`글자를 읽지 못했어요. 다시 시도하거나 직접 입력해 주세요. ${error.message}`); }
  finally { busy = false; find('read').disabled = false; }
};
find('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(find('text').value); notify('내용을 복사했어요.'); }
  catch { find('text').focus(); find('text').select(); notify('내용을 선택했어요. ⌘C 또는 Ctrl+C로 복사해 주세요.'); }
};
find('analyze').onclick = () => notify('AI 분석은 아직 연결 전이에요. 지금은 읽어온 내용을 확인하고 수정할 수 있어요.');
try {
  const token = location.hash.slice(1);
  if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error();
  const key = `capture-${token}`;
  capture = (await chrome.storage.session.get(key))[key];
  await chrome.storage.session.remove(key);
  if (!capture?.image?.startsWith('data:image/png;base64,') || Date.now() - capture.created > 30 * 60 * 1000) throw new Error();
  find('preview').src = capture.image; find('preview').hidden = false; find('read').disabled = false;
  notify('캡쳐한 부분이 맞는지 확인한 뒤 글자 읽기를 눌러 주세요.');
} catch { notify('캡쳐한 화면을 불러오지 못했어요. 이 창을 닫고 다시 캡쳐해 주세요.'); }
