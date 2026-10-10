# 中文工作流導覽

[English](../README.md) · **繁體中文** · 對應的 agent 指令檔為 [`SKILL.md`](../SKILL.md)（英文）

---

## 這套流程會產出什麼

| 產物 | 說明 |
| --- | --- |
| `output/<標題>_<總長>s.mp4` | 最終母帶，直式（預設 1080×1920）、字幕已燒錄、音訊已混音 |
| `production.json` | 生成計畫：所有提示詞與設定。可重複執行、結果一致 |
| `state.json` | 任務帳本，重跑時不會對已完成的段落重複扣費 |
| `subs.srt` | 字幕檔（部分平台偏好另外上傳，可視需要提供） |
| `clips/`、`build/` | 各段原始素材與中間檔，保留供重新剪輯 |

## 五條不可妥協的規則

1. **API 金鑰必須包含 `api-key-` 前綴。** 可靈金鑰長這樣：`api-key-kling-<43 字元>`。
   把 `api-key-` 去掉會得到 `401 code 1002`（`does not support AK/SK` 或
   `token expected to have 3 parts`）。**永遠不要修剪它。**
2. **還沒免費檢查與乾跑之前，不要花任何點數。** `--check` 會驗證金鑰並讀取資源包剩餘點數，
   完全不收費（走 `GET /account/costs`）。
3. **先生成一段、看過、再生成其餘。** 花 6 單位先探路，可以避免用 50 單位換到一個錯的調性。
4. **永遠保留 `state.json`。** 生成是非同步且緩慢的，續傳才是常態；盲目重送會重複扣費。
5. **交付前一定要用眼睛驗證。** 你沒辦法看影片、也沒辦法聽聲音，所以要主動產出接觸表與
   頻譜圖，並且真的去看它們（見第六階段）。

---

## 階段一：故事設計

除非另有指示，以**總長 60 秒**為基準。以下結構在留存率上表現穩定：

| 時間 | 節拍 | 目的 |
| --- | --- | --- |
| 0–10s | **鉤子** —— 前提下最視覺化、最不需要解釋的那個畫面 | 讓人停下滑動 |
| 10–20s | 閃回／成因，用對比色調 | 解釋前提 |
| 20–30s | 轉折（揭曉） | 兌現鉤子 |
| 30–40s | 喜劇或行為蒙太奇，全片最亮 | 娛樂性 |
| 40–50s | 安靜的親密時刻 | 換取情感 |
| 50–58.5s | 收尾 ＋ 最後一個彩蛋／笑點 | 滿足感 ＋ 重看動機 |
| 58.5–60s | 黑底片名卡 | 品牌 |

真正重要的幾條：

- **前三秒就要把前提演出來。** 不要慢慢鋪陳。
- **雙色語言。** 給閃回一種色調（例如冷藍），現在時空另一種（暖琥珀）。不要讓它們看起來一樣。
- **刻意決定角色要不要說話。** 對白是最大的品質風險。一個沉默的主角 ＋ 另一個角色講
  三到五句短台詞，遠比一群人七嘴八舌安全 —— 而且完全移除了對嘴失敗的風險。
  只有在使用者要求時才加對白。
- 台詞限制在短句（每句 ≤10 字），由**一個**角色說，並且安排在該鏡頭裡他明顯在畫面上、
  且大致面向鏡頭的位置。
- 順手把 SRT 寫好，讓時間軸與台詞保持一致。

## 階段二：生成計畫

把 `production-template.json` 複製成專案裡的 `production.json` 並填寫。結構：

```json
{
  "title": "作品標題",
  "model": "kling-3.0",
  "endpoint": "/text-to-video/kling-3.0",
  "settings": {
    "resolution": "720p", "aspect_ratio": "9:16", "duration": 10,
    "audio": "off", "multi_shot": true,
    "canvas": "1080x1920", "fps": 30, "titleCardSeconds": 1.5
  },
  "segments": [
    { "id": "S1", "title": "鉤子", "look": "現在 / 室內 / 暖", "start": 0.0,
      "prompt": "shot 1, 4, …; shot 2, 3, …; shot 3, 3, …" }
  ]
}
```

**一個段落 ＝ 一次 API 呼叫。** 可靈 3.0 支援多鏡頭提示詞，所以把 3–6 個鏡頭塞進同一次
10 秒生成，而不是每個鏡頭呼叫一次。六次呼叫就能覆蓋 60 秒，而「一鏡一次」要 14 次以上；
而且同一批生成的鏡頭彼此更一致。

