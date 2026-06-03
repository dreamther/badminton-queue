import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore';
import { Player, Court, Member } from './types';

// ==========================================
// Firebase 用戶配置區
// ==========================================
// 💡 請將下方的預留欄位替換為您在 Firebase Console 取得的 Web 應用程式設定金鑰。
// 💡 若尚未設定，系統將自動啟用「LocalStorage Mock 備用模式」，依然可進行完整的本地排隊操作！
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 檢查是否為有效的 Firebase 金鑰配置
export const isFirebaseEnabled = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "YOUR_API_KEY" && 
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

// 初始化 Firebase / Firestore
let app;
let db: any = null;

if (isFirebaseEnabled) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    console.log("⚡ Firebase 服務啟動成功！連線至雲端資料庫。");
  } catch (error) {
    console.error("❌ Firebase 初始化失敗，將降級為 Mock 模式：", error);
  }
} else {
  console.warn("⚠️ Firebase 金鑰尚未配置。系統已啟用【LocalStorage Mock 備用模式】（仍支援跨分頁即時同步）。");
}

// ==========================================
// 資料介面與型別定義
// ==========================================
export interface SpaceMetadata {
  id: string;
  name: string;
  adminPasscode?: string; // 選填的管理員密碼
  spacePasscode?: string; // 選填的空間存取密碼 (專屬密碼)
  createdAt: number;
}

export interface SessionState {
  players: Player[];
  courts: Court[];
  queueSlots: (string | null)[];
  isWarmupDone: boolean;
  announceMode: 'local' | 'all'; // 語音播報設定：僅開賽裝置 | 全裝置
  lastAnnouncement?: {
    text: string;
    timestamp: number;
    deviceId: string;
  };
  updatedAt: number;
}

// 產生隨機裝置 ID，用來識別語音播報的發送端
export const DEVICE_ID = Math.random().toString(36).substring(2, 11);

// ==========================================
// Firestore / Mock 統一介面函數
// ==========================================

/**
 * 檢查空間是否存在
 */
export async function checkSpaceExists(spaceId: string): Promise<boolean> {
  const cleanId = spaceId.trim().toLowerCase();
  if (!cleanId) return false;

  if (isFirebaseEnabled && db) {
    try {
      const spaceDocRef = doc(db, 'spaces', cleanId);
      const snap = await getDoc(spaceDocRef);
      return snap.exists();
    } catch (e) {
      console.error("檢查空間失敗:", e);
      return false;
    }
  } else {
    // Mock 模式：檢查 localStorage 中是否有該空間元資料
    const spaces = JSON.parse(localStorage.getItem('mock_spaces') || '{}');
    return !!spaces[cleanId];
  }
}

/**
 * 建立全新空間與初始化賽局狀態
 */
export async function createSpace(
  spaceId: string, 
  spaceName: string, 
  adminPasscode?: string, 
  spacePasscode?: string
): Promise<void> {
  const cleanId = spaceId.trim().toLowerCase();
  const name = spaceName.trim();
  if (!cleanId || !name) throw new Error("空間 ID 與名稱不可為空");

  const metadata: SpaceMetadata = {
    id: cleanId,
    name,
    adminPasscode: adminPasscode?.trim() || undefined,
    spacePasscode: spacePasscode?.trim() || undefined,
    createdAt: Date.now()
  };

  const initialSession: SessionState = {
    players: [],
    courts: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `場地 ${i + 1}`,
      playerIds: [],
      startTime: null,
    })),
    queueSlots: [],
    isWarmupDone: false,
    announceMode: 'local',
    updatedAt: Date.now()
  };

  if (isFirebaseEnabled && db) {
    const spaceDocRef = doc(db, 'spaces', cleanId);
    await setDoc(spaceDocRef, metadata);

    // 初始化賽局 session
    const sessionDocRef = doc(db, 'spaces', cleanId, 'state', 'session');
    await setDoc(sessionDocRef, initialSession);
  } else {
    // Mock 模式
    const spaces = JSON.parse(localStorage.getItem('mock_spaces') || '{}');
    spaces[cleanId] = metadata;
    localStorage.setItem('mock_spaces', JSON.stringify(spaces));

    localStorage.setItem(`mock_session_${cleanId}`, JSON.stringify(initialSession));
    localStorage.setItem(`mock_members_${cleanId}`, JSON.stringify([]));

    // 發送模擬更新事件
    window.dispatchEvent(new CustomEvent(`mock_session_update_${cleanId}`, { detail: initialSession }));
  }
}

