// 팀원 배포용 압축 파일 만들기: dist/haezoom-ai-extension-<버전>.zip
// 압축을 풀면 haezoom-ai-extension 폴더 하나가 나오고, 그 폴더를 chrome://extensions에서 바로 로드합니다.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'extension/manifest.json'), 'utf8'));
const work = mkdtempSync(resolve(tmpdir(), 'haezoom-package-'));
const folder = resolve(work, 'haezoom-ai-extension');
cpSync(resolve(root, 'extension'), folder, {
  recursive: true,
  filter: source => !/(^|\/)(\.DS_Store|.*\.pem)$/.test(source),
});
mkdirSync(resolve(root, 'dist'), { recursive: true });
const output = resolve(root, 'dist', `haezoom-ai-extension-${version}.zip`);
rmSync(output, { force: true });
execFileSync('zip', ['-qrX', output, 'haezoom-ai-extension'], { cwd: work });
rmSync(work, { recursive: true, force: true });
console.log(`dist/haezoom-ai-extension-${version}.zip`);