多鏡頭語法（**僅限 3.0**；2.6 及更早是單鏡頭，長度只有 5 或 10 秒）：

```
shot 1, 4, <描述>; shot 2, 3, <描述>; shot 3, 3, <描述>
```

- `n` ＝ 鏡頭序號，`m` ＝ 該鏡頭秒數。**所有 `m` 的總和必須等於 `settings.duration`**，
  否則 API 會直接拒絕。
- 最多 6 個鏡頭。單鏡頭描述 ≤512 字元；整段提示詞 ≤3072（建議壓在 2500 以內）。
- 最長的鏡頭放第一個，閱讀節奏最好；承載鉤子的鏡頭至少留 3 秒。

花錢之前先驗算：

```bash
node <skill>/scripts/kling-gen.js --dry-run
```

它會印出每段的鏡頭數、秒數加總、提示詞長度、各段音訊模式，以及預估點數消耗。

### 提示詞的三個區塊

順序是有意義的，不要調換：

**1. 角色設定放最前面。** 任何模型不能弄掉的東西 —— 決定性外貌特徵、服裝、角色一定會帶的
道具 —— 都寫在第一句。只寫在提示詞中段的特徵會被忽略：實測時，寫在中段的特徵在該段開頭
幾個鏡頭完全沒出現；把它移到最前面，下一次就修好了。

**2. 一組風格字串，在每個鏡頭重複。** 例如：

```
cinematic photorealistic live-action, vertical 9:16, 35mm lens, shallow depth of field,
subtle film grain, NOT anime, NOT CGI
```

**3. 鏡頭描述**，包含主體、動作、運鏡、光線。

跨段落的角色一致性，唯一手段是**在每一段的提示詞裡逐字重述同一份角色表**
（年齡、族裔、髮色與髮型、瀏海、眼睛顏色、服裝，以及任何非人類特徵）。
不要因為後面幾段就把它縮短。

## 階段三：付費生成

```bash
cd <專案目錄>
node <skill>/scripts/kling-gen.js --check      # 免費：金鑰 ＋ 剩餘點數
node <skill>/scripts/kling-gen.js --dry-run    # 免費：驗證計畫
node <skill>/scripts/kling-gen.js --test S1    # 只生成一段 —— 看過再說
node <skill>/scripts/kling-gen.js --all        # 全部；已存在磁碟的會跳過
```

- 生成是非同步的：送出 → 輪詢（`GET /tasks?task_ids=`）→ 下載。一段 10 秒通常要 1–5 分鐘。
  `--all` 可能跑 20–40 分鐘，建議當成背景工作執行。
- 下載檔案放在 `clips/<段落ID>.mp4`。`--status` 與 `--download` 可以救回中斷的執行。
- 要重生某一段：把它從 `state.json` 的紀錄刪掉、並移除對應的 `clips/<ID>.mp4`，再重跑。
  舊檔先改名備份，方便回退。

### 語音與對嘴

如果劇情需要對白，**可以避免就不要**事後再接一套 TTS。把有語音的段落設成
`"audio": "native"`，並把台詞以目標語言寫進提示詞，標明是「一句短台詞」：

```
shot 2, 3, Reverse shot: <角色B> <動作>. He speaks <語言> in a calm, surprised young male
voice, one short line: <台詞>. <角色A> looks up …
```

模型就會把語音與對應的嘴型一起生成。幾個要點：

- `native` 比 `off` 貴（見 `reference.md` 的價目表），某些模型還會強制 1080p。
- 在角色設定裡補上 `The two characters speak <語言> only.`
- 必須保持沉默的鏡頭要明寫 `No dialogue in this shot.`，否則模型可能自己發明台詞。
- 段落層級覆寫：把 `"audio": "native"` 放進該段落物件，`kling-gen.js` 會優先採用它。
- 專用的 TTS 端點（`POST /v1/audio/tts`）與對嘴端點
  （`/v1/videos/identify-face` → `/v1/videos/advanced-lip-sync`）確實存在，但 TTS 語音庫
  有帳號開通限制 —— 任務可能送出成功、卻在處理階段失敗。只有在原生音訊不可用時才走這條路，
  而且先用一句便宜的台詞驗證，不要直接在上面蓋整條產線。
- 實務上的限制：你沒辦法聽。用頻譜圖驗證語音確實存在（第六階段），並明確告訴使用者：
  發音與音色要靠他的耳朵判斷。

## 階段四：音效設計

建三層獨立的音軌，最後再混。如果之後還要加 BGM 層，就**不要**把配樂烤進環境音層 ——
兩套配樂會打架。

