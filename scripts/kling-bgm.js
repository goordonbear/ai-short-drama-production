#!/usr/bin/env node
/* =========================================================
   唯美 BGM 生成（可靈 Text-to-Audio API）
   每次最長 10 秒 → 生成後循環鋪成 60 秒
   官方文件：https://kling.ai/document-api/api/video/audio-generation/text-to-audio
   單價 0.25 單位/次

   用法：node kling-bgm.js
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

/* 專案目錄：預設為執行時的工作目錄（可用 DRAMA_DIR 環境變數覆寫） */
const DIR = process.env.DRAMA_DIR || process.cwd();
const BGM_DIR = path.join(DIR, 'bgm');
const BASE = 'https://api-singapore.klingai.com';

function readKey() {
  if (process.env.KLING_API_KEY) return process.env.KLING_API_KEY.trim();
  const c = path.join(DIR, '.kling.key');
  if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8').trim();
  console.error('找不到金鑰。請設定 KLING_API_KEY，或把金鑰放進 ./.kling.key');
  process.exit(1);
}
const KEY = readKey();

/* 唯美、溫柔、不搶戲；刻意要求無鼓聲、無明顯旋律高潮，方便循環 */
const TRACKS = [
  {
    id: 'warm',
    prompt: 'Beautiful aesthetic cinematic background music, warm tender solo piano with soft ' +
            'strings pad, gentle and romantic, slow tempo, no drums, no vocals, ' +
            'seamless ambient loop, very soft and unobtrusive'
  },
  {
    id: 'rain',
    prompt: 'Beautiful aesthetic cinematic background music, melancholic soft piano with warm ' +
            'cello, rainy night mood, bittersweet and gentle, slow tempo, no drums, ' +
            'no vocals, seamless ambient loop, very soft and unobtrusive'
  }
];

function req(method, pathStr, body) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'node' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(BASE + pathStr, { method, headers, timeout: 40000 }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, raw: b }); });
    });
    r.on('error', e => resolve({ status: 0, json: null, raw: String(e.code || e.message) }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null, raw: 'timeout' }); });
    if (data) r.write(data);
    r.end();
  });
}

function download(url, dest, d) {
  d = d || 0;
  return new Promise((resolve, reject) => {
    if (d > 5) return reject(new Error('太多重導'));
    https.get(url, { timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://kling.ai/' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return download(new URL(res.headers.location, url).href, dest, d + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const f = fs.createWriteStream(dest);
      res.pipe(f); f.on('finish', () => f.close(() => resolve(fs.statSync(dest).size))); f.on('error', reject);
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(BGM_DIR, { recursive: true });
  console.log('=== 生成唯美 BGM（每首 10 秒）===');
  for (const t of TRACKS) {
    const dest = path.join(BGM_DIR, t.id + '.mp3');
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(t.id + ' 已存在，略過'); continue;
    }
    const r = await req('POST', '/v1/audio/text-to-audio', { prompt: t.prompt.slice(0, 200), duration: 10 });
    if (r.status !== 200 || !r.json || r.json.code !== 0) {
      console.log('✗ ' + t.id + ' 送出失敗 ' + (r.json ? JSON.stringify(r.json.message) : String(r.raw).slice(0, 140)));
      continue;
    }
    const tid = r.json.data.task_id;
    console.log('■ ' + t.id + '  task ' + tid);
    let res = null;
    for (let i = 0; i < 60; i++) {
      const q = await req('GET', '/v1/audio/text-to-audio/' + tid);
      const d = q.json && q.json.data;
      if (d && (d.task_status === 'succeed' || d.task_status === 'failed')) { res = d; break; }
      await sleep(5000);
    }
    if (res && res.task_status === 'succeed') {
      const au = res.task_result.audios[0];
      const size = await download(au.url_mp3, dest);
      console.log('  ✓ ' + t.id + '.mp3  ' + (size / 1024).toFixed(0) + ' KB  長度 ' + au.duration_mp3 +
                  (res.final_unit_deduction ? '  計費 ' + res.final_unit_deduction : ''));
    } else {
      console.log('  ✗ ' + t.id + ' 失敗 ' + (res ? res.task_status + ' ' + (res.task_status_msg || '') : '逾時'));
    }
    await sleep(1000);
  }
  console.log('\n完成。BGM 在 ' + BGM_DIR);
})();
