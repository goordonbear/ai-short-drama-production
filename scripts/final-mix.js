#!/usr/bin/env node
/* =========================================================
   最終混音
   音軌架構：
     A. 語音＋環境音   有原生語音的段落直接用影片音軌，其餘用純環境音
     B. BGM            唯美配樂鋪滿全片
   混音策略：
     BGM 壓到明顯低於語音，並用 sidechaincompress 做「閃避」——
     有台詞或音效時自動把 BGM 再壓低，確保對白清楚（不會蓋掉其他聲音）
   段落、長度、標題、BGM 編排全部從 production.json 讀取。

   用法：node final-mix.js
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* 專案目錄：預設為執行時的工作目錄（可用 DRAMA_DIR 環境變數覆寫） */
const DIR = process.env.DRAMA_DIR || process.cwd();
const CLIPS = path.join(DIR, 'clips');
const BGM = path.join(DIR, 'bgm');
const BUILD = path.join(DIR, 'build');
const OUT = path.join(DIR, 'output');
/* 作品標題與段落：全部從 production.json 讀取 */
const PLAN = JSON.parse(fs.readFileSync(path.join(DIR, 'production.json'), 'utf8'));
const TITLE = PLAN.title || path.basename(DIR);
const SEG_DUR = PLAN.settings.duration;
const TITLE_CARD = PLAN.settings.titleCardSeconds != null ? PLAN.settings.titleCardSeconds : 1.5;
const TOTAL = PLAN.segments.length * SEG_DUR;

/* 音軌來源自動判定：
     segments[].audio === 'native' → 直接用影片裡的原生語音（kind: video）
     其餘                          → 用 clips/<id>_amb.mp3（kind: amb）
   最後一段縮短片名卡的長度，並補一段靜音給片名卡。
   segments[].audioGain 可個別補正音量（例如某段語音偏小）。 */
const SEG_AUDIO = PLAN.segments.map((seg, i) => ({
  id: seg.id,
  kind: seg.audio === 'native' ? 'video' : 'amb',
  dur: (i === PLAN.segments.length - 1) ? (SEG_DUR - TITLE_CARD) : SEG_DUR,
  gain: seg.audioGain != null ? seg.audioGain : 1.0
}));
SEG_AUDIO.push({ id: 'TITLE', kind: 'silence', dur: TITLE_CARD, gain: 1.0 });

/* BGM 編排：預設全部用 warm.mp3 鋪滿；也可在 production.json 的 bgmPlan 自訂
   （例如讓閃回段落換成另一首、或指定段落長度）。
   格式：[{ "file": "warm.mp3", "dur": 30 }, ...]，長度加總應等於總長 */
const BGM_PLAN = PLAN.bgmPlan && PLAN.bgmPlan.length
  ? PLAN.bgmPlan
  : [{ file: 'warm.mp3', dur: TOTAL }];

const BGM_VOLUME = 0.34;     // BGM 基礎音量（約 -9dB，明顯低於語音）
const DUCK_THRESHOLD = 0.030;
const DUCK_RATIO = 6;
const DUCK_ATTACK = 12;
const DUCK_RELEASE = 380;

function findTool(name) {
  for (const r of [path.join(DIR, 'tools'), path.join(DIR, '..', 'tools')]) {
    if (!fs.existsSync(r)) continue;
    const stack = [r];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name.toLowerCase() === name) return p;
      }
    }
  }
  /* 找不到就交給系統 PATH */
  return name.replace(/\.exe$/i, '');
}
const FFMPEG = findTool('ffmpeg.exe');
const FFPROBE = findTool('ffprobe.exe');

function run(args, label) {
  process.stdout.write('  ▸ ' + label + ' … ');
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit', cwd: DIR });
  if (r.error) { console.log('失敗 ' + r.error.message); return false; }
  if (r.status !== 0) { console.log('失敗 exit ' + r.status); return false; }
  console.log('OK');
  return true;
}
function dur(f) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f], { encoding: 'utf8' });
  const v = parseFloat(String(r.stdout).trim());
  return isFinite(v) ? v : null;
}
function loud(f) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = String(r.stderr || '') + String(r.stdout || '');
  const m = txt.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const x = txt.match(/max_volume:\s*(-?[\d.]+) dB/);
  return { mean: m ? +m[1] : null, max: x ? +x[1] : null };
}

