# 羽球排隊助手 — 專案規格書 (spec.md)

> **最後更新**：2026-04-02
> 本文件記錄專案的架構、流程與功能，供後續開發者快速理解並確保一致性。

---

## 目錄

1. [專案概述](#1-專案概述)
2. [技術棧](#2-技術棧)
3. [目錄結構](#3-目錄結構)
4. [資料模型](#4-資料模型)
5. [核心流程](#5-核心流程)
6. [功能清單](#6-功能清單)
7. [UI 佈局與元件](#7-ui-佈局與元件)
8. [狀態管理](#8-狀態管理)
9. [持久化策略](#9-持久化策略)
10. [部署與 CI/CD](#10-部署與-cicd)
11. [開發與維護規範](#11-開發與維護規範)

---

## 1. 專案概述

**羽球排隊助手 (BadmintonQueue)** 是一套專為羽球場設計的排隊管理系統，用於管理多面球場的球員輪替。系統支援會員管理、報到、排隊、自動語音唱名、熱身階段控制、以及角色權限控管（RBAC）等功能，適合社團或場館日常使用。

### 核心價值

- 公平排隊：按先後順序排隊，4 人一組自動配場
- 即時管理：拖拉 / 點選操作，快速調整隊伍
- 語音唱名：開賽時自動語音播報球員與場地
- 會員持久化：透過 localStorage 保留會員與場地狀態
- 角色區分：團主（admin）可全權管理；球員（player）只能操作自己

---

## 2. 技術棧

| 類別 | 技術 | 版本 |
| --- | --- | --- |
| 框架 | React | 19.2.0 |
| 語言 | TypeScript | ~5.8.2 |
| 建置工具 | Vite | ^6.2.0 |
| CSS | TailwindCSS (CDN) | 最新 |
| Icon 庫 | lucide-react | ^0.554.0 |
| 字型 | Inter (Google Fonts) | — |
| 部署 | GitHub Pages | — |

---

## 3. 目錄結構

```
badminton-queue/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages 自動部署
├── components/
│   ├── CourtCard.tsx           # 場地卡片元件
│   └── PlayerAvatar.tsx        # 球員頭像元件（依名字 hash 產生一致顏色）
├── App.tsx                     # 主應用 — 所有狀態與邏輯集中於此
├── App.tsx.backup              # 備份檔
├── index.html                  # HTML 入口（TailwindCDN、字型、scrollbar 樣式）
├── index.tsx                   # React 入口（掛載 App 至 #root）
├── types.ts                    # TypeScript 型別定義與常數
├── metadata.json               # 應用 metadata
├── vite.config.ts              # Vite 設定（含 GitHub Actions base path）
├── tsconfig.json               # TypeScript 設定
├── package.json                # 依賴與腳本
└── README.md                   # 專案說明
```

---

## 4. 資料模型

### 4.1 型別定義（`types.ts`）

```typescript
type PlayerStatus = 'idle' | 'queued' | 'playing';
type SkillLevel = 'beginner' | 'intermediate';
type UserRole = 'admin' | 'player';

interface Player {
  id: string;          // UUID
  name: string;        // 球員姓名
  status: PlayerStatus;
  level: SkillLevel;
  joinedAt: number;    // timestamp
}

interface Court {
  id: number;
  name: string;              // 場地名稱（可重新命名）
  playerIds: (string | null)[]; // 場上球員 ID 列表（null 為空位，最多 4 人）
  startTime: number | null;  // 比賽開始時間
}

interface Member {
  id: string;          // UUID
  name: string;
  level: SkillLevel;   // 季打 / 零打
  createdAt: number;
}

interface CurrentUser {
  role: UserRole;
  memberId?: string;   // 僅 player role 有此欄位，對應 Member.id
}
```

### 4.2 常數

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `MAX_PLAYERS_PER_COURT` | 4 | 每場最多人數（雙打） |
| `INITIAL_COURT_COUNT` | 6 | 預設場地數量 |

### 4.3 技能等級

| Key | 標籤 | 顏色系 |
| --- | --- | --- |
| `beginner` | 季打 | emerald（綠色） |
| `intermediate` | 零打 | blue（藍色） |

---

## 5. 核心流程

### 5.1 球員生命週期

```
會員列表 (Member)
   │
   │ [報到 checkIn] ── 團主可直接報到；球員只能報到自己
   ▼
休息區 (idle Player)
   │
   │ [加入排隊 joinQueue / insertIntoQueueAt]
   ▼
排隊區 (queued Player) ── 以 queueSlots 陣列維護順序
   │
   │ [開賽 startMatch] ── 取第一個**完整 4 人組**送入空場地
   ▼
場地中 (playing Player) ── 計時開始
   │
   │ [結束比賽 endMatch] ── 全員回休息區
   │ [單人下場 restPlayerFromCourt] ── 個別回休息區（不結束比賽）
   ▼
休息區 (idle Player) ── 可再次加入排隊
```

### 5.2 熱身階段 (Warmup)

```
熱身中 (isWarmupDone = false)
   │
   │ 場地允許自由拖放球員（不受排隊限制）
   │ 球員可以跨場地移動
   │
   │ [所有場地滿場 → 可結束熱身]
   ▼
已熱身 (isWarmupDone = true)
   │
   │ 場地鎖定，球員只能透過排隊→開賽進入場地
   │ 場上球員不可再自由移動
```

### 5.3 開賽流程

```
1. 系統掃描 queueSlots，找出第一個**完整 4 人組**（連續 4 個非 null 的 slot）
2. 管理者於空場地點選「打球囉」
3. 系統自動：
   a. 將 4 名球員狀態改為 playing
   b. 從 queueSlots 中移除（後方球員自動前移填補）
   c. 加入指定場地的 playerIds
   d. 記錄 startTime
   e. 若 isAutoAnnounce = true，語音播報：
      「請 OOO，OOO，OOO，OOO，到 場地X 打球」（重複兩次）

注意：若第一組 4 個 slot 有空缺（null），不會從後方抓人補湊，
      而是等待那組補滿後才能開賽。
```

### 5.4 登入流程

```
進入應用（未登入）
   │
   ├─ [我是團主] ──→ role = 'admin'，直接進入系統（無需身分驗證）
   │
   └─ [我是球員] ──→ 顯示會員列表（可搜尋）
                      │
                      └─ 選擇自己名字 ──→ role = 'player'，memberId = 對應 Member.id
                                          自動觸發 checkInMember()
                                          進入排隊區 Tab
```

---

## 6. 功能清單

### 6.1 會員管理（報到區 Tab）

| 功能 | 說明 | 所在函式 | 權限 |
| --- | --- | --- | --- |
| 新增會員 | 輸入姓名、選擇等級後新增 | `createMember()` | admin |
| CSV 批次匯入 | 上傳 .csv 檔案批量新增會員 | `parseCsvAndImport()`, `handleBatchImport()` | admin |
| 搜尋會員 | 關鍵字即時篩選 | `filteredMembers` (useMemo) | 全部 |
| 報到 | 將會員加入今日球員（休息區） | `checkInMember()` | admin / 本人 |
| 刪除會員 | 從會員列表永久移除 | `removeMember()` | admin |
| 名單重置 | 清空尚未報到的會員 | Settings dropdown | admin |
| 修改等級 | 點擊等級標籤切換（季打⇄零打） | `updateMemberLevel()` | admin |

> **注意**：球員 role 僅能看到「排隊區」Tab，報到區對球員隱藏。

### 6.2 排隊管理（排隊區 Tab）

| 功能 | 說明 | 所在函式 | 權限 |
| --- | --- | --- | --- |
| 加入排隊 | 從休息區拖入或點選加入 | `joinQueue()` | admin / 本人 |
| 指定位置插入 | 拖入/點選到特定 slot | `insertIntoQueueAt()` | admin / 本人 |
| 隊內移動 | 拖拉交換位置 | `moveInQueue()` | admin / 本人 |
| 上移/下移 | 在隊列中上下調整 | `moveQueueItemUp()`, `moveQueueItemDown()` | admin / 本人 |
| 回休息區 | 從排隊移回休息區 | `removeFromQueue()` | admin / 本人 |
| 全部回休息 | 批量清空排隊區 | `restAllQueue()` | admin |
| 清空休息區 | 批量讓休息區球員離場 | `clearBench()` | admin |
| 早退 | 球員直接離場（回會員列表） | `deletePlayer()` | admin / 本人 |
| 修改等級 | 同會員等級修改並雙向同步 | `updatePlayerLevel()` | admin |
| 自己優先顯示 | 登入球員名字自動排在休息區最前 | `filteredIdlePlayers` (useMemo) | — |

### 6.3 場地管理（主區域）

| 功能 | 說明 | 所在函式 | 權限 |
| --- | --- | --- | --- |
| 開賽 | 取排隊第一完整 4 人組配入場地 | `startMatch()` | admin |
| 結束比賽 | 場上 4 人回休息區，場地清空 | `endMatch()` | admin |
| 單人下場 | 個別球員回休息區（不結束場地） | `restPlayerFromCourt()` | admin |
| 自動語音播報 | 開賽時自動唱名（可關閉） | `speak()`, `isAutoAnnounce` | admin |
| 手動語音播報 | 比賽中手動再次唱名 | `announceCourtPlayers()` | admin |
| 場地重新命名 | 點擊編輯圖示修改場地名稱 | `renameCourt()` | admin |
| 增減場地 | 動態調整場地數量（最少 1 面） | `addCourt()`, `removeCourt()` | admin |
| 計時器 | 比賽開始後即時顯示已用時間 | CourtCard 內部 `useEffect` | 全部（唯讀） |
| 拖放球員至場地 | 熱身階段可直接拖球員入場 | `dropPlayerToCourt()` | admin |
| 調整場上位置 | 點選或拖拉調整場內位置 | `movePlayerToCourtSlot()` | admin |
| 從場地移除 | 將球員從場地中移出 | `removePlayerFromCourt()` | admin |

### 6.4 全局功能

| 功能 | 說明 | 所在函式 | 權限 |
| --- | --- | --- | --- |
| 熱身開關 | 控制是否為熱身階段 | `handleWarmupToggle()` | admin |
| 打球結束 | 一鍵清空所有活動球員（回會員列表） | `resetSession()` | admin |
| 側邊欄收合 | 行動裝置可關閉/開啟側邊欄 | `isSidebarOpen` | 全部 |
| 報到成功提示 | 報到後自動顯示 2 秒成功 Modal | `checkInSuccessName` | — |
| 鍵盤快捷鍵 | Escape 取消選中的球員 | `useEffect` (keydown) | — |
| 即時時鐘 | 每秒更新（用於場地計時） | `useEffect` (setInterval) | — |
| 登入 / 登出 | 身分選擇與切換 | `currentUser`, profile dropdown | 全部 |

### 6.5 RBAC（角色權限控管）

| 角色 | 說明 | 限制 |
| --- | --- | --- |
| `admin`（團主） | 完整管理權限 | 無 |
| `player`（球員） | 以自身身分登入 | 只能操作自己的球員；報到區隱藏；熱身/打球結束等管理操作不可用 |

**權限判斷函式**：`canMovePlayer(playerId)` — 回傳 `true` 若當前登入者為 admin，或該球員名字與登入者名字相符。

---

## 7. UI 佈局與元件

### 7.1 整體佈局

```
┌──────────────────────────────────────────────────────┐
│                  (整個畫面 h-full)                     │
│  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │   Sidebar    │  │         Main Content          │  │
│  │  (w-[25rem]) │  │         (flex-1)              │  │
│  │              │  │  ┌──────────────────────────┐ │  │
│  │  ┌────────┐  │  │  │       Toolbar            │ │  │
│  │  │App     │  │  │  │ 場地狀況 / 場地±/ 熱身   │ │  │
│  │  │Header  │  │  │  │ / 打球結束              │ │  │
│  │  │(含     │  │  │  └──────────────────────────┘ │  │
│  │  │ Profile│  │  │  ┌──────────────────────────┐ │  │
│  │  │Dropdown│  │  │  │    Courts Grid           │ │  │
│  │  └────────┘  │  │  │  ┌──────┐  ┌──────┐     │ │  │
│  │  ┌────────┐  │  │  │  │Court1│  │Court2│ ... │ │  │
│  │  │  Tabs  │  │  │  │  └──────┘  └──────┘     │ │  │
│  │  │報到(*)/ │  │  │  │  ┌──────┐  ┌──────┐     │ │  │
│  │  │排隊    │  │  │  │  │Court3│  │Court4│ ... │ │  │
│  │  └────────┘  │  │  │  └──────┘  └──────┘     │ │  │
│  │  ┌────────┐  │  │  └──────────────────────────┘ │  │
│  │  │  Tab   │  │  └──────────────────────────────┘  │
│  │  │Content │  │                                    │
│  │  │(scroll)│  │  (*) 報到區僅 admin 可見            │
│  │  └────────┘  │                                    │
│  └──────────────┘                                    │
└──────────────────────────────────────────────────────┘
```

### 7.2 元件清單

| 元件 | 檔案 | 職責 |
| --- | --- | --- |
| `App` | `App.tsx` | 主元件，管理所有狀態與業務邏輯 |
| `CourtCard` | `components/CourtCard.tsx` | 單一場地卡片：顯示球員、計時、開賽/結束按鈕、拖放互動 |
| `PlayerAvatar` | `components/PlayerAvatar.tsx` | 球員頭像：根據名字 hash 分配固定顏色的圓點圖示 |
| `LevelSelector` | `App.tsx` 內 | 技能等級切換按鈕（行內元件） |
| 登入畫面 | `App.tsx` 內 | 角色選擇（團主 / 球員）與球員身分選擇搜尋 |
| Profile Dropdown | `App.tsx` 內 | 顯示當前登入身分，提供登出/切換功能，click-outside 自動關閉 |

### 7.3 CourtCard 狀態視覺

| 狀態 | 邊框 | 圓點 | 行動按鈕 |
| --- | --- | --- | --- |
| 空場 | `border-slate-800` | 灰色 | 打球囉 / 空場 |
| 有人（未開賽） | `border-amber-500/30` | 琥珀色 | 等待中 (N/4) |
| 比賽中 | `border-indigo-500/30` | 綠色 + pulse | 結束比賽（下場） |

### 7.4 當前登入者高亮規則

登入者（`currentMemberName`）在以下位置均以**白色粗體 + 淡白底**顯示：

| 位置 | 視覺效果 |
| --- | --- |
| 排隊區 (queueSlots) | `bg-slate-100/10`, `border-slate-300/30`, 白色粗體名字 |
| 休息區 (idle list) | `bg-slate-100/10`, `border-slate-300/30`, 白色粗體名字；自動排序至最前 |
| 場地中 (CourtCard) | 金色（`text-yellow-400`）粗體顯示 |

---

## 8. 狀態管理

### 8.1 核心狀態（useState）

| 狀態名 | 類型 | 說明 | 持久化 |
| --- | --- | --- | --- |
| `currentUser` | `CurrentUser \| null` | 當前登入者（角色+memberId） | ✅ localStorage |
| `players` | `Player[]` | 今日所有活動球員 | ✅ localStorage |
| `courts` | `Court[]` | 所有場地 | ✅ localStorage |
| `members` | `Member[]` | 會員名冊 | ✅ localStorage |
| `queueSlots` | `(string \| null)[]` | 排隊順序（slot-based，null=空位） | ❌ |
| `isWarmupDone` | `boolean` | 熱身是否結束 | ❌ |
| `activeTab` | `'queue' \| 'members'` | 側邊欄 Tab（player 預設 queue，admin 預設 members） | ❌ |
| `isSidebarOpen` | `boolean` | 側邊欄展開狀態 | ❌ |
| `isAutoAnnounce` | `boolean` | 是否自動語音播報 | ❌ |
| `selectedPlayerForMove` | `string \| null` | 點選移動模式中被選中的球員 | ❌ |
| `isProfileMenuOpen` | `boolean` | Profile Dropdown 開關 | ❌ |

### 8.2 衍生資料（useMemo）

| 名稱 | 說明 |
| --- | --- |
| `currentMemberName` | 當前登入球員的姓名（admin 為 null） |
| `queue` | 排隊中的球員列表（從 queueSlots 解析） |
| `idlePlayers` | 休息中球員（按 joinedAt 降序） |
| `filteredIdlePlayers` | 休息區搜尋篩選結果（登入者自動排最前） |
| `nextMatchPlayers` | 下一場球員（第一個完整 4 人組） |
| `isQueueReady` | 是否已有完整 4 人可開賽 |
| `filteredMembers` | 會員搜尋篩選結果 |
| `checkedInMembers` / `notCheckedInMembers` | 已報到 / 未報到會員分組 |
| `queueDisplayItems` | 排隊區 UI 顯示資料（含空位） |
| `chunkedQueueItems` | 每 4 人一組的排隊顯示 |
| `totalActivePlayers` | 場上正在打球的人數 |
| `idleCourtsCount` | 空閒場地數 |

### 8.3 排隊系統設計（Slot-Based Queue）

排隊使用 `queueSlots: (string | null)[]` 而非簡單的 Player 陣列：

- 每個 slot 可以是球員 ID 或 `null`（空位）
- 支援指定位置插入、交換、拖放
- UI 以 4 人一組分 chunk 顯示，模擬場地分組
- Trailing nulls 會自動修剪（`while pop`）

### 8.4 開賽邏輯（隊伍完整性）

```typescript
// 掃描 queueSlots，取第一個完整 4 人組（不跳過空位補人）
const getNextMatchBatch = (slots, players) => {
  for (let i = 0; i < slots.length; i += MAX_PLAYERS_PER_COURT) {
    const chunk = slots.slice(i, i + MAX_PLAYERS_PER_COURT);
    if (chunk.length === 4 && chunk.every(id => id !== null)) {
      return chunk.map(id => playerMap.get(id));
    }
  }
  return []; // 沒有完整組
};
```

若第一組有空缺（null slot），`isQueueReady = false`，「打球囉」按鈕不可點。

---

## 9. 持久化策略

| Key | 資料 | 時機 |
| --- | --- | --- |
| `badminton_current_user` | `CurrentUser` JSON | currentUser 變更時 |
| `badminton_players` | `Player[]` JSON | players 變更時 |
| `badminton_courts` | `Court[]` JSON | courts 變更時 |
| `badminton_members` | `Member[]` JSON | members 變更時 |

> **Migration 機制**：從 localStorage 載入時，自動補上缺少的 `level` 欄位（預設 `'intermediate'`），確保向後相容。

---

## 10. 部署與 CI/CD

### GitHub Pages 自動部署

- **觸發條件**：push 到 `main` 分支
- **流程**：checkout → Node 22 安裝 → `npm ci` → `npm run build` → Upload artifact → Deploy
- **Base Path**：生產環境為 `/badminton-queue/`，本地開發為 `/`
- **設定位置**：`.github/workflows/deploy.yml` + `vite.config.ts`

### 本地開發

```bash
npm install
npm run dev     # 啟動 dev server (port 3000)
```

---

## 11. 開發與維護規範

### 11.1 新增功能注意事項

1. **型別優先**：新增資料欄位先更新 `types.ts`，確保型別安全
2. **Migration**：若修改既有資料結構，須在 `useState` 初始化時加入 migration 邏輯
3. **雙向同步**：修改球員等級時需同步 `players` 與 `members` 兩份狀態
4. **Slot 管理**：操作 `queueSlots` 後記得修剪 trailing nulls
5. **確認對話**：破壞性操作（刪除、清空、結束比賽）務必加 `confirm()` 確認
6. **權限守衛**：新增任何可操作按鈕前，確認是否需要加 `currentUser?.role === 'admin'` 或 `canMovePlayer()` 判斷

### 11.2 UI / UX 規範

- **深色主題**：以 `slate-900` / `slate-950` 為底色，搭配 `indigo` / `emerald` / `amber` 語意色
- **動畫**：使用 `animate-[fadeIn_0.3s_ease-out]` 做淡入過場
- **Hover 顯示**：次要操作按鈕預設隱藏，hover 時顯示（`opacity-0 group-hover:opacity-100`）
- **自己高亮**：登入者自身的球員卡片以白色粗體顯示名字，並加上淡白底（`bg-slate-100/10`）
- **響應式設計**：
  - 行動版：sidebar 以 fixed overlay 呈現，透過 `translate-x` 滑出
  - 桌面版：sidebar 固定、場地 grid 自適應欄數 (`sm:grid-cols-2 2xl:grid-cols-3`)
- **Profile Dropdown**：使用 `useRef` + `mousedown` 的 click-outside 機制關閉，不使用 `onBlur`

### 11.3 語音播報規範

- 使用 Web Speech API (`SpeechSynthesisUtterance`)
- 語系：`zh-TW`
- 語速：`1.0` / 音調：`1.2`（偏高，活潑語氣）
- 每次播報兩遍（queue 兩個 utterance）
- 格式：`「請 A，B，C，D，到 場地X 打球」`

### 11.4 CSV 匯入格式

```csv
姓名,等級
王小明,季打
李大華,零打
```

支援的欄位名稱：
- 姓名：`姓名` / `name` / `名稱`
- 等級：`等級` / `狀態` / `level` / `技能`

支援的等級值：
- 零打 (intermediate)：`intermediate` / `一般` / `零打` / `中階` / `中级`
- 季打 (beginner)：`beginner` / `初階` / `初级` / `季打`

---

## 附錄：狀態轉換圖

```mermaid
stateDiagram-v2
    [*] --> LoginScreen: 首次進入

    LoginScreen --> AdminSession: 選擇「我是團主」
    LoginScreen --> PlayerSession: 選擇「我是球員」+ 選名字

    state AdminSession {
        [*] --> Member: 新增會員
        Member --> Idle_Player: 報到 (checkIn)
        Idle_Player --> Queued_Player: 加入排隊 (joinQueue)
        Queued_Player --> Playing_Player: 開賽 (startMatch)
        Playing_Player --> Idle_Player: 結束比賽/單人下場 (endMatch/restPlayerFromCourt)
        Queued_Player --> Idle_Player: 回休息區 (removeFromQueue)
        Idle_Player --> Member: 早退 (deletePlayer)
        Queued_Player --> Member: 早退 (deletePlayer)
    }

    state PlayerSession {
        [*] --> AutoCheckedIn: 自動報到
        AutoCheckedIn --> SelfQueued: 自己加入排隊
        SelfQueued --> SelfPlaying: 開賽（由 admin 操作）
        SelfPlaying --> SelfIdle: 下場
        SelfQueued --> SelfIdle: 退出排隊
        SelfIdle --> SelfQueued: 重新排隊
    }

    AdminSession --> LoginScreen: 登出
    PlayerSession --> LoginScreen: 登出

    note right of AdminSession: localStorage 持久化（members/players/courts/currentUser）
    note right of PlayerSession: 僅能操作自己的球員卡片
```
