#!/usr/bin/env node
/* =========================================================
   剪輯：把各段 AI 生成片段合成完整成品
   1. 每段正規化為目標畫布與幀率，並裁到計畫長度
   2. 最後一段縮短，補上片名卡 → 總長精準等於計畫總長
   3. 串接 + 燒字幕（libass）
   4. 標題、畫布、片名卡長度全部從 production.json 讀取

   用法：node assemble.js
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* 專案目錄：預設為執行時的工作目錄（可用 DRAMA_DIR 環境變數覆寫） */
const DIR = process.env.DRAMA_DIR || process.cwd();
const CLIPS = path.join(DIR, 'clips');
const BUILD = path.join(DIR, 'build');
const OUT_DIR = path.join(DIR, 'output');
const PLAN = JSON.parse(fs.readFileSync(path.join(DIR, 'production.json'), 'utf8'));

/* 畫布尺寸：從 production.json 的 settings.canvas 讀取，預設 1080x1920 */
const CANVAS = (PLAN.settings.canvas || '1080x1920').split('x');
const W = parseInt(CANVAS[0], 10) || 1080;
const H = parseInt(CANVAS[1], 10) || 1920;
const FPS = PLAN.settings.fps || 30;
/* 片名卡長度（秒）：最後一段會縮短這麼多，總長維持不變 */
const TITLE_CARD = PLAN.settings.titleCardSeconds != null ? PLAN.settings.titleCardSeconds : 1.5;
const SEG_DUR = PLAN.settings.duration;
const TOTAL = PLAN.segments.length * SEG_DUR;
/* 作品標題：從 production.json 讀取，沒設定就用專案資料夾名稱 */
const TITLE = PLAN.title || path.basename(DIR);
/* 字幕樣式：字級縮小、貼近底部（MarginV 越小越靠底） */
const SUB_STYLE = "FontName=Microsoft JhengHei,FontSize=8,PrimaryColour=&H00FFFFFF," +
                  "OutlineColour=&HB0000000,BorderStyle=1,Outline=1.6,Shadow=0.6," +
                  "Alignment=2,MarginV=48";