const A = (n, s) => ['-ac', '2', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', n].concat(s || []);

(async () => {
  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  /* ---- 1. 語音＋環境音軌 ---- */
  console.log('[1/3] 建立語音＋環境音軌');
  const parts = [];
  for (const seg of SEG_AUDIO) {
    const dst = path.join(BUILD, 'mix_' + seg.id + '.m4a');
    if (seg.kind === 'silence') {
      if (!run(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(seg.dur)]
        .concat(A(dst)), '靜音 ' + seg.id)) process.exit(1);
    } else {
      const src = seg.kind === 'video' ? path.join(CLIPS, seg.id + '.mp4') : path.join(CLIPS, seg.id + '_amb.mp3');
      if (!fs.existsSync(src)) { console.log('  找不到 ' + src); process.exit(1); }
      const vf = 'volume=' + seg.gain;
      const args = ['-y'].concat(seg.kind === 'video' ? ['-i', src, '-vn'] : ['-i', src])
        .concat(['-t', String(seg.dur), '-af', vf]).concat(A(dst));
      if (!run(args, seg.id + ' (gain ' + seg.gain + ')')) process.exit(1);
    }
    parts.push(dst);
  }
  const voiceTrack = path.join(BUILD, 'voice60.m4a');
  const vInputs = [];
  parts.forEach(f => vInputs.push('-i', f));
  const vChain = parts.map((f, i) => '[' + i + ':a]').join('') + 'concat=n=' + parts.length + ':v=0:a=1[a]';
  if (!run(['-y'].concat(vInputs).concat(['-filter_complex', vChain, '-map', '[a]']).concat(A(voiceTrack)), '串接語音軌')) process.exit(1);
  console.log('  語音軌長度 ' + (dur(voiceTrack) || 0).toFixed(2) + 's  響度 ' + JSON.stringify(loud(voiceTrack)));

  /* ---- 2. BGM 軌 ---- */
  console.log('\n[2/3] 建立 BGM 軌');
  const bgmParts = [];
  BGM_PLAN.forEach((b, i) => {
    const src = path.join(BGM, b.file);
    if (!fs.existsSync(src)) { console.log('  找不到 ' + src); process.exit(1); }
    const dst = path.join(BUILD, 'bgm_' + i + '.m4a');
    /* -stream_loop -1 讓 10 秒的曲子能鋪滿指定長度 */
    if (!run(['-y', '-stream_loop', '-1', '-i', src, '-t', String(b.dur)]
      .concat(A(dst)), b.file + ' ×' + b.dur + 's')) process.exit(1);
    bgmParts.push(dst);
  });
  const bgmTrack = path.join(BUILD, 'bgm60.m4a');
  const bInputs = [];
  bgmParts.forEach(f => bInputs.push('-i', f));
  const bChain = bgmParts.map((f, i) => '[' + i + ':a]').join('') + 'concat=n=' + bgmParts.length + ':v=0:a=1[a]';
  if (!run(['-y'].concat(bInputs).concat(['-filter_complex', bChain, '-map', '[a]']).concat(A(bgmTrack)), '串接 BGM')) process.exit(1);
  console.log('  BGM 長度 ' + (dur(bgmTrack) || 0).toFixed(2) + 's  響度 ' + JSON.stringify(loud(bgmTrack)));

  /* ---- 3. 混音 + 併入影片 ---- */
  console.log('\n[3/3] 混音（含閃避）並輸出');
  const video = path.join(OUT, TITLE + '_' + TOTAL + 's.mp4');
  if (!fs.existsSync(video)) { console.log('  找不到 ' + video); process.exit(1); }

  /* 注意：ffmpeg 的標籤只能被當作輸入一次，語音軌要同時餵給
     sidechaincompress（當側鏈）與 amix（當主訊號），所以必須先用 asplit 分流。

     語音處理：高通濾掉低頻隆隆聲 → 衰減 280Hz 濁音 → 提升 3.2kHz 清晰度
               → 壓縮讓音量平穩（台詞才能穿透雨聲與室內噪音） */
  const VOICE_CHAIN = 'highpass=f=80,' +
    'equalizer=f=280:t=q:w=1:g=-3,' +
    'equalizer=f=3200:t=q:w=1.3:g=+4,' +
    'acompressor=threshold=0.08:ratio=3:attack=8:release=180,' +
    'asplit=2[voxA][voxB]';

  const fc = [
    '[1:a]' + VOICE_CHAIN,
    '[2:a]volume=' + BGM_VOLUME + '[bgm]',
    '[bgm][voxA]sidechaincompress=threshold=' + DUCK_THRESHOLD + ':ratio=' + DUCK_RATIO +
      ':attack=' + DUCK_ATTACK + ':release=' + DUCK_RELEASE + ':makeup=1[bgmduck]',
    /* loudnorm 把整體響度拉到社群平台標準的 -16 LUFS，並守住 true peak；
       結尾淡出依實際總長計算，最後 2.5 秒漸弱 */
    '[voxB][bgmduck]amix=inputs=2:duration=first:normalize=0,' +
      'loudnorm=I=-16:TP=-1.5:LRA=13,' +
      'alimiter=limit=0.95,afade=t=out:st=' + Math.max(0, TOTAL - 2.5) + ':d=2.5[out]'
  ].join(';');

  const finalOut = path.join(OUT, TITLE + '_' + TOTAL + 's_mixed.mp4');
  if (!run(['-y', '-i', video, '-i', voiceTrack, '-i', bgmTrack,
            '-filter_complex', fc,
            '-map', '0:v:0', '-map', '[out]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
            '-shortest', finalOut], '混音輸出')) process.exit(1);

  const d = dur(finalOut), size = fs.statSync(finalOut).size, L = loud(finalOut);
  console.log('\n=== 完成 ===');
  console.log('成品：' + finalOut);
  console.log('長度 ' + (d || 0).toFixed(2) + ' 秒　大小 ' + (size / 1048576).toFixed(1) + ' MB');
  console.log('響度 mean ' + L.mean + ' dB / max ' + L.max + ' dB');
})();
