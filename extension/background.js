import { DEFAULT_REMINDERS, validateReminderSettings } from './reminders.mjs';
import { installReminderService } from './reminder-service.mjs';
import { analyzeImageDataUrl, analyzeText } from './api.mjs';
import { makeItems, validDate } from './core.mjs';
import {
  calendarDates,
  calendarFingerprint,
  calendarErrorMessage,
  removeGoogleEvent,
  eligibleForCalendar,
  GoogleCalendarError,
  syncGoogleEvent,
} from './calendar.mjs';
import { mergeItems, validateItem, importBackup } from './item-store.mjs';

installReminderService(chrome);
const globalOrigins = ['https://*/*', 'http://*/*'];
let globalQueue = Promise.resolve();
let storageQueue = Promise.resolve();
const ITEMS_KEY = 'haezoomItems';
const itemPatchFields = new Set([
  'title',
  'date',
  'originalDate',
  'confirmed',
  'completed',
  'needs_review',
  'action',
  'details',
  'notes',
  'documentSummary',
  'materials',
  'cost',
  'submission',
  'evidence',
  'kind',
  'time',
  'location',
  'source',
  'endDate',
  'endTime',
  'reminderEnabled',
]);
const extensionMessages = new Set([
  'getItems',
  'addItems',
  'updateItem',
  'deleteItem',
  'calendarStatus',
  'calendarConnect',
  'calendarDisconnect',
  'syncCalendar',
  'removeCalendarEvent',
  'getReminderSettings',
  'setReminderSettings',
  'testNotification',
  'importBackup',
]);
const supportedMessages = new Set([
  'selection',
  'openWorkspace',
  'captureViewport',
  'readCapture',
  'startCapture',
  'analyzeText',
  'analyzeImage',
  'enableGlobal',
  'disableGlobal',
  'saveAnalysis',
  'previewPdf',
  'openPdfUpload',
  ...extensionMessages,
]);

function inStorageQueue(work) {
  const result = storageQueue.then(work);
  storageQueue = result.catch(() => {});
  return result;
}

function requireWorkspace(sender) {
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('해줌 작업 화면에서 요청해 주세요.');
}

async function storedItems() {
  const stored = await chrome.storage.local.get(ITEMS_KEY);
  const items = stored[ITEMS_KEY] ?? [];
  if (!Array.isArray(items)) throw new Error('저장된 할 일 목록을 읽을 수 없습니다.');
  return items;
}

