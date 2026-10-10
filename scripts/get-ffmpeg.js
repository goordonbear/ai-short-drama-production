/* 下載 ffmpeg 靜態版到工作區（不走 winget，避免需要系統管理員權限） */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const OUT_DIR = path.join(process.cwd(), 'tools');
const ZIP = path.join(OUT_DIR, 'ffmpeg.zip');
const URLS = [
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
];

fs.mkdirSync(OUT_DIR, { recursive: true });

function download(url, dest, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 6) return reject(new Error('重新導向次數過多'));
    console.log('GET ' + url);
    https.get(url, { timeout: 60000, headers: { 'User-Agent': 'node' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return download(next, dest, depth + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0, lastTick = 0;
      const f = fs.createWriteStream(dest);
      res.on('data', c => {
        got += c.length;
        if (total && got - lastTick > 8 * 1024 * 1024) {
          lastTick = got;
          console.log('  ' + (got / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB');
        }
      });
      res.pipe(f);
      f.on('finish', () => { f.close(() => resolve(got)); });
      f.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('逾時')); });
  });
}

(async () => {
  try {
    if (fs.existsSync(ZIP) && fs.statSync(ZIP).size > 40 * 1024 * 1024) {
      console.log('壓縮檔已存在，略過下載');
    } else {
      let ok = false, lastErr;
      for (const u of URLS) {
        try {
          const n = await download(u, ZIP);
          console.log('下載完成 ' + (n / 1048576).toFixed(1) + ' MB');
          ok = true; break;
        } catch (e) { lastErr = e; console.log('  失敗：' + e.message); }
      }
      if (!ok) throw lastErr;
    }

    console.log('解壓縮…');
    try {
      /* Windows 內建 tar（bsdtar）可直接解 zip */
      execFileSync('tar', ['-xf', ZIP, '-C', OUT_DIR], { stdio: 'inherit' });
    } catch (e) {
      console.log('tar 解壓失敗，改用 PowerShell Expand-Archive');
      execFileSync('powershell', ['-NoProfile', '-Command',
        `Expand-Archive -LiteralPath '${ZIP}' -DestinationPath '${OUT_DIR}' -Force`], { stdio: 'inherit' });
    }

    /* 找出 ffmpeg.exe */
    let found = null;
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (found) return;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.toLowerCase() === 'ffmpeg.exe') found = p;
      }
    })(OUT_DIR);

    if (!found) { console.log('找不到 ffmpeg.exe'); process.exit(1); }
    console.log('FFMPEG=' + found);
    try {
      const out = execFileSync(found, ['-hide_banner', '-version'], { encoding: 'utf8' });
      console.log(out.split('\n')[0]);
      const enc = execFileSync(found, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
      ['libx264', 'aac', 'libass'].forEach(k =>
        console.log('  ' + k + ': ' + (enc.includes(k) ? 'OK' : '缺少')));
    } catch (e) { console.log('執行 ffmpeg 失敗：' + e.message); }
  } catch (e) {
    console.log('ERROR ' + e.message);
    process.exit(1);
  }
})();