| 層 | 來源 | 腳本 |
| --- | --- | --- |
| 對白 ＋ 現場音 | 生成片段本身（`audio: native`） | 混音階段抽取 |
| 環境音／音效 | `POST /v1/audio/video-to-audio`，**只給 `sound_effect_prompt`** | `kling-ambience.js` |
| BGM | `POST /v1/audio/text-to-audio`（每次 3–10 秒，循環鋪滿） | `kling-bgm.js` |

```bash
node <skill>/scripts/kling-ambience.js   # 沉默段落的純環境音
node <skill>/scripts/kling-bgm.js        # 唯美、不搶戲的 BGM
```

環境音提示詞是一串**具體音源**，不是氣氛形容詞：

```
busy city street at midday, car tyres on wet asphalt, distant construction, pedestrians passing,
a shop door chime
```

BGM 提示詞則要主動要求克制：

```
beautiful cinematic background music, warm tender solo piano with soft strings, gentle,
slow tempo, no drums, no vocals, seamless ambient loop, very soft and unobtrusive
```

因為 `text-to-audio` 每次上限 10 秒，所以「一種情緒生成一首」再用
`-stream_loop -1 -t <秒數>` 鋪滿。通常「對比色調那一段一首 ＋ 其餘一首」就夠了。

## 階段五：合成

```bash
node <skill>/scripts/assemble.js    # 正規化 → 串接 → 燒字幕 → 輸出
node <skill>/scripts/final-mix.js   # 語音 EQ ＋ BGM 閃避 → 併入影片
```

`assemble.js` 對每一段做的事：縮放＋補黑邊到目標畫布、`setsar=1`、強制幀率，
並且**裁到計畫長度** —— 讓時間軸精準，而不是看模型剛好渲染了多長。
接著串接、補上產生的黑底片名卡、燒錄 `subs.srt`。
最後一段會自動縮短 `titleCardSeconds` 秒，所以總長精確不變。

字幕樣式在 `assemble.js` 裡的 `SUB_STYLE`：

- `FontSize` 控制字級；`MarginV` 控制距底部高度（`Alignment=2` ＝ 底部置中）。
  字級小 ＋ `MarginV` 小 ＝ 小字貼在畫面下緣。
- 中文需要 libass 能解析的字型。Windows 上的 `Microsoft JhengHei`（正黑體）可用，
  libass 會在 console 印出實際解析到的字型名稱 —— **要看那一行**，因為字型缺失會渲染成方框。
  腳本在燒字幕失敗時會退回輸出「無字幕母帶」，而不是整個中斷。
- **`force_style` 的值必須用單引號包住**，否則它裡面的逗號會被當成濾鏡參數分隔，
  ffmpeg 會以 `Error parsing a filter description` 中止。

`final-mix.js` 會從影片抽出語音／環境音床（音量偏小的段落自動補正），把 BGM 鋪滿，
再用 `sidechaincompress` 混音 —— 音樂會在對白出現時自動壓低，這就是「BGM 不會蓋掉其他聲音」
的機制。最後以 `loudnorm=I=-16:TP=-1.5` 收在平台標準響度。

## 階段六：驗證（不要跳過）

你沒辦法看、也沒辦法聽，所以要把成果**轉換成看得見的東西**。

**每段接觸表** —— 每秒取一格排成網格，然後真的去看那張圖：

```bash
ffmpeg -y -i clips/S1.mp4 -vf "fps=1,scale=300:534,tile=5x2" -frames:v 1 clips/S1_sheet.png
```

要檢查：每個鏡頭是否符合描述、角色的決定性特徵**在需要它的那個鏡頭裡**是否可見、
整體是否維持寫實而沒有飄向動漫／CG。

**音訊頻譜圖** —— 確認語音與環境音真的存在。音訊串流必須明確 map，否則 ffmpeg 會安靜地
改成輸出一格畫面：

```bash
ffmpeg -y -i clips/S1.mp4 -filter_complex "[0:a]showspectrumpic=s=1400x520:legend=1:scale=log[v]" \
  -map "[v]" -frames:v 1 clips/spec_S1.png
```

有聲語音會呈現為低頻段的**垂直條紋**（聲門諧波）；寬頻霧狀則是環境噪音或室內底噪。

**響度與峰值**：

```bash
ffmpeg -hide_banner -i out.mp4 -af loudnorm=print_format=json -f null -
ffmpeg -hide_banner -i out.mp4 -af volumedetect -f null -
```

