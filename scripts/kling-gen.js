#!/usr/bin/env node
/* =========================================================
   可靈（Kling）官方 API 客戶端
   用途：依 production.json 生成短劇各段影片

   用法：
     node kling-gen.js --check              驗證金鑰與餘額（免費、不生成）
     node kling-gen.js --dry-run            印出即將送出的請求，不實際呼叫
     node kling-gen.js --test S1            只跑 S1（最省錢的品質測試）
     node kling-gen.js --all                跑全部段落（已完成的會跳過）
     node kling-gen.js --status             查詢已送出任務的狀態
     node kling-gen.js --download           下載已完成的成品

   官方文件：https://kling.ai/document-api/api/video/3-0-omni/text-to-video
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

/* 專案目錄：預設為執行時的工作目錄（可用 DRAMA_DIR 環境變數覆寫） */
const DIR = process.env.DRAMA_DIR || process.cwd();
const CLIPS = path.join(DIR, 'clips');
const STATE_FILE = path.join(DIR, 'state.json');
const PLAN = JSON.parse(fs.readFileSync(path.join(DIR, 'production.json'), 'utf8'));
const BASE = 'https://api-singapore.klingai.com';

/* ---------- 金鑰 ---------- */
function readKey() {
  if (process.env.KLING_API_KEY) return process.env.KLING_API_KEY.trim();
  const candidates = [
    path.join(DIR, '.kling.key'),
    path.join(require('os').homedir(), '.kling.key')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8').trim();
  }
  console.error('找不到金鑰。請設定環境變數 KLING_API_KEY，或把金鑰放進 ' + candidates[0]);
  process.exit(1);
}
const KEY = readKey();

/* ---------- HTTP ---------- */
function api(method, pathStr, body) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + KEY,
      'User-Agent': 'dust-valley-prod/1.0'
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(BASE + pathStr, { method, headers, timeout: 40000 }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch (e) { /* 非 JSON */ }
        resolve({ status: res.statusCode, json, raw: b });
      });
    });
    r.on('error', e => resolve({ status: 0, json: null, raw: String(e.code || e.message) }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null, raw: 'timeout' }); });
    if (data) r.write(data);
    r.end();
  });
}