/**
 * 取得空間元資料（如空間名稱、是否需要密碼等）
 */
export async function getSpaceMetadata(spaceId: string): Promise<SpaceMetadata | null> {
  const cleanId = spaceId.trim().toLowerCase();
  if (isFirebaseEnabled && db) {
    const spaceDocRef = doc(db, 'spaces', cleanId);
    const snap = await getDoc(spaceDocRef);
    if (!snap.exists()) return null;
    return snap.data() as SpaceMetadata;
  } else {
    const spaces = JSON.parse(localStorage.getItem('mock_spaces') || '{}');
    return spaces[cleanId] || null;
  }
}

/**
 * 💡 新增：更新空間元資料（例如更改球團名稱、管理員密碼、空間專屬密碼）
 */
export async function updateSpaceMetadata(
  spaceId: string,
  updates: Partial<Omit<SpaceMetadata, 'id' | 'createdAt'>>
): Promise<void> {
  const cleanId = spaceId.trim().toLowerCase();
  if (!cleanId) throw new Error("空間 ID 不可為空");

  if (isFirebaseEnabled && db) {
    const spaceDocRef = doc(db, 'spaces', cleanId);
    await updateDoc(spaceDocRef, updates);
  } else {
    // Mock 模式
    const spaces = JSON.parse(localStorage.getItem('mock_spaces') || '{}');
    if (!spaces[cleanId]) throw new Error("空間不存在");
    spaces[cleanId] = {
      ...spaces[cleanId],
      ...updates
    };
    localStorage.setItem('mock_spaces', JSON.stringify(spaces));

    // 發送自訂更新事件，以利同視窗的其他監聽者接收，並透過 storage 事件同步跨視窗
    window.dispatchEvent(
      new CustomEvent(`mock_space_metadata_update_${cleanId}`, { detail: spaces[cleanId] })
    );
  }
}

/**
 * 💡 新增：訂閱空間元資料變動 (Real-time Space Metadata Sync)
 */
export function subscribeToSpaceMetadata(
  spaceId: string,
  onUpdate: (meta: SpaceMetadata) => void,
  onError?: (error: any) => void
): Unsubscribe {
  const cleanId = spaceId.trim().toLowerCase();

  if (isFirebaseEnabled && db) {
    const spaceDocRef = doc(db, 'spaces', cleanId);
    return onSnapshot(spaceDocRef, (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as SpaceMetadata);
      } else {
        onError?.(new Error("找不到空間元資料文檔"));
      }
    }, (err) => {
      console.error("訂閱空間元資料出錯:", err);
      onError?.(err);
    });
  } else {
    // Mock 模式
    const getLocalMeta = (): SpaceMetadata | null => {
      const spaces = JSON.parse(localStorage.getItem('mock_spaces') || '{}');
      return spaces[cleanId] || null;
    };

    // 立即調用一次
    const initialMeta = getLocalMeta();
    if (initialMeta) onUpdate(initialMeta);

    // 本視窗自訂事件監聽
    const handleCustomEvent = (e: Event) => {
      const customEvt = e as CustomEvent<SpaceMetadata>;
      onUpdate(customEvt.detail);
    };
    window.addEventListener(`mock_space_metadata_update_${cleanId}`, handleCustomEvent);

    // 跨分頁 localStorage 監聽
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'mock_spaces') {
        const updated = getLocalMeta();
        if (updated) onUpdate(updated);
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener(`mock_space_metadata_update_${cleanId}`, handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }
}