目標：整合響度約 **−16 LUFS**、true peak **≤ −1.5 dB**。
另外要分別量「有台詞的區間」與「沒有台詞的區間」，確認對白確實浮在音床之上。

**容器基本檢查**：長度必須精確等於目標（到毫秒）、解析度與幀率符合計畫、音訊串流存在
（`ffprobe -show_entries stream=codec_type,…`）。

### 沙箱注意事項

在受限的 harness 環境下，`child_process` 若透過管線捕獲輸出會失敗並回報 `EPERM`。
請用 `stdio: 'inherit'`（內附腳本都是這樣寫的），並**從命令列**執行量測指令，而不是從 Node。
永遠不要因為 Node 端的量測回傳 null，就判定檔案壞掉。

## 階段七：交付

寫到使用者指定的目錄（若在工作區之外，需要一次提權操作），並包含：

- 最終母帶，以及（若第一次混音還在審閱中）無音效母帶
- 六段原始素材、環境音與 BGM 來源檔
- `production.json`、`state.json`、`subs.srt` 與所有腳本
- 一份簡短製作說明：生成了什麼、點數成本、驗證了什麼、還有什麼沒驗證
- 驗證用圖片（接觸表、頻譜圖、字幕樣本）

誠實回報相對於資源包的實際成本，並明確說出你**無法**驗證的部分
（畫面裡的發音是否標準、BGM 的品味是否符合使用者期待）。

---

## 成本模型

計費以輸出影片秒數為單位、扣抵資源包點數。務必以
<https://kling.ai/document-api/pricing/base/video> 的即時價目表為準 ——
`reference.md` 裡的快照是參考，不是合約。60 秒 720p 的數量級估算：

| 路線 | 點數 | 說明 |
| --- | --- | --- |
| 多鏡頭、無音效、6 次呼叫 | 約 36 | 最省的合理基準 |
| ＋兩段原生語音 | ＋18 | 每段 10 秒 9 單位 |
| 環境音 6 段 | 約 1.5 | 每次 0.25 |
| BGM 2 首 | 0.5 | 每次 0.25 |

控制花費的節奏：`--check`（免費）→ `--dry-run`（免費）→ 先測一段 → 再跑其餘。
重生單段是常態修復手段，所以編預算時要把它算進去。

## 常見錯誤與修法

| 症狀 | 成因 | 修法 |
| --- | --- | --- |
| `401 code 1002`、`does not support AK/SK`、`token expected to have 3 parts` | `api-key-` 前綴被去掉，或把 AK/SK 型 JWT 送到新版 API | 完整送出 `Authorization: Bearer api-key-kling-...` |
| TTS 回 `Voice id not found` | voice ID 有語言區分且需帳號開通 | 改用影片呼叫的 `audio: native` |
| 特寫鏡頭變成動漫／CG | 「可愛的臉部特寫」這類措辭會把模型推向風格化 | 補上 `photorealistic live-action, real human, natural skin texture, NOT anime, NOT cartoon, NOT CGI, NOT illustration` |
| 決定性特徵在開頭鏡頭看不到 | 特徵寫在提示詞中段 | 把角色設定移到提示詞**最前面** |
| `Non-monotonic DTS`／接縫有爆音 | 用 `-c copy` 串接 AAC | 改用 `concat` **濾鏡**（`concat=n=...:v=0:a=1`） |
| `Stream specifier 'X' matches no streams` | 同一個濾鏡輸出標籤被兩個地方消費 | 插入 `asplit=2[a][b]` |
| 輸出音訊變成 96 kHz | `loudnorm` 會升頻 | 輸出強制加 `-ar 48000 -ac 2` |
| `subtitles` 回 `Error parsing a filter description` | `force_style` 裡的逗號沒有包引號 | 包起來：`force_style='FontName=...,FontSize=8'` |
| 字幕渲染成方框 | libass 找不到字型 | 看 console 的 `fontselect:` 那行；改用系統已安裝的中文字型 |
| 重跑就重複扣費 | `state.json` 遺失或過期 | 還原帳本；腳本會跳過已有檔案的段落 |
| Node 內出現 `spawnSync … EPERM` | 沙箱阻擋了管線 stdio | 改用 `stdio: 'inherit'`，量測從命令列做 |
| `colorbalance` 回 `Option not found` | 用了不存在的選項（例如 `ms`） | 選項是 `r/g/b` ＋ `s/m/h`：`bs` 藍暗部、`gm` 綠中間調、`rh` 紅亮部 |