async function acquireCalendarToken(interactive = false) {
  if (!interactive && !(await chrome.storage.local.get('calendarEnabled')).calendarEnabled)
    throw new Error('Google 캘린더를 먼저 연결해 주세요.');
  try {
    const result = await chrome.identity.getAuthToken({ interactive, enableGranularPermissions: true });
    if (!result?.token) throw new Error('Google 인증 토큰이 없습니다.');
    if (result.grantedScopes && !result.grantedScopes.includes('https://www.googleapis.com/auth/calendar.events'))
      throw new Error('캘린더 일정 권한을 허용해 주세요.');
    return result.token;
  } catch (error) {
    if (!interactive) throw new Error('Google 연결이 만료됐어요. 다시 연결해 주세요.');
    const reason = String(error.message || '');
    if (/not signed in|not logged in/i.test(reason))
      throw new Error('Chrome 프로필에 Google 계정으로 로그인한 뒤 다시 연결해 주세요.');
    if (/bad client|invalid.client|client id|redirect|origin mismatch/i.test(reason))
      throw new Error(
        'Google 연결 설정과 현재 확장 ID가 맞지 않아요. 관리자에게 연결 문제 해결에 표시된 ID를 전달해 주세요.',
      );
    if (/did not approve|denied|cancel/i.test(reason))
      throw new Error('Google 연결이 취소됐어요. 필요할 때 다시 연결할 수 있어요.');
    if (/네트워크|network|connection|fetch/i.test(reason))
      throw new Error('Google에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    throw new Error('Google 연결을 완료하지 못했어요. ' + reason.slice(0, 250));
  }
}
let calendarQueue = Promise.resolve();
function calendarWork(work) {
  const result = calendarQueue.then(work);
  calendarQueue = result.catch(() => {});
  return result;
}
async function withCalendarToken(work) {
  let token = await acquireCalendarToken(false);
  try {
    return await work(token);
  } catch (error) {
    if (!(error instanceof GoogleCalendarError) || error.status !== 401) throw error;
    await chrome.identity.removeCachedAuthToken({ token });
    token = await acquireCalendarToken(false);
    return work(token);
  }
}
async function syncCalendarItems(itemIds) {
  const snapshot = await inStorageQueue(storedItems);
  const requested = new Set(itemIds);
  const selected = snapshot.filter(item => requested.has(item.id));
  const outcome = { synced: 0, skipped: 0, failed: [] };
  for (let item of selected) {
    if (!eligibleForCalendar(item)) {
      outcome.skipped++;
      continue;
    }
    try {
      const fingerprint = calendarFingerprint(item);
      // Persist a new deterministic generation before a retry after remote deletion.
      let result;
      try {
        result = await withCalendarToken(token => syncGoogleEvent(token, item));
      } catch (error) {
        if (error.status !== 410) throw error;
        item = await inStorageQueue(async () => {
          const items = await storedItems();
          const current = items.find(x => x.id === item.id);
          if (!current) throw new Error('삭제된 항목입니다.');
          current.calendarGeneration = (current.calendarGeneration || 0) + 1;
          await chrome.storage.local.set({ [ITEMS_KEY]: items });
          return structuredClone(current);
        });
        result = await withCalendarToken(token => syncGoogleEvent(token, item));
      }
      await inStorageQueue(async () => {
        const items = await storedItems();
        const current = items.find(x => x.id === item.id);
        if (current)
          Object.assign(current, {
            calendarEventId: result.id,
            calendarFingerprint: fingerprint,
            calendarSyncedAt: new Date().toISOString(),
          });
        await chrome.storage.local.set({ [ITEMS_KEY]: items });
      });
      outcome.synced++;
    } catch (error) {
      outcome.failed.push({ id: item.id, title: item.title, error: calendarErrorMessage(error) });
    }
  }
  outcome.items = await inStorageQueue(storedItems);
  return outcome;
}
function enableGlobal() {
  const work = globalQueue.then(async () => {
    if (!(await chrome.permissions.contains({ origins: globalOrigins }))) return false;
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (!scripts.some(script => script.id === 'hz-global'))
      await chrome.scripting.registerContentScripts([
        { id: 'hz-global', matches: globalOrigins, js: ['selection-helper.js'], runAt: 'document_idle' },
      ]);
    const oldIds = scripts
      .filter(script => script.id.startsWith('hz-') && script.id !== 'hz-global')
      .map(script => script.id);
    if (oldIds.length) await chrome.scripting.unregisterContentScripts({ ids: oldIds });
    const tabs = await chrome.tabs.query({ url: globalOrigins });
    await Promise.allSettled(
      tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] })),
    );
    return true;
  });
  globalQueue = work.catch(() => {});
  return work;
}
chrome.permissions.onAdded.addListener(() => {
  enableGlobal().catch(console.error);
});
async function reconnectAllowedPages() {
  if (await enableGlobal()) return;
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  const matches = [...new Set(scripts.filter(script => script.id.startsWith('hz-')).flatMap(script => script.matches))];
  if (await chrome.extension.isAllowedFileSchemeAccess()) matches.push('file:///*.pdf', 'file:///*.PDF');
  if (!matches.length) return;
  const tabs = await chrome.tabs.query({ url: matches });
  await Promise.allSettled(
    tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] })),
  );
}
chrome.runtime.onInstalled.addListener(() => {
  reconnectAllowedPages().catch(console.error);
  chrome.storage.session
    .get(null)
    .then(stored => {
      const legacy = Object.keys(stored).filter(
        key => key.startsWith('capture-') || ['pendingCapture', 'pendingSelection'].includes(key),
      );
      if (legacy.length) return chrome.storage.session.remove(legacy);
    })
    .catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  enableGlobal().catch(console.error);
});
let processorQueue = Promise.resolve();
function withProcessor(work) {
  const result = processorQueue.then(async () => {
    let timer;
    try {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (!contexts.length)
        await chrome.offscreen.createDocument({
          url: 'capture-processor.html',
          reasons: ['WORKERS', 'BLOBS'],
          justification: '선택한 문서와 이미지를 페이지 안에서 확인합니다.',
        });
      return await Promise.race([
        work(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('문서를 여는 데 시간이 오래 걸려요. 파일을 다시 선택해 주세요.')),
            90000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      try {
        await chrome.offscreen.closeDocument();
      } catch {}
    }
  });
  processorQueue = result.catch(() => {});
  return result;
}
let readingCapture = false;
async function readCapture(image) {
  if (readingCapture) throw new Error('다른 캡쳐의 글자를 읽고 있어요. 잠시 뒤 다시 눌러 주세요.');
  readingCapture = true;
  try {
    return await withProcessor(async () => {
      const result = await chrome.runtime.sendMessage({ type: 'processCapture', image });
      if (!result?.ok || typeof result.text !== 'string') throw new Error(result?.error || '글자를 읽지 못했어요.');
      return result.text.slice(0, 45000);
    });
  } finally {
    readingCapture = false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !supportedMessages.has(message.type)) return false;
  const open = async () => {
    if (message.type === 'previewPdf') {
      if (!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL('')))
        throw new Error('해줌에서 PDF를 선택해 주세요.');
      return withProcessor(async () => {
        const response = await chrome.runtime.sendMessage({ type: 'renderPdfPageInternal', payload: message.payload });
        if (!response?.ok) throw new Error(response?.error || 'PDF를 열지 못했어요.');
        return response.data;
      });
    }
    if (message.type === 'openPdfUpload') {
      const tabId = sender.url?.startsWith(chrome.runtime.getURL('')) ? message.payload?.tabId : sender.tab?.id;
      if (!Number.isInteger(tabId)) throw new Error('웹페이지에서 다시 열어 주세요.');
      await chrome.scripting.executeScript({ target: { tabId }, files: ['review.js'] });
      await chrome.tabs.sendMessage(tabId, { type: 'showPdfUpload' });
      return true;
    }
    if (message.type === 'saveAnalysis') {
      if (!sender.tab || !/^(https?|file):/.test(sender.tab.url || ''))
        throw new Error('해줌이 표시된 웹페이지에서 저장해 주세요.');
      const sourceUrl = new URL(sender.tab.url);
      const source = { title: sender.tab.title || '가져온 문서' };
      if (sourceUrl.protocol !== 'file:') source.url = `${sourceUrl.origin}${sourceUrl.pathname}`;
      const incoming = makeItems(message.payload?.result, source);
      if (typeof message.payload?.fileName === 'string') source.title = message.payload.fileName.slice(0, 500);
      if (message.payload?.confirmed === true)
        for (const item of incoming) {
          if (calendarDates(item) || (item.kind === 'task' && !item.date)) {
            item.confirmed = true;
            item.needs_review = false;
          }
        }
      return inStorageQueue(async () => {
        incoming.forEach(validateItem);
        const result = mergeItems(await storedItems(), incoming);
        await chrome.storage.local.set({ [ITEMS_KEY]: result.items });
        return result;
      });
    }
    if (extensionMessages.has(message.type)) {
      requireWorkspace(sender);
      if (message.type === 'getItems') return inStorageQueue(storedItems);
      if (message.type === 'addItems') {
        const incoming = message.payload?.items;
        if (!Array.isArray(incoming) || incoming.length > 100) throw new Error('저장할 항목 목록이 올바르지 않습니다.');
        incoming.forEach(validateItem);
        return inStorageQueue(async () => {
          const result = mergeItems(await storedItems(), incoming);
          await chrome.storage.local.set({ [ITEMS_KEY]: result.items });
          return result;
        });
      }
      if (message.type === 'updateItem') {
        const { id, patch, revision } = message.payload || {};
        if (
          typeof id !== 'string' ||
          !patch ||
          typeof patch !== 'object' ||
          Array.isArray(patch) ||
          Object.keys(patch).some(key => !itemPatchFields.has(key))
        )
          throw new Error('수정할 항목 정보가 올바르지 않습니다.');
        if (
          patch.title !== undefined &&
          (typeof patch.title !== 'string' || !patch.title.trim() || patch.title.length > 500)
        )
          throw new Error('제목을 확인해 주세요.');
        if (patch.date !== undefined && patch.date !== null && !validDate(patch.date))
          throw new Error('날짜 형식이 올바르지 않습니다.');
        return inStorageQueue(async () => {
          const items = await storedItems();
          const item = items.find(entry => entry.id === id);
          if (!item) throw new Error('수정할 항목을 찾지 못했습니다.');
          if (revision !== undefined && revision !== item.revision)
            throw new Error('다른 창에서 수정된 항목이에요. 최신 내용을 다시 확인해 주세요.');
          Object.assign(item, structuredClone(patch), { revision: (item.revision || 0) + 1 });
          if (patch.confirmed !== undefined) item.needs_review = !patch.confirmed;
          validateItem(item);
          if (item.confirmed && (item.date || item.kind === 'schedule') && !calendarDates(item))
            throw new Error('정확한 날짜를 입력한 뒤 확인 완료해 주세요.');
          await chrome.storage.local.set({ [ITEMS_KEY]: items });
          return items;
        });
      }
      if (message.type === 'deleteItem') {
        const id = message.payload?.id;
        if (typeof id !== 'string') throw new Error('삭제할 항목 ID가 없습니다.');
        return inStorageQueue(async () => {
          const items = await storedItems();
          const remaining = items.filter(item => item.id !== id);
          if (remaining.length === items.length) throw new Error('삭제할 항목을 찾지 못했습니다.');
          await chrome.storage.local.set({ [ITEMS_KEY]: remaining });
          return remaining;
        });
      }
      if (message.type === 'getReminderSettings')
        return {
          settings: (await chrome.storage.local.get('reminderSettings')).reminderSettings || DEFAULT_REMINDERS,
          permission: await chrome.notifications.getPermissionLevel(),
        };
      if (message.type === 'setReminderSettings') {
        const settings = validateReminderSettings(message.payload);
        const old = (await chrome.storage.local.get('reminderSettings')).reminderSettings;
        settings.enabledAt = settings.enabled ? (old?.enabled ? old.enabledAt : Date.now()) : 0;
        await chrome.storage.local.set({ reminderSettings: settings });
        return settings;
      }
      if (message.type === 'testNotification') {
        await chrome.notifications.create('haezoom:test', {
          type: 'basic',
          iconUrl: 'icon.png',
          title: '해줌 알림이 준비됐어요',
          message: '확인한 할 일의 마감 전에 이렇게 알려드려요.',
        });
        return true;
      }
      if (message.type === 'importBackup')
        return inStorageQueue(async () => {
          const incoming = importBackup(message.payload);
          let items = await storedItems();
          let added = 0;
          for (let i = 0; i < incoming.length; i += 100) {
            const result = mergeItems(items, incoming.slice(i, i + 100));
            items = result.items;
            added += result.added;
          }
          await chrome.storage.local.set({ [ITEMS_KEY]: items });
          return { items, added };
        });
      if (message.type === 'calendarStatus') {
        try {
          await acquireCalendarToken(false);
          return { connected: true };
        } catch {
          return { connected: false };
        }
      }
      if (message.type === 'calendarConnect') {
        await acquireCalendarToken(true);
        await chrome.storage.local.set({ calendarEnabled: true });
        return { connected: true };
      }
      if (message.type === 'calendarDisconnect')
        return calendarWork(async () => {
          let token;
          try {
            token = await acquireCalendarToken(false);
          } catch {}
          await chrome.storage.local.set({ calendarEnabled: false });
          if (token) await chrome.identity.removeCachedAuthToken({ token });
          await chrome.identity.clearAllCachedAuthTokens();
          if (token) {
            try {
              await fetch('https://oauth2.googleapis.com/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token }),
                signal: AbortSignal.timeout(10000),
              });
            } catch {}
          }
          return { connected: false };
        });
      if (message.type === 'syncCalendar') {
        const ids = message.payload?.itemIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string'))
          throw new Error('등록할 항목을 1~100개 선택해 주세요.');
        return calendarWork(() => syncCalendarItems(ids));
      }
      if (message.type === 'removeCalendarEvent')
        return calendarWork(async () => {
          const item = (await inStorageQueue(storedItems)).find(x => x.id === message.payload?.id);
          if (!item) throw new Error('항목을 찾지 못했어요.');
          await withCalendarToken(token => removeGoogleEvent(token, item));
          return inStorageQueue(async () => {
            const items = await storedItems();
            const current = items.find(x => x.id === item.id);
            if (current) {
              delete current.calendarEventId;
              delete current.calendarFingerprint;
              delete current.calendarSyncedAt;
              current.calendarGeneration = (current.calendarGeneration || 0) + 1;
            }
            await chrome.storage.local.set({ [ITEMS_KEY]: items });
            return items;
          });
        });
    }
    if (message.type === 'analyzeImage') {
      const image = message.payload?.image;
      if (!sender.tab || typeof image !== 'string' || image.length > 12 * 1024 * 1024)
        throw new Error('분석할 캡쳐 이미지를 확인해 주세요.');
      return analyzeImageDataUrl(image, message.payload?.context || '');
    }
    if (message.type === 'analyzeText') {
      if (!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL('')))
        throw new Error('확장 프로그램에서 분석을 시작해 주세요.');
      if (sender.tab && !/^(https?|file):/.test(sender.tab.url || ''))
        throw new Error('웹페이지에서 분석을 시작해 주세요.');
      return analyzeText(message.payload?.text, message.payload?.layoutText || '');
    }
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
      const requestedTabId = message.payload?.tabId;
      if (requestedTabId !== undefined && (!Number.isInteger(requestedTabId) || requestedTabId < 0))
        throw new Error('캡쳐할 탭 정보를 확인해 주세요.');
      if (sender.tab && requestedTabId !== undefined && requestedTabId !== sender.tab.id)
        throw new Error('현재 페이지에서 캡쳐를 시작해 주세요.');
      const [active] = sender.tab ? [] : await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = sender.tab || (requestedTabId !== undefined ? await chrome.tabs.get(requestedTabId) : active);
      if (!tab?.id || !/^(https?|file):/.test(tab.url || ''))
        throw new Error('웹페이지 또는 PDF 파일에서 캡쳐해 주세요.');
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['review.js', 'capture.js'] });
      } catch {
        throw new Error(
          '이 탭에 캡쳐 도구를 실행할 수 없습니다. 웹페이지를 새로고침하거나 PDF 파일 접근 권한을 확인해 주세요.',
        );
      }
      let result;
      try {
        result = await chrome.tabs.sendMessage(tab.id, { type: 'startCapture' });
      } catch {
        throw new Error('캡쳐 도구가 페이지에서 응답하지 않습니다. 페이지를 새로고침하고 다시 눌러 주세요.');
      }
      if (!result?.ok) throw new Error(result?.error || '캡쳐를 시작하지 못했어요.');
      return;
    }
    if (message.type === 'captureViewport') {
      if (!sender.tab?.id) throw new Error('캡쳐할 페이지를 찾지 못했어요.');
      const [active] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
      if (active?.id !== sender.tab.id) throw new Error('캡쳐를 시작한 탭으로 돌아와 주세요.');
      try {
        return await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
      } catch {
        throw new Error('크롬 상단의 해줌 아이콘을 누른 뒤 ‘화면 캡처’를 선택해 주세요.');
      }
    }
    if (message.type === 'readCapture') {
      const image = message.payload?.image;
      if (
        !sender.tab ||
        typeof image !== 'string' ||
        !image.startsWith('data:image/png;base64,') ||
        image.length > 8 * 1024 * 1024
      )
        throw new Error('캡쳐 영역이 너무 커요. 더 작은 영역을 골라 주세요.');
      return readCapture(image);
    }
    if (message.type === 'openWorkspace') {
      const view = ['home', 'analyze', 'tasks', 'calendar', 'settings', 'upload'].includes(message.payload?.view)
        ? message.payload.view
        : 'analyze';
      const url = chrome.runtime.getURL(`workspace.html#${view}`);
      const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('workspace.html*') });
      if (tabs[0]?.id) {
        await chrome.tabs.update(tabs[0].id, { url, active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      } else await chrome.tabs.create({ url });
      return;
    }
    const text = message.payload?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 45000)
      throw new Error('분석할 내용을 45,000자 이내로 선택해 주세요.');
    const [active] = sender.tab ? [] : await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = sender.tab || active;
    if (!tab?.id || !/^(https?|file):/.test(tab.url || '')) throw new Error('공지 웹페이지에서 문장을 선택해 주세요.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['review.js'] });
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'showSelectionReview', payload: { text } });
    if (!result?.ok) throw new Error(result?.error || '내용 확인 창을 열지 못했어요.');
  };
  open().then(
    data => reply({ ok: true, data }),
    error => reply({ ok: false, error: error.message }),
  );
  return true;
});

chrome.action.onClicked.addListener(async tab => {
  try {
    if (!tab.id || !/^(https?|file):/.test(tab.url || '')) throw new Error();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'showHelperMenu', anchor: 'toolbar' });
  } catch {
    const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('workspace.html*') });
    if (tabs[0]?.id) {
      await chrome.tabs.update(tabs[0].id, { url: chrome.runtime.getURL('workspace.html#home'), active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    } else await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html#home') });
  }
});
