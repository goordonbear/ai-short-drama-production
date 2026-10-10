# 中文參考：API、參數、定價、ffmpeg 配方

[English](../README.md) · **繁體中文** · 對應的英文版為 [`reference.md`](../reference.md)

> 以下是建立這套流程時的資料快照。**編預算前請重新核對即時價目與參數**：
> <https://kling.ai/document-api/llms.txt> 列出所有文件頁面，每頁在網址後加上 `.md`
> 就能取得機器可讀的純文字版。

## 一、認證與網域

| 項目 | 值 |
| --- | --- |
| 網域 | `https://api-singapore.klingai.com`（全球站；舊的 `api.klingai.com` 是中國站閘道） |
| 標頭 | `Authorization: Bearer api-key-kling-<43 字元>` |
| Content-Type | `application/json` |

`api-key-` 前綴是憑證的一部分。閘道會區分兩種認證設計：

- **新版（用這個）：** 單一 API 金鑰，在 <https://kling.ai/dev/api-key> 建立。
  模型版本寫在**路徑裡**（`/text-to-video/kling-3.0`）。
- **舊版：** AccessKey ＋ SecretKey 簽成三段式 HS256 JWT，模型版本放在 `model_name` 欄位。
  把原始金鑰送到舊版路徑會得到 `1002 The token was expected to have 3 parts, but got 0`；
  把 AK/SK 型憑證送到新版路徑會得到 `1002 The current API does not support AK/SK`。

值得記住的錯誤碼：`0` 成功、`1002` 認證、`1201` 參數驗證
（例如 `prompt cannot be empty` —— 收到這個代表**認證已經通過**）。

花錢之前很有用的免費端點：

```
GET /account/costs?start_time=<毫秒>&end_time=<毫秒>   → 資源包清單、總量與剩餘點數
```

該端點的頻率限制是 QPS ≤ 1。

## 二、影片生成

```
POST /text-to-video/kling-3.0
POST /text-to-video/kling-2.6
POST /text-to-video/kling-3.0-turbo
```

請求內容：

```json
{
  "prompt": "...",
  "settings": {
    "resolution": "720p",
    "aspect_ratio": "9:16",
    "duration": 10,
    "audio": "off",
    "multi_shot": true
  },
  "options": { "watermark_info": { "enabled": false } }
}
```

| 欄位 | 可選值 | 說明 |
| --- | --- | --- |
| `settings.resolution` | `720p`、`1080p`、`4k`（3.0）／`720p`、`1080p`（2.6） | 4K 約貴 5 倍 |
| `settings.aspect_ratio` | `16:9`、`9:16`、`1:1` | 直式短劇用 `9:16` |
| `settings.duration` | 3–15（3.0）；`5` 或 `10`（2.6） | 必須等於各鏡頭秒數的總和 |
| `settings.audio` | `native`、`off` | `native` ＝ 由模型生成語音／音效 |
| `settings.multi_shot` | true／false | 設 `false` 可關閉多鏡頭解析 |
| `options.watermark_info.enabled` | true／false | 預設 false，維持 false |

多鏡頭提示詞語法（僅 3.0）：

```
shot 1, 4, 描述; shot 2, 3, 描述; shot 3, 3, 描述
```

最多 6 個鏡頭。每個鏡頭至少 1 秒。各鏡頭秒數**必須**等於 `settings.duration`。
單鏡頭文字 ≤512 字元，整段提示詞 ≤3072（建議 ≤2500）。

任務生命週期：

```
POST /text-to-video/...           → data.id、data.status = submitted
GET  /tasks?task_ids=<id>         → data[0].status：submitted | processing | succeeded | failed
                                     data[0].outputs[] → { type: "video", id, url }
```

請尽快下載結果網址；可靈會在約 30 天後清除生成的媒體，而且結果網址可能有防盜鏈保護
（請帶瀏覽器風格的 `User-Agent` 與 `Referer`）。

## 三、音訊生成

### 影片轉音訊（環境音／音效）

```
POST /v1/audio/video-to-audio
GET  /v1/audio/video-to-audio/{task_id}
```

| 欄位 | 說明 |
| --- | --- |
| `video_id` | 可靈生成的影片 id（30 天內、3–20 秒） |
| `video_url` | 或外部 mp4/mov，≤100 MB、3–20 秒、720p/1080p、512–2160 px |
| `sound_effect_prompt` | ≤200 字元。具體音源清單 |
| `bgm_prompt` | ≤200 字元。**要另外加 BGM 時就別給這個** |
| `asmr_mode` | 布林 |

`video_id` 與 `video_url` 只能擇一。結果在
`data.task_result.audios[0].url_mp3` 與 `duration_mp3`。

因為輸入上限是 20 秒，請餵「各段 10 秒的原始片段」再把結果串起來 —— 不要餵已經合成好的
60 秒母帶。

### 文字轉音訊（BGM）

```
POST /v1/audio/text-to-audio
GET  /v1/audio/text-to-audio/{task_id}
```

| 欄位 | 說明 |
| --- | --- |
| `prompt` | ≤200 字元 |
| `duration` | 3.0–10.0 秒，一位小數 |

