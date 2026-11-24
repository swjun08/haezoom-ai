import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../extension');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
for (const file of [
  ...(manifest.action.default_popup ? [manifest.action.default_popup] : []),
  manifest.background.service_worker,
  manifest.options_page.split('#')[0],
  ...Object.values(manifest.icons),
])
  await access(resolve(root, file));
await access(resolve(root, 'file-upload.css'));
for (const name of ['popup.html', 'workspace.html', 'capture-processor.html']) {
  const html = await readFile(resolve(root, name), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!match[1].includes('://')) await access(resolve(root, match[1].split('#')[0]));
  }
}
if (
  !manifest.permissions.includes('identity') ||
  manifest.oauth2?.scopes?.join(',') !== 'https://www.googleapis.com/auth/calendar.events'
)
  throw new Error('Google Calendar OAuth 권한 설정이 없습니다.');
if (!['alarms', 'notifications'].every(permission => manifest.permissions.includes(permission)))
  throw new Error('알림 권한이 없습니다.');
const pkg = JSON.parse(await readFile(resolve(root, '../package.json'), 'utf8'));
if (pkg.version !== manifest.version)
  throw new Error(`버전 불일치: package ${pkg.version} / manifest ${manifest.version}`);
if (!manifest.key) throw new Error('manifest key가 없어 확장 ID가 설치 경로마다 달라집니다.');
const clientPattern = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
if (!clientPattern.test(manifest.oauth2?.client_id || ''))
  throw new Error('Chrome 확장 OAuth client_id 형식이 올바르지 않습니다.');
const { GOOGLE_WEB_CLIENT_ID } = await import(resolve(root, 'google-config.mjs'));
if (GOOGLE_WEB_CLIENT_ID && !clientPattern.test(GOOGLE_WEB_CLIENT_ID))
  throw new Error('웹 OAuth client ID 형식이 올바르지 않습니다.');
console.log('Manifest, HTML assets, version, extension key and Calendar OAuth settings: OK');