/* ---------- 找 ffmpeg ---------- */
function findFFmpeg(name) {
  if (process.env.FFMPEG && name.toLowerCase().startsWith('ffmpeg')) return process.env.FFMPEG;
  const roots = [path.join(DIR, 'tools'), path.join(DIR, '..', 'tools')];
  for (const r of roots) {
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
const FFMPEG = findFFmpeg('ffmpeg.exe');
const FFPROBE = findFFmpeg('ffprobe.exe');
/* 找不到時 findFFmpeg 會回傳 PATH 上的名稱，交由系統解析；只有真的不存在才會在執行時報錯 */

/* ---------- 執行 ffmpeg（stdio inherit，才不會踩到沙箱的具名管道限制）---------- */
function run(args, label) {
  process.stdout.write('  ▸ ' + label + ' … ');
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit', cwd: DIR });
  if (r.error) { console.log('失敗：' + r.error.message); return false; }
  if (r.status !== 0) { console.log('失敗（exit ' + r.status + '）'); return false; }
  console.log('OK');
  return true;
}

function probeDuration(file) {
  if (!FFPROBE) return null;
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const v = parseFloat(String(r.stdout).trim());
  return isFinite(v) ? v : null;
}

/* ---------- 主流程 ---------- */
(async () => {
  const keep = process.argv.includes('--keep');
  console.log('ffmpeg: ' + FFMPEG);
  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  /* 1. 檢查素材 */
  const missing = PLAN.segments.filter(s => !fs.existsSync(path.join(CLIPS, s.id + '.mp4')));
  if (missing.length) {
    console.log('\n還缺這些片段（先跑 node kling-gen.js --all）：');
    missing.forEach(s => console.log('  ✗ ' + s.id + '  ' + s.title));
    process.exit(1);
  }
  console.log('素材齊全：' + PLAN.segments.map(s => s.id).join(', '));

  /* 2. 逐段正規化（最後一段縮短，讓出片名卡的長度） */
  console.log('\n[1/4] 正規化每段（' + W + '×' + H + ' / ' + FPS + 'fps）');
  const lastIdx = PLAN.segments.length - 1;
  const normalized = [];
  PLAN.segments.forEach((seg, i) => {
    const dur = (i === lastIdx) ? (SEG_DUR - TITLE_CARD) : SEG_DUR;
    const src = path.join(CLIPS, seg.id + '.mp4');
    const dst = path.join(BUILD, seg.id + '.mp4');
    const real = probeDuration(src);
    console.log('  ' + seg.id + '  來源 ' + (real ? real.toFixed(2) + 's' : '?') + ' → 目標 ' + dur + 's' +
                (seg.grade ? '  [調色]' : ''));
    let vf = 'scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,' +
             'pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=' + FPS;
    /* 選用：segments[].grade 可放一段 ffmpeg 濾鏡字串，用來做冷暖色調分離 */
    if (seg.grade) vf += ',' + seg.grade;
    const ok = run([
      '-y', '-i', src, '-t', String(dur),
      '-vf', vf, '-an',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      dst
    ], '正規化 ' + seg.id);
    if (!ok) process.exit(1);
    normalized.push(dst);
  });

  /* 3. 片名卡（黑底，文字由 subs.srt 燒上去） */
  console.log('\n[2/4] 產生片名卡（' + TITLE_CARD + ' 秒）');
  const titleCard = path.join(BUILD, 'title.mp4');
  if (!run(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=' + W + 'x' + H + ':r=' + FPS + ':d=' + TITLE_CARD,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', titleCard], '片名卡')) {
    process.exit(1);
  }
  normalized.push(titleCard);

  /* 4. 串接 */
  console.log('\n[3/4] 串接成 ' + TOTAL + ' 秒');
  const listFile = path.join(BUILD, 'list.txt');
  fs.writeFileSync(listFile,
    normalized.map(f => "file '" + f.replace(/\\/g, '/') + "'").join('\n') + '\n', 'utf8');
  const concatOut = path.join(BUILD, 'concat.mp4');
  if (!run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
            '-c', 'copy', concatOut], '串接')) {
    /* copy 失敗時改用重新編碼 */
    if (!run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
              '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
              '-r', String(FPS), concatOut], '串接（重新編碼）')) process.exit(1);
  }

  /* 5. 燒字幕 */
  console.log('\n[4/4] 燒字幕並輸出');
  const bgm = ['bgm.m4a', 'bgm.mp3', 'bgm.wav', 'music.m4a', 'music.mp3']
    .map(f => path.join(DIR, f)).find(f => fs.existsSync(f));
  const finalOut = path.join(OUT_DIR, TITLE + '_' + TOTAL + 's.mp4');
  /* force_style 的值裡有逗號，必須用單引號包住，否則濾鏡解析器會把它當成下一個參數 */
  const subArg = "subtitles=subs.srt:force_style='" + SUB_STYLE + "'";

  let args;
  if (bgm) {
    console.log('  偵測到配樂：' + path.basename(bgm));
    args = ['-y', '-i', concatOut, '-i', bgm,
            '-vf', subArg, '-map', '0:v', '-map', '1:a',
            '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', finalOut];
  } else {
    args = ['-y', '-i', concatOut, '-vf', subArg,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
            '-pix_fmt', 'yuv420p', '-an', finalOut];
  }
  if (!run(args, '燒字幕')) {
    console.log('\n字幕燒錄失敗（可能是 libass 找不到中文字型）。');
    console.log('改用無字幕輸出，字幕檔可直接上傳到平台：');
    const noSub = path.join(OUT_DIR, TITLE + '_' + TOTAL + 's_nosub.mp4');
    run(['-y', '-i', concatOut, '-c', 'copy', noSub], '無字幕輸出');
    console.log('字幕檔：' + path.join(DIR, 'subs.srt'));
    process.exit(0);
  }

  const size = fs.statSync(finalOut).size;
  const dur = probeDuration(finalOut);
  console.log('\n=== 完成 ===');
  console.log('成品：' + finalOut);
  console.log('大小：' + (size / 1048576).toFixed(1) + ' MB' +
              (dur ? '　長度：' + dur.toFixed(2) + ' 秒' : ''));
  if (!keep) {
    console.log('（中間檔保留在 ' + BUILD + '，可加 --keep 之外的參數自行刪除）');
  }
})();