回傳 `url_mp3` 與 `url_wav`。用 `-stream_loop -1 -t <秒數>` 把 10 秒的曲子鋪滿。

### 文字轉語音（有帳號開通限制）

```
POST /v1/audio/tts
GET  /v1/audio/tts/{task_id}
```

| 欄位 | 說明 |
| --- | --- |
| `text` | ≤1000 字元，會經過內容審查 |
| `voice_id` | 有語言區分，需查廠商的 Voice Guide。`oversea_male1` 對 `en` 有效 |
| `voice_language` | `zh` 或 `en` —— **同一個 voice id 不能跨語言使用** |
| `voice_speed` | 0.8–2.0，一位小數 |

`GET /v1/general/presets-voices?pageNum=1&pageSize=200` 會回傳一份小型預設語音清單，
帶的是**數字型** id（例如 Owen、William、Catherine、Laura）。那些 id 是給影片生成的語音控制
用的，**不是**給 `/v1/audio/tts` 用的 —— 拿去那邊會得到 `Voice id not found`。
如果 TTS 任務送出成功、卻在處理階段失敗，代表帳號沒有 TTS 資源包；
此時請改用影片呼叫的 `settings.audio: "native"`。

### 對嘴（兩步）

```
POST /v1/videos/identify-face        → data.session_id、data.face_data[].face_id
POST /v1/videos/advanced-lip-sync    → 每人臉插入音訊，一次呼叫只支援一張臉
```

`face_choose[].sound_file` 接受 base64 音訊或網址（`.mp3/.wav/.m4a/.aac`，≤5 MB，2–60 秒）；
`sound_insert_time`、`sound_start_time`、`sound_end_time` 單位是毫秒；
`sound_volume` 與 `original_audio_volume` 是浮點數（預設 1）。
來源影片需為 720p/1080p、2–60 秒、≤100 MB。**優先使用原生音訊生成，而非這條路。**

## 四、定價快照（每秒輸出，720p／1080p）

| 模型 | 模式 | 720p | 1080p |
| --- | --- | --- | --- |
| Kling 3.0 | 無原生音訊 | 0.6 u（$0.084） | 0.8 u（$0.112） |
| Kling 3.0 | 原生音訊，無語音控制 | 0.9 u（$0.126） | 1.2 u（$0.168） |
| Kling 3.0 | 動作控制 | 0.9 u | 1.2 u |
| Kling 3.0 | 4K | — | 3.0 u（$0.42） |
| Kling 2.6 | 無原生音訊 | 0.3 u（$0.042） | 0.5 u（$0.07） |
| Kling 2.6 | 原生音訊 ＋ 語音控制 | — | 1.2 u（$0.168） |
| Kling 2.5 Turbo | 無原生音訊 | 0.3 u | 0.5 u |
| 對嘴 | 每 5 秒 | 0.5 u | — |
| 文字轉音訊 | 每次 | 0.25 u | — |
| 影片轉音訊 | 每次 | 0.25 u | — |
| TTS | 每次 | 0.05 u | — |

實例試算：一支 60 秒 720p 直式短劇，拆成 6 次多鏡頭、無音訊
（6 × 10 秒 × 0.6 ＝ **36 單位**），其中兩段加原生語音
（＋2 × 10 秒 × 0.9 ＝ **18 單位**），環境音 6 次（**1.5 單位**），
BGM 2 首（**0.5 單位**）＝ **56 單位**。100 單位的試用包足以涵蓋。

## 五、ffmpeg 配方

以下每道指令都在 ffmpeg 9.x 上實測可用。路徑請用正斜線或 shell 陣列；
**濾鏡字串內不要用反斜線**。

### 接觸表（畫面驗證）

```bash
ffmpeg -y -i S1.mp4 -vf "fps=1,scale=300:534,tile=5x2" -frames:v 1 S1_sheet.png
```

`fps=1` ＝ 每秒取一格；`tile=5x2` 需要 `fps × 長度` 這麼多格，
所以 10 秒片段配 `fps=1` 剛好填滿 5x2。要多段總覽時，可先各自 tile，
再用 `xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0` 合併，或用 `vstack`／`hstack` 堆疊。

### 頻譜圖（音訊驗證）

```bash
ffmpeg -y -i S1.mp4 -filter_complex "[0:a]showspectrumpic=s=1400x520:legend=1:scale=log[v]" \
  -map "[v]" -frames:v 1 spec.png
```

若不寫 `-filter_complex … -map "[v]"`，`-frames:v 1` 會抓到**視訊**幀而不是頻譜圖。
有聲語音 ＝ 低頻段的垂直條紋（諧波）。

### 把單段正規化成精確畫布與長度

```bash
ffmpeg -y -i in.mp4 -t 10 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30" \
  -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p out.mp4
```

### 串接

