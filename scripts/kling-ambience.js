#!/usr/bin/env node
/* =========================================================
   純環境音生成（不含配樂）
   目的：S2-S5 原本的環境音裡混了舊 BGM，要換成新的唯美 BGM 會衝突，
        所以只留 sound_effect_prompt、不給 bgm_prompt。
   S1/S6 已改用原生語音，不需要另外生成環境音。

   用法：node kling-ambience.js
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

/* 專案目錄：預設為執行時的工作目錄（可用 DRAMA_DIR 環境變數覆寫） */
const DIR = process.env.DRAMA_DIR || process.cwd();
const CLIPS = path.join(DIR, 'clips');
const BASE = 'https://api-singapore.klingai.com';

function readKey() {
  if (process.env.KLING_API_KEY) return process.env.KLING_API_KEY.trim();
  const c = path.join(DIR, '.kling.key');
  if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8').trim();
  console.error('找不到金鑰。請設定 KLING_API_KEY，或把金鑰放進 ./.kling.key');
  process.exit(1);
}
const KEY = readKey();

/* 只保留環境音效，不要配樂 */
const SFX = {
  S2: 'heavy rain pouring on asphalt, rain drumming on an umbrella, distant thunder, wet footsteps in a puddle, a kitten meowing softly',
  S3: 'a loud thunder crack, rain against a window, blanket rustling, a sharp surprised gasp, quiet bedroom room tone',
  S4: 'a cat purring loudly, cardboard box rustling, fast bare footsteps on a wooden floor, a cat hissing at running water, a small click',
  S5: 'a hairdryer blowing, water dripping in a tiled bathroom, soft purring, fabric rustling, calm quiet room tone'
};

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
  const state = JSON.parse(fs.readFileSync(path.join(DIR, 'state.json'), 'utf8'));
  const outFile = path.join(DIR, 'ambience-state.json');
  const ast = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { tasks: {} };

  for (const id of ['S2', 'S3', 'S4', 'S5']) {
    const rec = state.tasks[id];
    if (!rec || !rec.taskId) { console.log(id + ' 沒有影片紀錄，跳過'); continue; }
    if (ast.tasks[id] && ast.tasks[id].file && fs.existsSync(ast.tasks[id].file)) {
      console.log(id + ' 純環境音已存在，略過'); continue;
    }
    const t = await req('GET', '/tasks?task_ids=' + encodeURIComponent(rec.taskId));
    const task = t.json && t.json.data && t.json.data[0];
    const vids = ((task && task.outputs) || []).filter(o => o.type === 'video');
    if (!vids.length) { console.log(id + ' 查不到影片，跳過'); continue; }

    console.log('■ ' + id + ' 產生純環境音（不給 bgm_prompt）');
    const sub = await req('POST', '/v1/audio/video-to-audio', {
      video_id: vids[0].id,
      sound_effect_prompt: SFX[id].slice(0, 200)
      /* 刻意不送 bgm_prompt */
    });
    if (sub.status !== 200 || !sub.json || sub.json.code !== 0) {
      console.log('  ✗ 送出失敗 ' + (sub.json ? JSON.stringify(sub.json.message) : String(sub.raw).slice(0, 140)));
      continue;
    }
    const atid = sub.json.data.task_id;
    ast.tasks[id] = { taskId: atid, status: 'submitted' };
    fs.writeFileSync(outFile, JSON.stringify(ast, null, 2), 'utf8');

    let res = null;
    for (let i = 0; i < 90; i++) {
      const q = await req('GET', '/v1/audio/video-to-audio/' + atid);
      const d = q.json && q.json.data;
      if (d && (d.task_status === 'succeed' || d.task_status === 'failed')) { res = d; break; }
      await sleep(8000);
    }
    if (res && res.task_status === 'succeed') {
      const au = res.task_result && res.task_result.audios && res.task_result.audios[0];
      const dest = path.join(CLIPS, id + '_amb.mp3');
      try {
        const size = await download(au.url_mp3 || au.url, dest);
        ast.tasks[id].file = dest;
        ast.tasks[id].status = 'succeed';
        console.log('  ✓ ' + id + '_amb.mp3  ' + (size / 1024).toFixed(0) + ' KB  長度 ' + au.duration_mp3 +
                    (res.final_unit_deduction ? '  計費 ' + res.final_unit_deduction : ''));
      } catch (e) { console.log('  ✗ 下載失敗 ' + e.message); }
    } else {
      console.log('  ✗ 任務失敗');
      ast.tasks[id].status = 'failed';
    }
    fs.writeFileSync(outFile, JSON.stringify(ast, null, 2), 'utf8');
    await sleep(1000);
  }
  console.log('\n完成。純環境音在 ' + CLIPS);
})();
