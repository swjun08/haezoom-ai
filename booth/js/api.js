// 해줌 AI 서버(Cloudflare Worker → Claude) 호출. 키는 서버에만 있어요.
import { validateAnalysis } from './core.mjs';

export const API_BASE = 'https://haezoom.sleepwhale.workers.dev';
const TIMEOUT = 95000;

export class AnalysisError extends Error {
  constructor(message, kind = 'error') { super(message); this.kind = kind; }
}

async function post(body, headers) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new AnalysisError('분석이 너무 오래 걸려 멈췄어요. 다시 눌러 주세요.', 'timeout');
    throw new AnalysisError('AI 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 'network');
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 429) throw new AnalysisError('잠깐 사이에 분석 요청이 몰렸어요. 10초 뒤에 다시 눌러 주세요.', 'busy');
  if (!response.ok) throw new AnalysisError(payload.error?.message || `AI 분석에 실패했어요 (${response.status}).`);
  const result = validateAnalysis(payload.result);
  return { result, ms: performance.now() - started };
}

export function analyzeText(text) {
  return post(JSON.stringify({ text: text.slice(0, 45000) }), { 'Content-Type': 'application/json' });
}

export function analyzeFile(blob, name = 'document') {
  const form = new FormData();
  form.append('file', blob, name);
  form.append('context', '');
  return post(form);
}

export async function analyzeImageUrl(url) {
  const blob = await (await fetch(url)).blob();
  const type = blob.type || (url.endsWith('.png') ? 'image/png' : 'image/jpeg');
  return analyzeFile(new Blob([blob], { type }), url.split('/').pop());
}

/** 화면에 보이는 이미지 일부(자연 해상도 좌표)를 잘라 PNG Blob으로 */
export async function cropImage(img, rect) {
  const scale = rect.w < 700 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.w * scale);
  canvas.height = Math.round(rect.h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  if (blob.size > 4.8 * 1024 * 1024) blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
  return { blob, url: canvas.toDataURL('image/jpeg', 0.8) };
}

export async function serverStatus() {
  try {
    const r = await fetch(`${API_BASE}/api/status`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return j.configured ? 'ok' : 'off';
  } catch { return 'down'; }
}