```bash
# 影像：當每段共用相同編碼參數時，concat demuxer 配 -c copy 可行
printf "file '%s'\n" "$PWD"/build/S1.mp4 ... > build/list.txt
ffmpeg -y -f concat -safe 0 -i build/list.txt -c copy build/concat.mp4

# 音訊：一定要用 concat「濾鏡」，不要用 -c copy（AAC 複製會造成 Non-monotonic DTS）
ffmpeg -y -i a1.m4a -i a2.m4a -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a]" \
  -map "[a]" -ac 2 -ar 48000 -c:a aac -b:a 192k out.m4a
```

### 燒字幕

```bash
ffmpeg -y -i concat.mp4 \
  -vf "subtitles=subs.srt:force_style='FontName=Microsoft JhengHei,FontSize=8,PrimaryColour=&H00FFFFFF,OutlineColour=&HB0000000,BorderStyle=1,Outline=1.6,Shadow=0.6,Alignment=2,MarginV=48'" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -an out.mp4
```

- `force_style` 值外圍的單引號是**必要的**。
- SRT 請用**相對路徑**（把 ffmpeg 的工作目錄設成專案目錄），可避開 Windows 磁碟機代號的
  冒號轉義問題。
- `Alignment=2` 底部置中；`MarginV` ＝ 距底部的距離（腳本單位）。
- `FontSize` 與 `MarginV` 會一起縮放，所以要「字更小、更貼底」時兩個都要調小。
- 看 console 有沒有 `fontselect:` 那行，確認 libass 找到字型。

### 片名卡

```bash
ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:r=30:d=1.5" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p title.mp4
```

接著讓燒字幕那一輪把片名文字渲染上去 —— 不用跟 `drawtext` 的字型路徑搏鬥。

### 對白與閃避 BGM 的混音

```bash
ffmpeg -y -i video.mp4 -i voice60.m4a -i bgm60.m4a -filter_complex "
[1:a]highpass=f=80,equalizer=f=280:t=q:w=1:g=-3,equalizer=f=3200:t=q:w=1.3:g=+4,\
acompressor=threshold=0.08:ratio=3:attack=8:release=180,asplit=2[voxA][voxB];
[2:a]volume=0.34[bgm];
[bgm][voxA]sidechaincompress=threshold=0.03:ratio=6:attack=12:release=380:makeup=1[bgmduck];
[voxB][bgmduck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=13,\
alimiter=limit=0.95,afade=t=out:st=57.5:d=2.5[out]" \
  -map 0:v:0 -map "[out]" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest final.mp4
```

- `asplit` 是必要的：一個有標籤的輸出只能被消費一次，而語音床需要被用兩次
  （當側鏈、也當混音輸入）。
- `sidechaincompress` 吃 `[main][sidechain]`，輸出的是壓縮後的 **main** ——
  所以 BGM 是 main、語音是 sidechain。
- BGM 基礎音量 0.3–0.35 就明顯位於對白之下；剩下的交給閃避處理。
- `loudnorm` 會升頻，所以輸出要強制 `-ar 48000`。

### 量測

```bash
ffmpeg -hide_banner -i out.mp4 -af loudnorm=print_format=json -f null -   # input_i, input_tp, input_lra
ffmpeg -hide_banner -i out.mp4 -af volumedetect -f null -                 # mean_volume, max_volume
ffmpeg -hide_banner -ss 4 -t 3 -i out.mp4 -af volumedetect -f null -      # 指定區間（對白段）
```

目標：整合響度約 **−16 LUFS**、true peak **≤ −1.5 dB**，
且「有對白的區間」量起來要明顯高於「沒有對白的區間」。

## 六、調色配方

雙色語言能讓閃回明確可辨。

| 色調 | 濾鏡 |
| --- | --- |
| 冷（閃回、夜晚、室外） | `eq=saturation=0.82:contrast=1.06,colorbalance=bs=0.16:bm=0.10:bh=0.04,curves=blue='0/0.06 0.5/0.56 1/1'` |
| 暖（現在、室內） | `eq=saturation=1.04:contrast=1.04,colorbalance=rs=0.05:rm=0.03,curves=red='0/0.03 0.5/0.53 1/1'` |

`colorbalance` 的選項是 `r/g/b` 加上區間字母：`s` 暗部、`m` 中間調、`h` 亮部 ——
所以 `bs` 是藍色暗部、`gm` 是綠色中間調、`rh` 是紅色亮部。
**沒有 `ms` 這個選項**；打成 `ms` 會讓整個 render 以 `Option not found` 中止。

把濾鏡字串放進 `production.json` 中該段落的 `grade` 欄位，`assemble.js` 會在正規化時套用。
請**逐段套用**，不要套在合成好的母帶上，這樣兩種色調的界線才會乾淨。

## 七、時間與長度記帳

- 計畫裡的 `start` 值要等於各段長度的累計和。字幕是對照同一條時間軸撰寫的。
- 若最後一段要讓出片名卡空間，在合成時縮短它（例如 10 秒段 → 8.5 秒）並補上 1.5 秒黑卡，
  總長才會精確維持。`assemble.js` 已自動處理這件事。
- AI 生成的鏡頭分界**不會**精準對齊計畫的多鏡頭秒數。字幕請按「計畫的鏡頭區間」放，
  看過接觸表之後再微調。
- 交付前務必確認最終容器的長度精確到毫秒。