function download(url, dest, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 6) return reject(new Error('太多重新導向'));
    https.get(url, { timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://kling.ai/' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(new URL(res.headers.location, url).href, dest, depth + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(() => resolve(fs.statSync(dest).size)));
      f.on('error', reject);
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 狀態 ---------- */
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { tasks: {} }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8'); }

/* ---------- 指令 ---------- */
async function cmdCheck() {
  console.log('=== 驗證金鑰（免費呼叫）===');
  console.log('金鑰長度 ' + KEY.length + '，前綴 ' + KEY.slice(0, 5) + '…');
  const now = Date.now();
  const r = await api('GET', '/account/costs?start_time=' + (now - 365 * 864e5) + '&end_time=' + now);
  console.log('HTTP ' + r.status);
  if (r.json) {
    console.log('code=' + r.json.code + '  message=' + JSON.stringify(r.json.message));
    const packs = (r.json.data && r.json.data.resource_pack_subscribe_infos) || [];
    if (!packs.length) console.log('（沒有查到資源包）');
    packs.forEach(p => console.log('  ■ ' + p.resource_pack_name + '  總量 ' + p.total_quantity +
      ' / 剩餘 ' + p.remaining_quantity + ' / 狀態 ' + p.status));
    if (r.json.code === 0) console.log('\n→ 金鑰有效 ✓');
    else console.log('\n→ 金鑰被拒 ✗  ' + r.json.message);
  } else {
    console.log(r.raw.slice(0, 300));
  }
}

function buildRequest(seg) {
  return {
    prompt: seg.prompt,
    settings: {
      resolution: PLAN.settings.resolution,
      aspect_ratio: PLAN.settings.aspect_ratio,
      duration: PLAN.settings.duration,
      /* 每段可各自指定 audio（原生中文語音要用 native） */
      audio: seg.audio || PLAN.settings.audio,
      multi_shot: PLAN.settings.multi_shot
    },
    options: { watermark_info: { enabled: false } }
  };
}

async function cmdDryRun(ids) {
  console.log('=== 乾跑：以下是将送出的请求（不會實際呼叫）===');
  console.log('端點 POST ' + BASE + PLAN.endpoint);
  console.log('模型 ' + PLAN.model + '  解析度 ' + PLAN.settings.resolution +
              '  比例 ' + PLAN.settings.aspect_ratio + '  長度 ' + PLAN.settings.duration + 's');
  const chosen = PLAN.segments.filter(s => !ids.length || ids.includes(s.id));
  let total = 0, units = 0;
  chosen.forEach(seg => {
    const body = buildRequest(seg);
    /* 驗證多鏡頭秒數加總 */
    const shots = [...seg.prompt.matchAll(/shot\s+(\d+)\s*,\s*(\d+)\s*,/g)];
    const sum = shots.reduce((a, m) => a + parseInt(m[2], 10), 0);
    total += PLAN.settings.duration;
    /* 原生音效 0.9 單位/秒；無音效 0.6 單位/秒（720p） */
    units += PLAN.settings.duration * (body.settings.audio === 'native' ? 0.9 : 0.6);
    console.log('\n■ ' + seg.id + '  ' + seg.title + '  （' + seg.look + '）');
    console.log('  鏡頭數 ' + shots.length + '，秒數加總 ' + sum + ' / 設定長度 ' + PLAN.settings.duration +
                (sum === PLAN.settings.duration ? '  ✓' : '  ✗ 不符！'));
    console.log('  audio=' + body.settings.audio +
                '（' + (body.settings.audio === 'native' ? '0.9' : '0.6') + ' 單位/秒）');
    console.log('  prompt 長度 ' + body.prompt.length + ' 字元' +
                (body.prompt.length > 2500 ? '  ⚠ 超過建議值 2500' : '  ✓'));
  });
  const pricePerSec = 0.084;
  console.log('\n總長 ' + total + ' 秒，預估消耗 ' + units.toFixed(1) + ' 單位（約 $' +
              (units * pricePerSec / 0.6).toFixed(2) + '）');
}

async function submit(seg) {
  const r = await api('POST', PLAN.endpoint, buildRequest(seg));
  if (r.status !== 200 || !r.json || r.json.code !== 0) {
    console.log('  ✗ 送出失敗 HTTP ' + r.status + '  ' + (r.json ? JSON.stringify(r.json.message) : r.raw.slice(0, 200)));
    return null;
  }
  const id = r.json.data && r.json.data.id;
  console.log('  ✓ 已送出，task_id = ' + id + '  狀態 ' + (r.json.data && r.json.data.status));
  return id;
}

async function pollTask(id) {
  const r = await api('GET', '/tasks?task_ids=' + encodeURIComponent(id));
  if (!r.json || r.json.code !== 0) return { status: 'unknown', raw: r.raw };
  const t = (r.json.data || [])[0];
  return t || { status: 'unknown' };
}

async function waitFor(id, label) {
  let last = '';
  for (let i = 0; i < 120; i++) {           // 最多等 20 分鐘（10 秒一次）
    const t = await pollTask(id);
    if (t.status !== last) {
      last = t.status;
      console.log('  [' + label + '] ' + t.status + (t.message ? '  ' + t.message : ''));
    }
    if (t.status === 'succeeded' || t.status === 'failed') return t;
    await sleep(10000);
  }
  return { status: 'timeout' };
}

function videoUrlOf(task) {
  const outs = task.outputs || [];
  const v = outs.find(o => o.type === 'video');
  return v ? v.url : null;
}

async function cmdRun(ids) {
  fs.mkdirSync(CLIPS, { recursive: true });
  const state = loadState();
  const chosen = PLAN.segments.filter(s => !ids.length || ids.includes(s.id));
  console.log('=== 開始生成 ' + chosen.length + ' 段 ===');
  for (const seg of chosen) {
    console.log('\n■ ' + seg.id + '  ' + seg.title);
    let rec = state.tasks[seg.id];
    if (rec && rec.status === 'succeeded' && fs.existsSync(rec.file || '')) {
      console.log('  已存在，略過（刪除 state.json 可重新生成）');
      continue;
    }
    const id = (rec && rec.taskId) || await submit(seg);
    if (!id) continue;
    state.tasks[seg.id] = { taskId: id, status: 'submitted', submittedAt: Date.now() };
    saveState(state);

    const task = await waitFor(id, seg.id);
    state.tasks[seg.id].status = task.status;
    state.tasks[seg.id].message = task.message || '';
    if (task.billing) state.tasks[seg.id].billing = task.billing;
    saveState(state);

    if (task.status === 'succeeded') {
      const url = videoUrlOf(task);
      if (url) {
        const dest = path.join(CLIPS, seg.id + '.mp4');
        try {
          const size = await download(url, dest);
          state.tasks[seg.id].file = dest;
          console.log('  ✓ 已下載 ' + path.basename(dest) + '  (' + (size / 1048576).toFixed(1) + ' MB)');
          if (task.billing) console.log('  計費 ' + JSON.stringify(task.billing));
        } catch (e) {
          console.log('  ✗ 下載失敗：' + e.message);
          state.tasks[seg.id].remoteUrl = url;
        }
        saveState(state);
      }
    } else {
      console.log('  ✗ 任務結束狀態：' + task.status + '  ' + (task.message || ''));
    }
    await sleep(1500);
  }
  console.log('\n完成。成品在 ' + CLIPS);
}

async function cmdStatus() {
  const state = loadState();
  const ids = Object.keys(state.tasks);
  if (!ids.length) { console.log('尚無任務紀錄'); return; }
  console.log('=== 任務狀態 ===');
  for (const k of ids) {
    const rec = state.tasks[k];
    const t = await pollTask(rec.taskId);
    console.log(k + '  ' + rec.taskId + '  ' + (t.status || '?') +
      (t.message ? '  ' + t.message : '') + (rec.file ? '  [已下載]' : ''));
    await sleep(600);
  }
}

async function cmdDownload() {
  const state = loadState();
  fs.mkdirSync(CLIPS, { recursive: true });
  for (const k of Object.keys(state.tasks)) {
    const rec = state.tasks[k];
    if (rec.file && fs.existsSync(rec.file)) { console.log(k + ' 已有檔案'); continue; }
    const t = await pollTask(rec.taskId);
    const url = videoUrlOf(t);
    if (!url) { console.log(k + ' 還沒有可下載的成品（' + t.status + '）'); continue; }
    const dest = path.join(CLIPS, k + '.mp4');
    try {
      const size = await download(url, dest);
      rec.file = dest;
      console.log(k + ' ✓ ' + (size / 1048576).toFixed(1) + ' MB');
    } catch (e) { console.log(k + ' ✗ ' + e.message); rec.remoteUrl = url; }
    saveState(state);
    await sleep(800);
  }
}

/* ---------- 參數解析 ---------- */
(async () => {
  const args = process.argv.slice(2);
  const has = f => args.includes(f);
  const valOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

  if (has('--check')) return cmdCheck();
  if (has('--dry-run')) return cmdDryRun(args.filter(a => /^S\d+$/.test(a)));
  if (has('--status')) return cmdStatus();
  if (has('--download')) return cmdDownload();
  if (has('--test')) {
    const t = valOf('--test');
    return cmdRun(t ? [t] : ['S1']);
  }
  if (has('--all')) return cmdRun([]);

  console.log('用法：');
  console.log('  node kling-gen.js --check            驗證金鑰與餘額（免費）');
  console.log('  node kling-gen.js --dry-run          檢查生產計畫（不呼叫 API）');
  console.log('  node kling-gen.js --test S1          只生成 S1（品質測試，最省錢）');
  console.log('  node kling-gen.js --all              生成全部 6 段');
  console.log('  node kling-gen.js --status           查詢任務狀態');
  console.log('  node kling-gen.js --download         下載成品');
})();
