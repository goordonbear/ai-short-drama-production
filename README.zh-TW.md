# AI 短劇製作工作流

[English](README.md) · **繁體中文**

一套給 AI agent 使用的技能（skill），用 [可靈 Kling](https://kling.ai) API 加上 ffmpeg，
從零產出一支完整的直式 AI 短劇 —— 通常 60 秒。

涵蓋完整鏈路：故事結構、多鏡頭生成計畫、跨段落角色一致性、原生語言對白與對嘴、
環境音與 BGM 的閃避混音、字幕燒錄、響度正規化。

整套流程都腳本化了。生成是非同步、可續傳、有帳本記錄的，所以重跑時**不會對已經在磁碟上的
段落重複扣費**。

## 環境需求

- 一組已購買資源包的可靈 API 金鑰（試用包就夠）。
  在 <https://kling.ai/dev/api-key> 建立 · 定價見
  <https://kling.ai/dev/pricing?scrollTo=video>
- Node.js 18+ —— 腳本**沒有任何 npm 依賴**（只用到 `https`、`fs`、`child_process`）
- ffmpeg + ffprobe。沒有的話，`scripts/get-ffmpeg.js` 會自動下載靜態版本

## 安裝

這是一個 [agent skill](https://kling.ai/document-api/llms.txt) —— 一個包含 `SKILL.md` 與
輔助檔案的目錄。放進你的個人技能目錄即可：

```bash
git clone https://github.com/goordonbear/ai-short-drama-production.git \
  ~/.agents/skills/ai-short-drama-production
```

下一次開啟 session 就會被載入，之後在任何專案都能使用。

## 快速開始

```bash
mkdir my-drama && cd my-drama
cp ~/.agents/skills/ai-short-drama-production/production-template.json production.json
# 編輯 production.json：標題、角色設定、每段一組提示詞

export KLING_API_KEY='api-key-kling-...'      # 或寫成 ./.kling.key

node ~/.agents/skills/ai-short-drama-production/scripts/kling-gen.js --check     # 免費
node ~/.agents/skills/ai-short-drama-production/scripts/kling-gen.js --dry-run   # 免費
node ~/.agents/skills/ai-short-drama-production/scripts/kling-gen.js --test S1   # 先生成一段，看過再繼續
node ~/.agents/skills/ai-short-drama-production/scripts/kling-gen.js --all       # 其餘段落
node ~/.agents/skills/ai-short-drama-production/scripts/kling-ambience.js        # 環境音層
node ~/.agents/skills/ai-short-drama-production/scripts/kling-bgm.js             # BGM
node ~/.agents/skills/ai-short-drama-production/scripts/assemble.js              # 串接 + 燒字幕
node ~/.agents/skills/ai-short-drama-production/scripts/final-mix.js             # 混音 + 響度
```

所有腳本都從**當前工作目錄**讀取計畫，所以請在專案資料夾內執行。腳本輸出訊息為中文。

## 內容

| 路徑 | 用途 |
| --- | --- |
| `SKILL.md` | 工作流本體：七個階段、不可妥協規則、錯誤對照表、成本模型（英文，agent 讀取用） |
| `reference.md` | 端點、參數、定價參考；已驗證的 ffmpeg 指令配方（英文） |
| `production-template.json` | 生成計畫的起點範本 |
| `examples/prompt-patterns.md` | 可重用的提示詞區塊 |
| `scripts/kling-gen.js` | 金鑰檢查、乾跑、送出、輪詢、下載、續傳 |
| `scripts/kling-ambience.js` | 純環境音層（video-to-audio，不含配樂） |
| `scripts/kling-bgm.js` | BGM 生成（text-to-audio） |
| `scripts/assemble.js` | 正規化、串接、片名卡、燒字幕 |
| `scripts/final-mix.js` | 語音 EQ、BGM 閃避、響度正規化、混音輸出 |
| `scripts/get-ffmpeg.js` | 沒有 ffmpeg 時自動下載靜態版本 |
| `docs/guide.zh-TW.md` | **完整中文工作流導覽** |
| `docs/reference.zh-TW.md` | **中文 API／定價／ffmpeg 參考** |

> `SKILL.md` 與 `reference.md` 刻意保持英文：這兩個檔案會在技能被載入時注入 agent 的
> 上下文，雙語會讓每次載入的 token 成本加倍。中文讀者請看 `docs/` 底下的對應文件。

## 成本

計費以輸出影片的秒數為單位、扣抵資源包點數。一支 60 秒 720p 直式短劇，拆成六次多鏡頭
生成約 **36 單位**；其中兩段加上原生語音約 **+18**；環境音與 BGM 約 **2**。
編預算前請確認即時價目表 —— `reference.md` 裡的是有日期的快照，不是合約。

整個流程的設計原則就是「在摸清什麼可行之前，盡量少花錢」：
`--check`（免費）→ `--dry-run`（免費）→ 先測一段 → 再跑其餘。
重生單一段落是常態修復手段。

## 設計取捨

幾個實際做過之後才定下來的決定：

- **六次呼叫，不是十四次。** 可靈 3.0 接受多鏡頭提示詞
  （`shot 1, 4, …; shot 2, 3, …`），所以一次 10 秒生成可以容納三到四個鏡頭。
  呼叫次數少不只更便宜，同一段內部的畫面也更一致。
- **角色設定寫在最前面，而且每段逐字重複。** 寫在中段的特徵會被模型忽略。
  這同時也是「獨立生成的多個段落能維持同一個角色」的唯一機制。
- **對白交給影片模型生成，而不是事後貼上去。** `settings.audio: "native"` 搭配把台詞寫進
  提示詞，會讓語音與嘴型一起生成。另外接 TTS 再跑一次對嘴是備案，而且 TTS 語音庫有帳號
  開通限制。
- **用看圖驗證，不要憑感覺假設。** 你沒辦法看影片、也沒辦法聽聲音，所以流程會把成果轉成
  可檢視的形式：畫面用接觸表（contact sheet）、音訊用頻譜圖、混音用
  `loudnorm` / `volumedetect`。

## 授權

MIT —— 詳見 [LICENSE](LICENSE)。