/**
 * 訂閱即時賽局狀態同步 (Real-time Session Sync)
 */
export function subscribeToSession(
  spaceId: string, 
  onUpdate: (session: SessionState) => void,
  onError?: (error: any) => void
): Unsubscribe {
  const cleanId = spaceId.trim().toLowerCase();

  if (isFirebaseEnabled && db) {
    const sessionDocRef = doc(db, 'spaces', cleanId, 'state', 'session');
    return onSnapshot(sessionDocRef, (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as SessionState);
      } else {
        onError?.(new Error("找不到賽局狀態文檔"));
      }
    }, (err) => {
      console.error("訂閱賽局監聽出錯:", err);
      onError?.(err);
    });
  } else {
    // Mock 模式：使用 localStorage 與跨視窗事件監聽
    const getLocalSession = (): SessionState => {
      const data = localStorage.getItem(`mock_session_${cleanId}`);
      if (data) return JSON.parse(data);
      return {
        players: [],
        courts: [],
        queueSlots: [],
        isWarmupDone: false,
        announceMode: 'local',
        updatedAt: Date.now()
      };
    };

    // 立即調用一次
    onUpdate(getLocalSession());

    // 1. 本視窗自訂事件監聽
    const handleCustomEvent = (e: Event) => {
      const customEvt = e as CustomEvent<SessionState>;
      onUpdate(customEvt.detail);
    };
    window.addEventListener(`mock_session_update_${cleanId}`, handleCustomEvent);

    // 2. 跨分頁 localStorage 監聽
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === `mock_session_${cleanId}` && e.newValue) {
        onUpdate(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    // 回傳取消訂閱函數
    return () => {
      window.removeEventListener(`mock_session_update_${cleanId}`, handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }
}

/**
 * 更新即時賽局狀態 (Session Update)
 */
export async function updateSession(spaceId: string, updates: Partial<SessionState>): Promise<void> {
  const cleanId = spaceId.trim().toLowerCase();
  
  if (isFirebaseEnabled && db) {
    const sessionDocRef = doc(db, 'spaces', cleanId, 'state', 'session');
    await updateDoc(sessionDocRef, {
      ...updates,
      updatedAt: Date.now()
    });
  } else {
    // Mock 模式
    const dataStr = localStorage.getItem(`mock_session_${cleanId}`);
    const current = dataStr ? JSON.parse(dataStr) : {};
    const updated = {
      ...current,
      ...updates,
      updatedAt: Date.now()
    };
    localStorage.setItem(`mock_session_${cleanId}`, JSON.stringify(updated));

    // 發送自訂事件觸發本視窗更新，並透過 localStorage 自動觸發其他分頁
    window.dispatchEvent(new CustomEvent(`mock_session_update_${cleanId}`, { detail: updated }));
  }
}

// ==========================================
// 會員名冊 (Members Collection) 操作
// ==========================================

/**
 * 訂閱會員清單變動 (Real-time Members Sync)
 * 由於會員名單變動頻率低，使用低頻同步或在有變更時通知
 */
export function subscribeToMembers(
  spaceId: string,
  onUpdate: (members: Member[]) => void
): Unsubscribe {
  const cleanId = spaceId.trim().toLowerCase();

  if (isFirebaseEnabled && db) {
    const membersColRef = collection(db, 'spaces', cleanId, 'members');
    // 會員按時間降序排列
    const q = query(membersColRef, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const list: Member[] = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data() as Member);
      });
      onUpdate(list);
    }, (err) => {
      console.error("訂閱會員名冊出錯:", err);
    });
  } else {
    // Mock 模式
    const getLocalMembers = (): Member[] => {
      const data = localStorage.getItem(`mock_members_${cleanId}`);
      return data ? JSON.parse(data) : [];
    };

    onUpdate(getLocalMembers());

    const handleCustomEvent = (e: Event) => {
      const customEvt = e as CustomEvent<Member[]>;
      onUpdate(customEvt.detail);
    };
    window.addEventListener(`mock_members_update_${cleanId}`, handleCustomEvent);

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === `mock_members_${cleanId}` && e.newValue) {
        onUpdate(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener(`mock_members_update_${cleanId}`, handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }
}

/**
 * 新增會員
 */
export async function addMember(spaceId: string, member: Member): Promise<void> {
  const cleanId = spaceId.trim().toLowerCase();

  if (isFirebaseEnabled && db) {
    const memberDocRef = doc(db, 'spaces', cleanId, 'members', member.id);
    await setDoc(memberDocRef, member);
  } else {
    // Mock 模式
    const list = JSON.parse(localStorage.getItem(`mock_members_${cleanId}`) || '[]');
    list.unshift(member);
    localStorage.setItem(`mock_members_${cleanId}`, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(`mock_members_update_${cleanId}`, { detail: list }));
  }
}

/**
 * 批次新增會員 (例如 CSV 匯入)
 */
export async function addMembersBatch(spaceId: string, newMembers: Member[]): Promise<void> {
  const cleanId = spaceId.trim().toLowerCase();
  if (newMembers.length === 0) return;

  if (isFirebaseEnabled && db) {
    // 批次寫入 Firestore (因瀏覽器端限制，可批次寫入)
    // 這裡為求簡單，直接使用 parallel promises。在資料量不大時（數百筆以內）完全足夠
    const promises = newMembers.map(member => {
      const memberDocRef = doc(db, 'spaces', cleanId, 'members', member.id);
      return setDoc(memberDocRef, member);
    });
    await Promise.all(promises);
  } else {
    // Mock 模式
    const list = JSON.parse(localStorage.getItem(`mock_members_${cleanId}`) || '[]');
    const mergedList = [...newMembers, ...list];
    localStorage.setItem(`mock_members_${cleanId}`, JSON.stringify(mergedList));
    window.dispatchEvent(new CustomEvent(`mock_members_update_${cleanId}`, { detail: mergedList }));
  }
}

/**
 * 更新會員等級
 */
export async function updateMember(spaceId: string, memberId: string, updates: Partial<Member>): Promise<void> {
  const cleanId = spaceId.trim().toLowerCase();

  if (isFirebaseEnabled && db) {
    const memberDocRef = doc(db, 'spaces', cleanId, 'members', memberId);
    await updateDoc(memberDocRef, updates);
  } else {
    // Mock 模式
    const list: Member[] = JSON.parse(localStorage.getItem(`mock_members_${cleanId}`) || '[]');
    const updatedList = list.map(m => m.id === memberId ? { ...m, ...updates } : m);
    localStorage.setItem(`mock_members_${cleanId}`, JSON.stringify(updatedList));
    window.dispatchEvent(new CustomEvent(`mock_members_update_${cleanId}`, { detail: updatedList }));
  }
}

/**
 * 刪除會員
 */
export async function deleteMember(spaceId: string, memberId: string): Promise<void> {
  const cleanId = spaceId.trim().toLowerCase();

  if (isFirebaseEnabled && db) {
    const memberDocRef = doc(db, 'spaces', cleanId, 'members', memberId);
    await deleteDoc(memberDocRef);
  } else {
    // Mock 模式
    const list: Member[] = JSON.parse(localStorage.getItem(`mock_members_${cleanId}`) || '[]');
    const updatedList = list.filter(m => m.id !== memberId);
    localStorage.setItem(`mock_members_${cleanId}`, JSON.stringify(updatedList));
    window.dispatchEvent(new CustomEvent(`mock_members_update_${cleanId}`, { detail: updatedList }));
  }
}
