(() => {
  const version = chrome.runtime.getManifest?.().version || 'dev';
  if (globalThis.__haezoomReview?.version === version && globalThis.__haezoomReview.runtime === chrome.runtime) return;
  globalThis.__haezoomReview?.dispose();
  document.dispatchEvent(new Event('haezoom-review-replace'));
  document.querySelectorAll('[data-haezoom-review]').forEach(element => element.remove());
  const lifecycle = new AbortController();
  let closeCurrent = () => {};
  const create = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  /** 2026-11-27 → 11월 27일 (금) */
  const readableDate = iso => {
    const d = new Date(iso + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) return iso;
    const thisYear = new Date().getFullYear() === d.getUTCFullYear();
    return `${thisYear ? '' : d.getUTCFullYear() + '년 '}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
  };
  globalThis.__haezoomShowReview = ({ image, text: initialText = '', pdf = false }) => {
    closeCurrent();
    const demoMission = document.querySelector('meta[name="haezoom-demo"]')?.content;
    const demoEnabled = ['select', 'capture', 'date', 'pdf'].includes(demoMission);
    // Send only a coarse step to the opt-in demo page; never expose source, results or notes.
    const demoProgress = step => {
      if (demoEnabled)
        document.dispatchEvent(
          new CustomEvent('haezoom-demo-progress', { detail: JSON.stringify({ mission: demoMission, step }) }),
        );
    };
    let pdfData = null,
      pdfPages = 0,
      pdfPage = 1,
      fileName = '',
      loading = false;
    let mediaControls = [];
    const controller = new AbortController();
    const previousFocus = document.activeElement;
    const hidden = [...document.querySelectorAll('[data-haezoom-helper],[data-haezoom-launcher]')].map(element => ({
      element,
      visibility: element.style.visibility,
    }));
    hidden.forEach(({ element }) => {
      element.style.visibility = 'hidden';
    });
    const host = create('div');
    host.setAttribute('data-haezoom-review', '');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const cleanup = () => {
      demoProgress('closed');
      controller.abort();
      host.remove();
      hidden.forEach(({ element, visibility }) => {
        element.style.visibility = visibility;
      });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    closeCurrent = cleanup;
    const style = create('style');
    style.textContent =
      ':host{color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#14171f88;font:14px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#14171f;letter-spacing:-.025em}.review{display:flex;flex-direction:column;width:min(1000px,calc(100vw - 32px));height:min(640px,calc(100dvh - 32px));overflow:hidden;border-radius:24px;background:white;box-shadow:0 16px 80px #0005}.review header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #eceef1;flex-shrink:0}.brand{font-weight:750;font-size:18px}.review main{display:flex;flex-direction:column;flex:1;min-height:0;padding:20px 24px;gap:12px}h2{font-size:23px;line-height:1.4;margin:0}p{font-size:12px;color:#6b7280;margin:0}.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;flex:1;min-height:0}.columns.text-only{grid-template-columns:1fr}.pane{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0}label,.pane strong{font-weight:650;font-size:12px}.image-wrap{flex:1;min-height:0;background:#f3f4f6;border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:auto}.image-wrap img{display:block;width:100%;height:100%;min-height:0;object-fit:contain}textarea{width:100%;flex:1;min-height:0;resize:none;font:14px/1.7 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#14171f;background:#f6f7f9;border:1px solid #dfe2e8;border-radius:12px;padding:14px;user-select:text}button{font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:10px;background:#f3f4f6;color:#14171f;padding:10px 14px}button:disabled{opacity:.45;cursor:wait}button:focus-visible,textarea:focus-visible{outline:2px solid #2298ff;outline-offset:2px}.primary{background:#14171f;color:white}.close{width:34px;height:34px;padding:0;font-size:24px;border-radius:50%}.actions{display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0}[role=status]{min-height:20px;flex-shrink:0;white-space:pre-wrap}.note{font-size:11px;flex-shrink:0}@media(max-width:640px){.review{width:calc(100vw - 16px);height:calc(100dvh - 16px);border-radius:18px}.review main{padding:14px;gap:10px}.review header{padding:12px 16px}h2{font-size:19px}.columns{grid-template-columns:1fr;grid-template-rows:minmax(0,.8fr) minmax(0,1.2fr);gap:12px}.columns.text-only{grid-template-rows:1fr}.image-pane .image-wrap{min-height:50px}.note{font-size:10px}.actions button{padding:8px 10px;font-size:12px}}';
    const backdrop = create('div', '', 'backdrop');
    const panel = create('section', '', 'review');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', pdf ? 'PDF 가져오기' : image ? '캡쳐한 내용 확인' : '선택한 내용 확인');
    const header = create('header');
    const brand = create('strong', '', 'brand');
    brand.append(create('span', 'h.', 'brand-mark'), document.createTextNode('해줌 AI'));
    header.append(brand);
    const exit = create('button', '×', 'close');
    exit.setAttribute('aria-label', '확인 창 닫기');
    exit.onclick = cleanup;
    const workspace = create('button', '내 할 일 · 일정', 'header-link');
    workspace.onclick = () => chrome.runtime.sendMessage({ type: 'openWorkspace', payload: { view: 'home' } });
    header.append(workspace, exit);
    const body = create('main');
    const heading = create('h2', pdf ? 'PDF 가져오기' : image ? '캡쳐한 내용' : '선택한 내용');
    const demoTip = demoEnabled
      ? create(
          'p',
          demoMission === 'pdf'
            ? '파일과 페이지를 선택한 뒤 ‘할 일 정리하기’를 눌러보세요.'
            : '가져온 내용을 확인한 뒤 ‘할 일 정리하기’를 눌러보세요.',
          'demo-tip',
        )
      : null;
    if (demoTip) {
      demoTip.style.cssText =
        'padding:9px 13px;border-radius:10px;background:#edf5f0;color:#3c6953;font-size:12px;line-height:1.6;flex-shrink:0;';
    }
    const fitStyle = create('style');
    fitStyle.textContent =
      '.review{position:relative}.image-wrap{overflow:hidden}.image-wrap img{object-fit:contain;object-position:center}.image-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}.image-heading button{padding:4px 8px;font-size:11px}.zoom-view{position:absolute;inset:10px;z-index:2;border-radius:18px;background:white;display:flex;flex-direction:column;overflow:hidden}.zoom-view header{padding:10px 14px}.zoom-view .image-wrap{margin:12px;min-height:0}.zoom-view h3{font-size:15px;margin:0}';
    shadow.append(fitStyle);
    const zoom = create('section', '', 'zoom-view');
    zoom.hidden = true;
    zoom.setAttribute('aria-label', '캡쳐 전체 이미지');
    const zoomHeader = create('header');
    zoomHeader.append(create('h3', '캡쳐 전체 이미지'));
    const zoomBack = create('button', '돌아가기');
    zoomHeader.append(zoomBack);
    const zoomImageWrap = create('div', '', 'image-wrap');
    const zoomImage = create('img');
    zoomImage.alt = '선택한 캡쳐 영역 전체 보기';
    if (image) zoomImage.src = image;
    zoomImageWrap.append(zoomImage);
    zoom.append(zoomHeader, zoomImageWrap);
    const columns = create('div', '', `columns${image || pdf ? '' : ' text-only'}`);
    const status = create('p', '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const editor = create('div', '', 'pane');
    const label = create('label', image || pdf ? '추가 요청 사항 (선택)' : '가져온 내용');
    label.htmlFor = 'haezoom-review-text';
    const text = create('textarea');
    text.id = label.htmlFor;
    text.maxLength = 45000;
    text.placeholder =
      image || pdf ? '표나 특정 항목에서 특히 확인할 내용이 있으면 적어 주세요.' : '내용을 확인하고 수정해 주세요.';
    text.value = initialText;
    const copy = create('button', '내용 복사');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text.value);
        status.textContent = '내용을 복사했어요.';
      } catch {
        text.focus();
        text.select();
        status.textContent = '내용을 선택했어요. ⌘C 또는 Ctrl+C로 복사해 주세요.';
      }
    };
    const analysisOutput = create('section');
    analysisOutput.hidden = true;
    analysisOutput.setAttribute('aria-live', 'polite');
    analysisOutput.style.cssText =
      'flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;overflow:hidden;background:#fff;';
    const tabs = create('div', '', 'review-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '내용 확인 단계');
    const originalTab = create('button', '가져온 내용');
    const resultTab = create('button', '정리한 결과');
    resultTab.disabled = true;
    for (const b of [originalTab, resultTab]) {
      b.setAttribute('role', 'tab');
      tabs.append(b);
    }
    const selectTab = result => {
      heading.textContent = result ? '할 일 · 일정 확인' : pdf ? 'PDF 가져오기' : image ? '캡쳐한 내용' : '선택한 내용';
      columns.hidden = result;
      analysisOutput.hidden = !result;
      originalTab.setAttribute('aria-selected', String(!result));
      resultTab.setAttribute('aria-selected', String(result));
    };
    originalTab.onclick = () => selectTab(false);
    resultTab.onclick = () => selectTab(true);
    selectTab(false);
    const tabStyle = create('style');
    tabStyle.textContent =
      '.review{border:1px solid #dfe2e8;border-radius:28px}.review-tabs{display:flex;padding:4px;background:#f2f3f6;border-radius:99px;gap:4px}.review-tabs button{flex:1;border-radius:99px;background:none;color:#727b89}.review-tabs [aria-selected=true]{background:#fff;color:#14171f;box-shadow:0 2px 4px #0001}.review header{border:0;padding:20px 24px 10px}.review main{padding-top:10px}.review main>h2{font-size:18px}.review p{line-height:1.8}.review article{padding:14px!important;border:1px solid #e5e7eb!important;border-radius:16px;margin-top:10px}.review .result-select{display:flex;gap:10px;align-items:center}.review input[type=checkbox]{accent-color:#14171f;width:16px;height:16px}.review .close{background:transparent;color:#727b89}.review .primary{border-radius:99px}';
    tabStyle.textContent +=
      '.result-select strong{font-size:16px;line-height:1.5}.result-facts{display:grid;grid-template-columns:64px minmax(0,1fr);gap:6px 12px;margin:14px 0}.result-facts dt{color:#727b89;font-size:12px}.result-facts dd{margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.result-memo{display:block;color:#444b56;font-size:12px}.result-memo textarea{display:block;height:62px;min-height:62px;margin-top:6px;font-size:13px;line-height:1.6;padding:10px 12px;resize:vertical}.review .analysis-summary{background:#f5f7f9;padding:12px 16px;border-radius:12px;color:#4a5565;font-size:13px;line-height:1.7}.review article{margin-top:12px}.result-fields{display:flex;gap:8px;margin:10px 0 0 26px}.result-fields select,.result-fields input{padding:7px 10px;font:12px -apple-system,sans-serif;color:#333;border:1px solid #e4e7eb;border-radius:8px;background:#f6f7f9;min-width:0}.review details{font-size:12px;color:#707784;margin-top:10px}.review summary{cursor:pointer}.review [role=status]:empty{display:none}.review main>.note{display:none}.review input[type=file]{font-size:12px;width:100%}.review .actions{align-items:center}.review select:focus-visible,.review input:focus-visible{outline:2px solid #2298ff}';
    shadow.append(tabStyle);
    const renderAnalysis = result => {
      const entries = [
        ...result.tasks.map(x => ({ ...x, kind: 'task' })),
        ...result.schedules.map(x => ({ ...x, kind: 'schedule' })),
      ];
      const chosen = new Set(entries);
      let active = entries[0];
      const layout = create('div', '', 'result-layout'),
        listPane = create('aside', '', 'result-list-pane'),
        itemList = create('div', '', 'result-list'),
        detailPane = create('div', '', 'result-detail');
      listPane.append(create('h3', '등록할 항목'), itemList);
      const overview = create('details', '', 'document-overview');
      overview.append(create('summary', '공지 전체 요약'), create('p', result.summary));
      listPane.append(overview);
      layout.append(listPane, detailPane);
      const footer = create('div', '', 'result-footer'),
        count = create('span'),
        save = create('button', '확인하고 저장', 'primary');
      // 저장 버튼 옆 'Google 캘린더' 알약: 켜 두면 저장할 때 Google 캘린더에도 등록합니다(설정은 기억됨).
      const gcal = create('button', 'Google 캘린더', 'pill-toggle');
      gcal.setAttribute('aria-pressed', 'false');
      chrome.runtime
        .sendMessage({ type: 'getCalendarAutoSync' })
        .then(r => gcal.setAttribute('aria-pressed', String(Boolean(r?.ok && r.data.enabled))))
        .catch(() => {});
      gcal.onclick = async () => {
        const next = gcal.getAttribute('aria-pressed') !== 'true';
        gcal.disabled = true;
        if (next) status.textContent = 'Google 로그인 창이 열리면 계정을 선택해 주세요.';
        try {
          const r = await chrome.runtime.sendMessage({ type: 'setCalendarAutoSync', payload: { enabled: next } });
          if (!r?.ok) throw new Error(r?.error || 'Google 캘린더를 연결하지 못했어요.');
          gcal.setAttribute('aria-pressed', String(r.data.enabled));
          status.textContent = '';
        } catch (error) {
          status.textContent = error.message;
        } finally {
          gcal.disabled = false;
        }
      };
      footer.append(gcal, count, save);
      analysisOutput.replaceChildren(layout, footer);
      const normalize = value => {
        if (typeof value !== 'string') return '';
        const iso = value.match(/^(20\d{2}-\d{2}-\d{2})$/);
        if (iso) return iso[1];
        const match = value.match(
          /^(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*\([^)]*\))?(?:\s*(?:오전|오후)\s*\d{1,2}시(?:\s*\d{1,2}분)?)?$/,
        );
        return match ? match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0') : '';
      };
      const updateCount = () => {
        const tasks = [...chosen].filter(x => x.kind === 'task').length;
        count.textContent = chosen.size
          ? '할 일 ' + tasks + '개 · 일정 ' + (chosen.size - tasks) + '개 저장'
          : '저장할 항목을 선택해 주세요.';
        save.disabled = !chosen.size;
      };
      const renderList = () => {
        itemList.replaceChildren();
        for (const item of entries) {
          const row = create('div', '', 'result-list-row' + (item === active ? ' active' : ''));
          const checkbox = create('input');
          checkbox.type = 'checkbox';
          checkbox.checked = chosen.has(item);
          checkbox.setAttribute('aria-label', item.title + ' 저장 선택');
          checkbox.onchange = () => {
            checkbox.checked ? chosen.add(item) : chosen.delete(item);
            updateCount();
          };
          const open = create('button', '', 'result-item');
          open.setAttribute('aria-current', String(item === active));
          const date = normalize(item.kind === 'task' ? item.deadline : item.date);
          open.append(
            create('span', item.kind === 'task' ? '할 일' : '일정', 'result-kind ' + item.kind),
            create('strong', item.title),
            create('small', date ? readableDate(date) : '날짜 확인 필요', date ? '' : 'uncertain'),
          );
          open.onclick = () => {
            active = item;
            renderList();
            renderDetail();
          };
          row.append(checkbox, open);
          itemList.append(row);
        }
        updateCount();
      };
      const renderDetail = () => {
        detailPane.replaceChildren();
        if (!active) {
          detailPane.append(create('h3', '저장할 항목이 없어요'), create('p', '다른 공지나 문서를 가져와 주세요.'));
          return;
        }
        const item = active;
        const title = create('input', '', 'result-title');
        title.value = item.title;
        title.maxLength = 500;
        title.setAttribute('aria-label', '항목 제목');
        title.onchange = () => {
          if (title.value.trim()) item.title = title.value.trim();
          else title.value = item.title;
          renderList();
        };
        detailPane.append(title);
        const meta = create('div', '', 'result-meta'),
          kind = create('div', '', 'kind-switch');
        kind.setAttribute('aria-label', '등록 위치');
        for (const [value, label] of [
          ['task', '할 일'],
          ['schedule', '일정'],
        ]) {
          const b = create('button', label);
          b.setAttribute('aria-pressed', String(item.kind === value));
          b.onclick = () => {
            if (item.kind === value) return;
            item.kind = value;
            item.action = item.action || item.details || item.title;
            item.details = item.details || item.action || item.title;
            item.materials = item.materials || [];
            item.cost = item.cost ?? null;
            item.submission = item.submission ?? null;
            item.location = item.location ?? null;
            item.time = item.time ?? null;
            item.deadline = item.deadline ?? item.date ?? null;
            item.date = item.date ?? item.deadline ?? null;
            renderList();
            renderDetail();
          };
          kind.append(b);
        }
        const dateLabel = create('label', item.kind === 'task' ? '마감일' : '시작일', 'result-date'),
          date = create('input');
        date.type = 'date';
        date.setAttribute('aria-label', item.title + ' 날짜');
        const original = item.kind === 'task' ? item.deadline : item.date;
        date.value = normalize(original);
        date.oninput = () => {
          item.deadline = item.date = date.value || null;
          renderList();
        };
        dateLabel.append(date);
        meta.append(kind, dateLabel);
        detailPane.append(meta);
        if (!date.value) {
          const warning = create(
            'p',
            original ? '원문 날짜 · ' + original : '날짜가 정해지면 입력해 주세요.',
            'date-notice',
          );
          const hints = original ? (globalThis.haezoomDateHints?.suggestDates(original) ?? []) : [];
          if (hints.length) {
            warning.append(create('span', ' · 오늘 기준으로 계산하면', 'date-hint-copy'));
            const chips = create('span', '', 'date-hints');
            for (const hint of hints) {
              const chip = create('button', hint.label, 'date-hint');
              chip.type = 'button';
              chip.setAttribute('aria-label', hint.label + '로 날짜 넣기');
              chip.onclick = () => {
                date.value = hint.date;
                date.oninput();
                warning.remove();
                date.focus();
              };
              chips.append(chip);
            }
            warning.append(chips);
          }
          detailPane.append(warning);
        }
        const facts = create('dl', '', 'result-facts');
        for (const [name, value] of [
          ['내용', item.action || item.details],
          ['준비물', item.materials?.join(', ')],
          ['비용', item.cost != null ? (item.cost === 0 ? '무료' : item.cost.toLocaleString() + '원') : ''],
          ['제출 방법', item.submission],
          ['시간', item.time],
          ['장소', item.location],
        ])
          if (value) facts.append(create('dt', name), create('dd', value));
        detailPane.append(facts);
        const memoLabel = create('label', '내 메모', 'result-memo'),
          memo = create('textarea');
        memo.rows = 3;
        memo.maxLength = 5000;
        memo.value = item.notes || '';
        memo.placeholder = '준비 상황이나 기억할 내용을 적어 주세요.';
        memo.setAttribute('aria-label', item.title + ' 메모');
        memo.oninput = () => {
          item.notes = memo.value;
        };
        memoLabel.append(memo);
        detailPane.append(memoLabel);
        const evidence = create('details', '', 'result-evidence');
        evidence.append(create('summary', '원문 근거'), create('p', item.evidence));
        detailPane.append(evidence);
        detailPane.scrollTop = 0;
      };
      renderList();
      renderDetail();
      demoProgress('analyzed');
      if (demoTip)
        demoTip.textContent =
          demoMission === 'date'
            ? '원문 근거에서 날짜를 확인해 보세요. 정확하지 않다면 비워 두고 내 메모에 확인할 내용을 적으세요.'
            : demoMission === 'capture'
              ? '왼쪽 항목을 하나씩 눌러 마감일과 제출 방법을 비교해 보세요. 확인한 내용만 저장하세요.'
              : '왼쪽에서 할 일과 일정을 번갈아 눌러보세요. 준비물을 확인하고 내 메모에 준비 상황을 남겨보세요.';
      save.onclick = async () => {
        save.disabled = true;
        try {
          const selected = [...chosen];
          const response = await chrome.runtime.sendMessage({
            type: 'saveAnalysis',
            payload: {
              result: {
                summary: result.summary,
                tasks: selected.filter(x => x.kind === 'task'),
                schedules: selected.filter(x => x.kind === 'schedule'),
              },
              confirmed: true,
              fileName: fileName ? fileName + ' · ' + pdfPage + '페이지' : undefined,
            },
          });
          if (!response?.ok) throw new Error(response?.error || '저장하지 못했어요.');
          demoProgress('saved');
          if (demoTip) demoTip.hidden = true;
          const success = create('div', '', 'save-success');
          success.append(
            create('span', '✓', 'success-icon'),
            create('h2', response.data.added ? '저장했어요' : '이미 저장한 내용이에요'),
            ...(response.data.calendar
              ? [
                  create(
                    'p',
                    response.data.calendar.failed
                      ? 'Google 캘린더 등록은 실패했어요. ' + (response.data.calendar.error || '')
                      : response.data.calendar.synced
                        ? 'Google 캘린더에도 등록했어요.'
                        : '날짜가 정해지면 Google 캘린더에 등록돼요.',
                  ),
                ]
              : []),
          );
          const actions = create('div', '', 'actions');
          const done = create('button', '이 페이지 계속 보기', 'primary');
          done.onclick = cleanup;
          const open = create('button', '내 할 일 · 일정 열기');
          open.onclick = () => chrome.runtime.sendMessage({ type: 'openWorkspace', payload: { view: 'home' } });
          actions.append(done, open);
          success.append(actions);
          analysisOutput.replaceChildren(success);
          status.textContent = '';
        } catch (error) {
          save.disabled = false;
          status.textContent = error.message;
        }
      };
      resultTab.disabled = false;
      selectTab(true);
      resultTab.focus();
    };
    const analyze = create('button', '할 일 정리하기', 'primary');
    analyze.onclick = async () => {
      const value = text.value.trim();
      if (!image && !value) {
        status.textContent = '분석할 원문을 입력해 주세요.';
        text.focus();
        return;
      }
      if (value.length > 45000) {
        status.textContent = '원문은 45,000자 이내여야 해요.';
        return;
      }
      // 버튼 옆에 전송 안내를 늘 보여 주므로, 버튼을 누르는 것이 전송 동의입니다(별도 확인 창 없음).
      analyze.disabled = true;
      analyze.textContent = '정리하는 중…';
      panel.setAttribute('aria-busy', 'true');
      text.disabled = true;
      mediaControls.forEach(x => (x.disabled = true));
      status.textContent = image ? '선택한 페이지를 분석하고 있어요.' : '원문을 전송하고 분석하고 있어요.';
      try {
        const response = await chrome.runtime.sendMessage(
          image
            ? { type: 'analyzeImage', payload: { image, context: value } }
            : { type: 'analyzeText', payload: { text: value } },
        );
        if (!response?.ok) throw new Error(response?.error || '분석에 실패했어요.');
        renderAnalysis(response.data);
        status.textContent = '';
      } catch (error) {
        status.textContent = /context invalidated/i.test(error.message)
          ? '해줌이 업데이트되었어요. 창을 닫고 페이지를 새로고침해 주세요.'
          : `분석에 실패했어요. ${error.message}`;
      } finally {
        analyze.disabled = false;
        analyze.textContent = '할 일 정리하기';
        panel.removeAttribute('aria-busy');
        text.disabled = false;
        if (mediaControls.length) {
          mediaControls[0].disabled = false;
          mediaControls[1].disabled = pdfPage <= 1;
          mediaControls[2].disabled = pdfPage >= pdfPages;
        }
      }
    };
    text.addEventListener('input', () => {
      analysisOutput.replaceChildren();
      resultTab.disabled = true;
      selectTab(false);
    });
    const editActions = create('div', '', 'actions edit-footer');
    const disclosure = create(
      'span',
      image || pdf ? '이미지가 해줌 서버를 거쳐 AI로 전송돼요.' : '내용이 해줌 서버를 거쳐 AI로 전송돼요.',
      'send-note',
    );
    editActions.append(disclosure, copy, analyze);
    if (image || pdf) {
      const memo = create('details', '', 'optional-memo');
      memo.append(create('summary', '분석 요청 추가'), label, text);
      editActions.replaceChildren(disclosure, analyze);
      editor.append(memo, editActions);
      columns.classList.add('media-mode');
    } else editor.append(label, text, editActions);
    if (image || pdf) {
      const imagePane = create('div', '', 'pane image-pane');
      const imageHeading = create('div', '', 'image-heading');
      imageHeading.append(create('strong', pdf ? 'PDF 미리보기' : '캡쳐한 부분'));
      const enlarge = create('button', '크게 보기 ↗');
      enlarge.onclick = () => {
        zoom.hidden = false;
        zoomBack.focus();
      };
      zoomBack.onclick = () => {
        zoom.hidden = true;
        enlarge.focus();
      };
      imageHeading.append(enlarge);
      imagePane.append(imageHeading);
      const imageWrap = create('div', '', 'image-wrap');
      const screenshot = create('img');
      if (image) screenshot.src = image;
      screenshot.alt = pdf ? '선택한 PDF 페이지' : '선택한 캡쳐 영역';
      screenshot.hidden = !image;
      imageWrap.append(screenshot);
      const read = create('button', '캡쳐한 글자 읽기', 'primary');
      if (pdf) {
        imageWrap.hidden = true;
        imageHeading.hidden = true;
        editor.hidden = true;
        const picker = create('label', '', 'pdf-picker');
        const pickerTitle = create('strong', 'PDF 선택');
        picker.append(pickerTitle, create('span', '파일을 선택하면 미리 볼 수 있어요.'));
        const upload = create('input');
        upload.type = 'file';
        upload.accept = 'application/pdf';
        upload.setAttribute('aria-label', 'PDF 파일 선택');
        picker.append(upload);
        const controls = create('div', '', 'actions');
        const prev = create('button', '이전'),
          next = create('button', '다음'),
          counter = create('span', 'PDF를 선택해 주세요.');
        controls.append(prev, counter, next);
        prev.disabled = next.disabled = true;
        controls.hidden = true;
        mediaControls = [upload, prev, next];
        const showPage = async number => {
          if (loading) return;
          loading = true;
          upload.disabled = true;
          analyze.disabled = true;
          prev.disabled = next.disabled = true;
          status.textContent = '페이지를 불러오고 있어요.';
          try {
            const r = await chrome.runtime.sendMessage({
              type: 'previewPdf',
              payload: { data: pdfData, page: number },
            });
            if (!r?.ok) throw new Error(r?.error);
            pdfPage = number;
            pdfPages = r.data.pages;
            image = r.data.image;
            screenshot.src = image;
            screenshot.hidden = false;
            imageWrap.hidden = false;
            imageHeading.hidden = false;
            editor.hidden = false;
            controls.hidden = false;
            picker.classList.add('loaded');
            pickerTitle.textContent = fileName;
            zoomImage.src = image;
            counter.textContent = number + ' / ' + pdfPages + '페이지';
            analysisOutput.replaceChildren();
            resultTab.disabled = true;
            selectTab(false);
            status.textContent = '';
          } catch (e) {
            status.textContent = e.message;
          } finally {
            loading = false;
            upload.disabled = false;
            analyze.disabled = !image;
            prev.disabled = pdfPage <= 1;
            next.disabled = pdfPage >= pdfPages;
          }
        };
        upload.onchange = async () => {
          const file = upload.files[0];
          if (!file) return;
          image = null;
          screenshot.hidden = true;
          imageWrap.hidden = true;
          imageHeading.hidden = true;
          editor.hidden = true;
          controls.hidden = true;
          analyze.disabled = true;
          resultTab.disabled = true;
          analysisOutput.replaceChildren();
          selectTab(false);
          if (file.size > 20 * 1024 * 1024) {
            status.textContent = '20MB 이하 PDF를 선택해 주세요.';
            return;
          }
          fileName = file.name;
          const reader = new FileReader();
          reader.onload = () => {
            pdfData = reader.result;
            showPage(1);
          };
          reader.onerror = () => {
            status.textContent = '파일을 읽지 못했어요. 다시 선택해 주세요.';
          };
          reader.readAsDataURL(file);
        };
        prev.onclick = () => showPage(pdfPage - 1);
        next.onclick = () => showPage(pdfPage + 1);
        imagePane.append(picker, controls);
        analyze.disabled = true;
      }
      imagePane.append(imageWrap);
      columns.append(imagePane);
    }
    columns.append(editor);
    body.append(heading, tabs, columns, analysisOutput, status);
    const resultStyle = create('style');
    resultStyle.textContent = `
.review{height:min(700px,calc(100dvh - 32px))}.review main{gap:14px}.review-tabs{flex-shrink:0}.result-layout{display:grid;grid-template-columns:230px minmax(0,1fr);flex:1;min-height:0;border:1px solid #e5e8ed;border-radius:18px;overflow:hidden}.result-list-pane{min-width:0;min-height:0;display:flex;flex-direction:column;background:#f7f8fa;padding:16px 12px;border-right:1px solid #e5e8ed}.result-list-pane h3{font-size:12px;color:#747d8b;font-weight:600;margin:0 8px 12px}.result-list{overflow:auto;min-height:0;flex:1}.result-list-row{display:flex;gap:8px;align-items:flex-start;padding:10px 8px;margin-bottom:5px;border:1px solid transparent;border-radius:12px}.result-list-row.active{background:#fff;border-color:#dbe1e8;box-shadow:0 2px 4px #1c233008}.result-list-row>input{flex-shrink:0;margin:5px 0 0}.result-item{padding:0!important;background:transparent!important;text-align:left;min-width:0;flex:1;font-weight:400}.result-item strong{display:block;font-size:14px;line-height:1.55;margin:4px 0 5px;overflow-wrap:anywhere}.result-item small{font-size:11px;color:#7b8491}.result-item .uncertain{color:#98702b}.result-kind{font-size:10px;padding:2px 6px;border-radius:5px;display:inline-block;color:#4770a3;background:#edf3fc}.result-kind.schedule{color:#407e69;background:#eaf4ef}.result-detail{padding:20px 22px;overflow:auto;min-height:0;min-width:0}.result-title{display:block;width:100%;font:650 18px/1.5 -apple-system,"Apple SD Gothic Neo",sans-serif;border:0;background:transparent;color:#171b23;padding:0 0 12px;border-radius:0}.result-title:focus{outline:0!important;border-bottom:1px solid #98b6d4}.result-meta{display:flex;align-items:flex-end;gap:16px;margin:0 0 18px;flex-wrap:wrap}.kind-switch{display:flex;background:#f0f2f5;padding:3px;border-radius:99px;gap:2px}.kind-switch button{font-size:12px;font-weight:500;padding:7px 15px;border-radius:99px;background:transparent;color:#7a8290}.kind-switch [aria-pressed=true]{background:white;color:#1b1f27;box-shadow:0 1px 4px #0001}.result-date{font-size:11px;font-weight:500;color:#7a8290;display:grid;gap:4px}.result-date input{font:12px -apple-system,sans-serif;padding:7px 10px;border:1px solid #e2e6ec;border-radius:8px;background:#fff;color:#242b35;min-height:33px}.result-detail .date-notice{background:#fff7e9;color:#8b6728;padding:8px 10px;border-radius:8px;font-size:12px;margin:-4px 0 16px}.date-hints{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.date-hint{font:600 12px -apple-system,"Apple SD Gothic Neo",sans-serif;padding:6px 11px;border-radius:99px;background:#fff;color:#5c4314;border:1px solid #ecd3a3}.date-hint:hover{background:#fff1d6}.result-detail .result-facts{grid-template-columns:60px minmax(0,1fr);gap:9px 12px;margin:0 0 20px}.result-detail .result-facts dd{font-size:14px;line-height:1.7}.result-memo{border-top:1px solid #edf0f4;padding-top:16px}.result-memo textarea{height:78px;min-height:78px;resize:vertical;max-height:180px;background:#f8f9fb;border-color:#e5e8ed}.result-evidence{margin-top:14px!important}.result-evidence p,.document-overview p{font-size:12px;line-height:1.7;margin-top:8px}.document-overview{padding:12px 8px 0;border-top:1px solid #e4e8ee;max-height:35%;overflow:auto;flex-shrink:0}.document-overview summary{font-size:11px}.pill-toggle{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 14px 0 10px;border-radius:99px;background:#fff;color:#69717e;box-shadow:inset 0 0 0 1px #e5e8ed;font-size:13px;font-weight:600;margin-right:auto}
.pill-toggle::before{content:'';width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1.6px #c5cad2;flex-shrink:0}
.pill-toggle[aria-pressed=true]{color:#14171f;background:#eef5ff;box-shadow:inset 0 0 0 1px #b9d2f2}
.pill-toggle[aria-pressed=true]::before{box-shadow:none;background:#2f62a8 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 8.2l2.2 2.2 4.8-4.8' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/16px no-repeat}
.result-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px;flex-shrink:0}.result-footer>span{font-size:12px;color:#697482}.result-footer .primary{min-height:42px;padding:11px 26px;font-size:14px}.save-success{display:flex;flex:1;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:14px;padding:24px}.success-icon{display:grid;place-items:center;background:#eaf5ef;color:#267a56;font-size:28px;width:58px;height:58px;border-radius:50%}.save-success .actions{margin-top:12px}@media(max-width:640px){.result-layout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.result-list-pane{padding:9px;border-right:0;border-bottom:1px solid #e5e8ed}.result-list-pane h3,.document-overview{display:none}.result-list{display:flex;gap:6px;overflow:auto;max-height:120px}.result-list-row{min-width:180px;max-width:220px;margin:0;flex-shrink:0;padding:8px}.result-detail{padding:16px}.result-meta{gap:12px}.result-footer>span{font-size:11px}.result-footer .primary{font-size:12px;padding:10px 18px}}
`;
    shadow.append(resultStyle);
    const mediaStyle = create('style');
    mediaStyle.textContent =
      '.columns.media-mode{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto;gap:12px}.media-mode>.pane:last-child{flex-direction:row;align-items:center;justify-content:space-between;gap:16px}.optional-memo{flex:1;margin:0!important}.optional-memo summary{font-size:12px;color:#707784}.optional-memo textarea{display:block;height:70px;min-height:70px;max-height:90px;margin-top:6px}.optional-memo label{display:none}.media-mode .actions{justify-content:flex-end}.pdf-picker{position:relative;border:1px dashed #d8dde5;background:#f7f8fa;border-radius:18px;min-height:180px;display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pdf-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.pdf-picker strong{font-size:17px}.pdf-picker span{font-size:12px;color:#7a8290}.pdf-picker.loaded{min-height:38px;flex:0;padding:8px 12px;align-items:flex-start;border-style:solid;background:white}.pdf-picker.loaded strong{font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pdf-picker.loaded span{display:none}.pdf-picker:focus-within{outline:2px solid #2298ff;outline-offset:2px}.review{width:min(900px,calc(100vw - 32px))}.image-pane>.actions{justify-content:center;font-size:12px}.image-pane>.actions button{padding:5px 10px;font-size:11px}.review header .brand{display:flex;align-items:center;gap:10px}.review .image-heading{flex-shrink:0}.media-mode>.image-pane{min-height:0}.review main>h2{margin-bottom:2px}';
    shadow.append(mediaStyle);
    const polishStyle = create('style');
    // 3.1 화면 정리: 주 버튼은 항상 오른쪽 아래, 단계 표시는 작게, 버튼 크기 통일
    polishStyle.textContent = `
.review:focus{outline:0}
.review header{padding:18px 24px 6px}
.brand{display:flex;align-items:center;gap:9px;font-size:16px}
.brand-mark{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:#14171f;color:#fff;font-size:14px;font-weight:800;letter-spacing:-.04em}
.header-link{margin-left:auto;margin-right:6px;background:#fff!important;box-shadow:inset 0 0 0 1px #e3e6eb;font-size:13px;min-height:34px;padding:0 12px;color:#3d4450;border-radius:9px}
.close{width:38px;height:38px;font-size:26px;font-weight:400}
.close:hover{background:#f1f3f5!important}
.review main>h2{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.columns.text-only label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.review main{padding-top:6px}
.review-tabs{align-self:flex-start;padding:3px;gap:2px}
.review-tabs button{flex:none;font-size:13px;padding:7px 16px;min-height:32px}
.review-tabs button:disabled{opacity:.5}
button{min-height:40px;padding:0 16px;font-size:14px;border-radius:10px}
.primary{border-radius:10px!important}
.edit-footer,.result-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-shrink:0;padding-top:4px}
.edit-footer .send-note{margin-right:auto;font-size:12px;color:#7a8290}
.edit-footer .primary,.result-footer .primary{min-height:44px;padding:0 24px;font-size:15px}
.columns.text-only textarea{flex:1;min-height:120px}
.result-item small{font-size:12px}
.result-detail .result-facts dt{font-size:12px}
.save-success .actions{justify-content:center}
.save-success .actions button{min-height:44px;padding:0 20px}
@media(max-width:640px){.edit-footer{flex-wrap:wrap}.edit-footer .send-note{width:100%}.header-link{display:none}}
`;
    shadow.append(polishStyle);
    panel.append(header, body, zoom);
    backdrop.append(panel);
    // 창 바깥(어두운 배경)을 누르면 닫습니다. 분석 중에는 닫지 않습니다.
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop && panel.getAttribute('aria-busy') !== 'true') cleanup();
    });
    shadow.prepend(style);
    shadow.append(backdrop);
    document.documentElement.append(host);
    if (demoTip) tabs.after(demoTip);
    demoProgress('opened');
    document.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!zoom.hidden) zoomBack.click();
          else cleanup();
        }
        if (event.key === 'Tab') {
          const controls = [
            ...(zoom.hidden ? panel : zoom).querySelectorAll('button,textarea,input,select,summary'),
          ].filter(element => !element.disabled && !element.closest('[hidden]') && element.getClientRects().length);
          const index = controls.indexOf(shadow.activeElement);
          event.preventDefault();
          controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
        }
      },
      { capture: true, signal: controller.signal },
    );
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
  };
  const listener = (message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message.type === 'showPdfUpload') {
      globalThis.__haezoomShowReview({ pdf: true });
      reply({ ok: true });
      return false;
    }
    if (message.type !== 'showSelectionReview') return false;
    const text = message.payload?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 45000) {
      reply({ ok: false, error: '선택한 내용을 확인해 주세요.' });
      return false;
    }
    globalThis.__haezoomShowReview({ text });
    reply({ ok: true });
    return false;
  };
  const dispose = () => {
    closeCurrent();
    lifecycle.abort();
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {}
    delete globalThis.__haezoomShowReview;
    delete globalThis.__haezoomReview;
  };
  document.addEventListener('haezoom-review-replace', dispose, { signal: lifecycle.signal });
  chrome.runtime.onMessage.addListener(listener);
  globalThis.__haezoomReview = { version, runtime: chrome.runtime, dispose };
})();
