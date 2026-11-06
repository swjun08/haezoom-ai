(() => {
  const version = chrome.runtime.getManifest?.().version || 'dev';
  if (globalThis.__haezoomCapture?.version === version && globalThis.__haezoomCapture.runtime === chrome.runtime) return;
  globalThis.__haezoomCapture?.dispose();
  document.dispatchEvent(new Event('haezoom-capture-replace'));
  document.querySelectorAll('[data-haezoom-capture]').forEach(element => element.remove());
  const lifecycle = new AbortController();
  let activeCleanup = () => {};
  let capturing = false;
  globalThis.__haezoomStartCapture = async () => {
    if (capturing) return;
    capturing = true;
    const hidden = [...document.querySelectorAll('[data-haezoom-launcher],[data-haezoom-helper]')].map(element => ({ element, visibility: element.style.visibility }));
    hidden.forEach(({ element }) => { element.style.visibility = 'hidden'; });
    let overlay; let controller;
    const cleanup = () => { overlay?.remove(); controller?.abort(); hidden.forEach(({ element, visibility }) => { element.style.visibility = visibility; }); capturing = false; };
    activeCleanup = cleanup;
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const response = await chrome.runtime.sendMessage({ type: 'captureViewport' });
      if (!response?.ok) throw new Error(response?.error || '화면을 가져오지 못했어요.');
      const image = new Image(); image.src = response.data; await image.decode();
      const viewport = { width: innerWidth, height: innerHeight };
      overlay = document.createElement('div'); overlay.setAttribute('data-haezoom-capture', '');
      overlay.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
      const shadow = overlay.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = ':host{color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.surface{position:fixed;inset:0;overflow:hidden;background:#14171f;font:14px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#fff;cursor:crosshair;touch-action:none;user-select:none}.screen{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.shade{position:absolute;inset:0;background:#14171f66;pointer-events:none}.region{position:absolute;border:2px solid white;box-shadow:0 0 0 9999px #14171f66;pointer-events:none}.bar{position:fixed;top:20px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);padding:12px 16px;border-radius:16px;background:#fff;color:#14171f;box-shadow:0 8px 40px #0003;display:flex;align-items:center;gap:14px;cursor:default;flex-wrap:wrap}.bar strong{font-size:14px}.bar small{display:block;font-size:11px;color:#6b7280}button{font:inherit;border:0;border-radius:10px;padding:9px 12px;cursor:pointer;background:#f3f4f6;color:#14171f}button:focus-visible{outline:2px solid #2298ff;outline-offset:3px}button:disabled{opacity:.4;cursor:default}.primary{background:#14171f;color:#fff}.size{position:absolute;bottom:8px;right:8px;background:#14171f;color:#fff;padding:3px 7px;border-radius:6px;font-size:11px}.preview{position:absolute;inset:0;padding:95px 24px 24px;display:flex;align-items:center;justify-content:center;background:#14171ff2;cursor:default}.preview img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}';
      const create = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
      const surface = create('div', '', 'surface'); surface.setAttribute('role', 'dialog'); surface.setAttribute('aria-label', '해줌 화면 영역 캡쳐'); surface.setAttribute('aria-modal', 'true');
      const screen = create('img', '', 'screen'); screen.src = response.data; screen.alt = '';
      const shade = create('div', '', 'shade'); const region = create('div', '', 'region'); region.hidden = true; const size = create('span', '', 'size'); region.append(size);
      const preview = create('div', '', 'preview'); preview.hidden = true; const previewImage = create('img'); previewImage.alt = '선택한 캡쳐 영역 미리보기'; preview.append(previewImage);
      const bar = create('div', '', 'bar'); const description = create('div'); const title = create('strong', '필요한 영역을 드래그해 주세요'); const hint = create('small', 'Esc 취소 · 현재 보이는 화면만 · 외부 전송 없음'); description.append(title, hint);
      const cancel = create('button', '취소'); cancel.type = 'button';
      const retry = create('button', '다시 선택'); retry.type = 'button'; retry.hidden = true;
      const confirm = create('button', '이 영역 미리보기', 'primary'); confirm.type = 'button'; confirm.disabled = true;
      bar.append(description, retry, cancel, confirm); surface.append(screen, shade, region, preview, bar); shadow.append(style, surface); document.documentElement.append(overlay);
      controller = new AbortController(); let start = null; let bounds = null; let cropped = null; let reviewing = false;
      const showReview = () => { cleanup(); globalThis.__haezoomShowReview({ image: cropped }); };
      const point = event => ({ x: Math.max(0, Math.min(innerWidth, event.clientX)), y: Math.max(0, Math.min(innerHeight, event.clientY)) });
      surface.addEventListener('pointerdown', event => { if (event.composedPath().includes(bar) || !preview.hidden || event.button !== 0) return; start = point(event); bounds = null; cropped = null; region.hidden = false; shade.hidden = true; region.style.width = region.style.height = '0px'; region.style.left = `${start.x}px`; region.style.top = `${start.y}px`; size.textContent = ''; confirm.disabled = true; surface.setPointerCapture(event.pointerId); event.preventDefault(); });
      surface.addEventListener('pointermove', event => { if (!start) return; const end = point(event); bounds = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }; Object.assign(region.style, { left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }); size.textContent = `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`; });
      surface.addEventListener('pointerup', event => { if (!start) return; start = null; if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId); confirm.disabled = !bounds || bounds.width < 20 || bounds.height < 20; title.textContent = confirm.disabled ? '조금 더 넓게 선택해 주세요' : '선택한 영역을 확인해 주세요'; });
      surface.addEventListener('pointercancel', () => { start = null; bounds = null; confirm.disabled = true; region.hidden = true; shade.hidden = false; });
      cancel.onclick = cleanup;
      retry.onclick = () => { preview.hidden = true; retry.hidden = true; region.hidden = true; shade.hidden = false; bounds = null; cropped = null; confirm.disabled = true; confirm.textContent = '이 영역 미리보기'; title.textContent = '필요한 영역을 드래그해 주세요'; };
      confirm.onclick = async () => {
        try {
          if (!cropped) {
            if (!bounds) return;
            const canvas = document.createElement('canvas');
            const scaleX = image.naturalWidth / viewport.width; const scaleY = image.naturalHeight / viewport.height;
            canvas.width = Math.round(bounds.width * scaleX); canvas.height = Math.round(bounds.height * scaleY);
            canvas.getContext('2d').drawImage(image, bounds.x * scaleX, bounds.y * scaleY, bounds.width * scaleX, bounds.height * scaleY, 0, 0, canvas.width, canvas.height);
            cropped = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
            previewImage.src = cropped; preview.hidden = false; retry.hidden = false; confirm.textContent = '이 캡쳐 가져오기'; title.textContent = '이 부분을 가져올까요?'; hint.textContent = '개인정보가 없는지 확인해 주세요 · 외부 전송 없음'; return;
          }
          showReview();
        } catch (error) { title.textContent = /context invalidated/i.test(error.message) ? '해줌이 업데이트되었어요. 취소한 뒤 페이지를 새로고침해 주세요.' : error.message; confirm.disabled = false; }
      };
      document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cleanup(); } if (event.key === 'Tab') { const controls = reviewing ? [...surface.querySelectorAll('button,textarea')].filter(element => !element.disabled && !element.closest('[hidden]')) : [retry, cancel, confirm].filter(element => !element.hidden && !element.disabled); const index = controls.indexOf(shadow.activeElement); event.preventDefault(); controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus(); } }, { capture: true, signal: controller.signal });
      window.addEventListener('resize', cleanup, { signal: controller.signal }); cancel.focus();
    } catch (error) { cleanup(); throw error; }
  };
  const listener = (message, sender, reply) => {
    if (message.type !== 'startCapture' || sender.id !== chrome.runtime.id) return false;
    globalThis.__haezoomStartCapture().then(() => reply({ ok: true }), error => reply({ ok: false, error: error.message })); return true;
  };
  const dispose = () => { activeCleanup(); lifecycle.abort(); try { chrome.runtime.onMessage.removeListener(listener); } catch {} delete globalThis.__haezoomStartCapture; delete globalThis.__haezoomCapture; };
  document.addEventListener('haezoom-capture-replace', dispose, { signal: lifecycle.signal });
  chrome.runtime.onMessage.addListener(listener);
  globalThis.__haezoomCapture = { version, runtime: chrome.runtime, dispose };
})();
