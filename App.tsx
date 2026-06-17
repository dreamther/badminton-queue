import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  Users, Coffee, ArrowRight, Trash2, Trophy, Plus, Minus, 
  Volume2, VolumeX, X, Swords, UserCheck, Search, CheckCircle2, ChevronDown, 
  ChevronRight, Unlink, LogOut, UserX, Flame, 
  Lock, UserPlus, Upload, FileInput, Settings, MoreVertical, Power, Share2, 
  ArrowLeft, ExternalLink, Key, EyeOff, Shield, AlertTriangle, Info, XCircle,
  Megaphone, ArrowUpDown, Check, ListOrdered
} from 'lucide-react';
import { 
  Player, Court, Member, MAX_PLAYERS_PER_COURT, 
  MemberIdentity, IDENTITIES, CurrentUser 
} from './types';
import { CourtCard } from './components/CourtCard';
import { PlayerAvatar } from './components/PlayerAvatar';

// 引入 Firebase / Mock 服務與型別
import {
  DEVICE_ID,
  checkSpaceExists,
  createSpace,
  deleteSpace,
  getSpaceMetadata,
  updateSpaceMetadata,
  subscribeToSpaceMetadata,
  subscribeToSession,
  updateSession,
  subscribeToMembers,
  addMember,
  addMembersBatch,
  deleteMember,
  type SpaceMetadata,
  type SessionState
} from './firebase';

interface AddMemberBarProps {
  onCreateMember: (name: string, identity: MemberIdentity) => Promise<void>;
}

const AddMemberBar: React.FC<AddMemberBarProps> = ({ onCreateMember }) => {
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState<MemberIdentity>('beginner');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateMember(trimmed, identity);
    setName('');
  };

  return (
    <div className="flex items-center gap-2 h-10">
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="新球員名稱"
          maxLength={10}
          className="w-full h-10 pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base lg:text-sm text-slate-200 placeholder-slate-500"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <UserPlus className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
      </div>

      {/* 自訂下拉選單 */}
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`h-10 pl-3 pr-8 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold flex items-center justify-between w-[88px] cursor-pointer hover:bg-slate-850/80 transition-colors relative
            ${!name.trim() ? 'text-slate-500' : 'text-slate-200'}`}
        >
          <span>{IDENTITIES[identity].label}</span>
          <ChevronDown className={`w-3.5 h-3.5 absolute right-2 pointer-events-none transition-colors ${!name.trim() ? 'text-slate-500' : 'text-slate-400'}`} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1.5 w-28 bg-slate-900 border border-slate-800/80 rounded-lg shadow-xl py-1 z-20 animate-[fadeIn_0.15s_ease-out]">
            {(['admin', 'beginner', 'intermediate'] as MemberIdentity[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setIdentity(id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center gap-1.5
                  ${identity === id ? 'text-indigo-400 bg-slate-800/40' : 'text-slate-300'}`}
              >
                {IDENTITIES[id].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleAdd}
        disabled={!name.trim()}
        className={`h-10 px-3 bg-indigo-600 text-white text-xs font-semibold rounded-lg transition-all shrink-0 flex items-center justify-center
          ${!name.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-500'}`}
      >
        新增
      </button>
    </div>
  );
};

type Tab = 'courts' | 'queue' | 'members';

// 產生安全或相容的 UUID (相容非安全 HTTP 網域環境下的 crypto.randomUUID 未定義)
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// 快取已選擇的本地語音 (避免每次 speak 都重新搜尋)
let cachedLocalVoice: SpeechSynthesisVoice | null = null;
let voiceCacheInitialized = false;

export default function App() {
  // --- 路由與空間 State ---
  const [spaceId, setSpaceId] = useState<string | null>(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/space/')) {
      return hash.substring(8).trim().toLowerCase();
    }
    return null;
  });
  const [spaceMetadata, setSpaceMetadata] = useState<SpaceMetadata | null>(null);
  const [isSpaceLoading, setIsSpaceLoading] = useState(false);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  const [isMembersLoaded, setIsMembersLoaded] = useState(false);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [goodbyePlayerName, setGoodbyePlayerName] = useState<string | null>(null);
  const [goodbyeCountdown, setGoodbyeCountdown] = useState(5);

  // --- 大廳 (Landing Page) 輸入 State ---
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpacePasscode, setNewSpacePasscode] = useState('');
  const [hasPasscode, setHasPasscode] = useState(false);
  const [confirmedHasPasscode, setConfirmedHasPasscode] = useState(false); // 確認完成後才顯示 badge
  const [confirmedPasscode, setConfirmedPasscode] = useState(''); // 上次確認的密碼快照（X 還原用）
  const [newSpaceAccessPasscode, setNewSpaceAccessPasscode] = useState('');
  const [hasSpacePasscode, setHasSpacePasscode] = useState(false);
  const [confirmedHasSpacePasscode, setConfirmedHasSpacePasscode] = useState(false); // 確認完成後才顯示 badge
  const [confirmedAccessPasscode, setConfirmedAccessPasscode] = useState(''); // 上次確認的存取密碼快照（X 還原用）
  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false); // 安全設定彈窗
  const [joinSpaceIdInput, setJoinSpaceIdInput] = useState('');
  
  // --- 球團內部空間設定 State ---
  const [isSpaceSettingsOpen, setIsSpaceSettingsOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false); // 刪除確認彈窗
  const [deleteInputId, setDeleteInputId] = useState(''); // 刪除確認輸入的值
  const [isImportModalOpen, setIsImportModalOpen] = useState(false); // 批次匯入彈窗
  const [importText, setImportText] = useState(''); // 批次匯入貼上內容

  // --- 自訂對話框 (Alert / Confirm) State ---
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    variant?: 'success' | 'warning' | 'info' | 'error';
    message: string;
    title?: string;
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false,
    type: 'alert',
    message: ''
  });

  const showConfirm = useCallback((message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setCustomDialog({
        isOpen: true,
        type: 'confirm',
        message,
        title,
        resolve
      });
    });
  }, []);

  const showAlert = useCallback((message: string, title?: string, variant: 'success' | 'warning' | 'info' | 'error' = 'warning'): Promise<boolean> => {
    return new Promise((resolve) => {
      setCustomDialog({
        isOpen: true,
        type: 'alert',
        variant,
        message,
        title,
        resolve
      });
    });
  }, []);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editHasPasscode, setEditHasPasscode] = useState(false);
  const [editSpacePasscode, setEditSpacePasscode] = useState('');
  const [editHasSpacePasscode, setEditHasSpacePasscode] = useState(false);
  const [editSpaceAccessPasscode, setEditSpaceAccessPasscode] = useState('');
  const [editAllowPlayerAnnounce, setEditAllowPlayerAnnounce] = useState(true);
  const [recentSpaces, setRecentSpaces] = useState<SpaceMetadata[]>(() => {
    const saved = localStorage.getItem('badminton_recent_spaces');
    return saved ? JSON.parse(saved) : [];
  });

  // --- 密碼驗證與身分 State ---
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // 預熱 Web Speech API 的語音清單，解決 Chrome 異步載入 voices 的問題
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const cacheVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0 && !voiceCacheInitialized) {
          // 優先選擇繁體中文的本地語音 (避免 Google 雲端語音在 Chrome macOS 上靜默失敗)
          const zhTWLocal = voices.find(v => v.lang.includes('zh') && v.lang.includes('TW') && v.localService);
          const zhLocal = voices.find(v => v.lang.startsWith('zh') && v.localService);
          const anyZh = voices.find(v => v.lang.startsWith('zh'));
          cachedLocalVoice = zhTWLocal || zhLocal || anyZh || null;
          voiceCacheInitialized = true;
        }
      };
      // 立即嘗試 + 監聽 voiceschanged
      window.speechSynthesis.getVoices();
      cacheVoice();
      window.speechSynthesis.addEventListener('voiceschanged', cacheVoice);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', cacheVoice);
      };
    }
  }, []);
  const [isLoggingInAsPlayer, setIsLoggingInAsPlayer] = useState(false);
  const [loginSearchTerm, setLoginSearchTerm] = useState('');
  const [passcodePromptOpen, setPasscodePromptOpen] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isShaking, setIsShaking] = useState(false);

  // 儲存已驗證的 Admin 憑證，格式為 { [spaceId]: true }
  const [verifiedAdmins, setVerifiedAdmins] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('badminton_verified_admins');
    return saved ? JSON.parse(saved) : {};
  });

  // 儲存已授權進入的球團空間憑證，格式為 { [spaceId]: true }
  const [verifiedSpaces, setVerifiedSpaces] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('badminton_verified_spaces');
    return saved ? JSON.parse(saved) : {};
  });
  const [spacePasscodePromptOpen, setSpacePasscodePromptOpen] = useState(false);
  const [spacePasscodeInput, setSpacePasscodeInput] = useState('');
  const [spacePasscodeError, setSpacePasscodeError] = useState<string | null>(null);
  const [spacePasscodeFailedAttempts, setSpacePasscodeFailedAttempts] = useState(0);
  const [spacePasscodeIsShaking, setSpacePasscodeIsShaking] = useState(false);

  // --- 核心賽局狀態 (與 Firebase 實時同步) ---
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [queueSlots, setQueueSlots] = useState<(string | null)[]>([]);
  const [isWarmupDone, setIsWarmupDone] = useState(false);
  const [allowPlayerAnnounce, setAllowPlayerAnnounce] = useState(true);

  // --- 靜態/低頻同步狀態 ---
  const [members, setMembers] = useState<Member[]>([]);

  // --- UI 與控制狀態 ---
  const [activeTab, setActiveTab] = useState<Tab>('courts');
  const [isRestAreaOpen, setIsRestAreaOpen] = useState(false); 
  const [isAutoAnnounce, setIsAutoAnnounce] = useState(false); // 本地裝置的語音開關
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberSortKey, setMemberSortKey] = useState<'newest' | 'oldest' | 'alphabetical' | 'identity'>('newest');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [restAreaSearchTerm, setRestAreaSearchTerm] = useState('');
  const [isRestAreaSearchExpanded, setIsRestAreaSearchExpanded] = useState(false);

  // 點選移動模式 State
  const [selectedPlayerForMove, setSelectedPlayerForMove] = useState<string | null>(null);

  // Refs
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSessionLoadedRef = useRef<boolean>(false);
  const isCreatingSpaceRef = useRef<boolean>(false);
  const lastLoadedSpaceIdRef = useRef<string | null>(null);

  const isAutoAnnounceRef = useRef(isAutoAnnounce);
  useEffect(() => {
    isAutoAnnounceRef.current = isAutoAnnounce;
  }, [isAutoAnnounce]);


  const lastSpokenTimestampRef = useRef<number>(0);
  const isFirstSessionLoadRef = useRef<boolean>(true);

  // --- 早退掰掰畫面倒數計時 ---
  useEffect(() => {
    if (goodbyePlayerName) {
      setGoodbyeCountdown(5);
      const timer = setInterval(() => {
        setGoodbyeCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setGoodbyePlayerName(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [goodbyePlayerName]);

  // --- 監聽 Hash 路由變化 ---
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/space/')) {
        const id = hash.substring(8).trim().toLowerCase();
        setSpaceId(id);
        setGoodbyePlayerName(null); // 進入空間時，清除掰掰畫面
      } else {
        setSpaceId(null);
        setSpaceMetadata(null);
        setCurrentUser(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // --- 預載語音列表，確保 Chrome 等瀏覽器能正確且即時載入本地語音 ---
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      };
    }
  }, []);

  // --- 載入空間元資料與訂閱實時同步 ---
  useEffect(() => {
    // 每次空間改變，確實重置首次載入的語音播放判定狀態，避免收到舊播報
    isFirstSessionLoadRef.current = true;
    lastSpokenTimestampRef.current = 0;

    if (!spaceId) {
      setPlayers([]);
      setCourts([]);
      setQueueSlots([]);
      setIsWarmupDone(false);
      setMembers([]);
      setSpaceMetadata(null);
      setIsLoggingInAsPlayer(false);
      setLoginSearchTerm('');
      setIsSessionLoaded(false);
      isSessionLoadedRef.current = false;
      setIsMembersLoaded(false);
      setSpaceError(null);
      lastLoadedSpaceIdRef.current = null;
      
      // 回到大廳時，若有已驗證的管理員權限，則清除並移除本地登入紀錄（防範無限重繪迴圈）
      if (Object.keys(verifiedAdmins).length > 0) {
        setVerifiedAdmins({});
        localStorage.removeItem('badminton_verified_admins');
      }
      return;
    }

    let isCancelled = false;
    let unsubMeta: (() => void) | null = null;
    let unsubSession: (() => void) | null = null;
    let unsubMembers: (() => void) | null = null;

    async function initSpace() {
      const isSameSpace = lastLoadedSpaceIdRef.current === spaceId;
      const wasLoaded = isSessionLoadedRef.current && isSameSpace;

      if (!wasLoaded) {
        setIsSpaceLoading(true);
        setIsSessionLoaded(false);
        isSessionLoadedRef.current = false;
        setIsMembersLoaded(false);
      }
      setSpaceError(null);

      try {
        const exists = await checkSpaceExists(spaceId!);
        if (isCancelled) return;
        if (!exists) {
          setSpaceError(`球團空間「${spaceId}」不存在。請確認網址或返回大廳建立全新空間。`);
          setIsSpaceLoading(false);
          return;
        }

        // 訂閱空間元資料變動 (Real-time Space Metadata Sync)
        unsubMeta = subscribeToSpaceMetadata(spaceId!, (meta) => {
          if (isCancelled) {
            if (unsubMeta) unsubMeta();
            return;
          }
          setSpaceMetadata(meta);

          // 記錄至「最近造訪」
          if (meta) {
            setRecentSpaces(prev => {
              const filtered = prev.filter(s => s.id !== meta.id);
              const updated = [meta, ...filtered].slice(0, 5); // 最多保留 5 個
              localStorage.setItem('badminton_recent_spaces', JSON.stringify(updated));
              return updated;
            });
          }
        }, (err) => {
          console.error("訂閱空間元資料失敗:", err);
        });

        // 取得空間 Metadata 用於初始密碼檢查
        const meta = await getSpaceMetadata(spaceId!);
        if (isCancelled) return;
        if (!meta) {
          setSpaceError(`無法取得球團空間「${spaceId}」的資料。`);
          setIsSpaceLoading(false);
          return;
        }

        // 檢查空間專屬存取密碼
        if (meta?.spacePasscode && !verifiedSpaces[spaceId!]) {
          setSpacePasscodeInput('');
          setSpacePasscodeError(null);
          setSpacePasscodeFailedAttempts(0);
          setSpacePasscodeIsShaking(false);
          setSpacePasscodePromptOpen(true);
          setIsSpaceLoading(false);
          return; // 阻斷載入流程，直到驗證成功
        }

        // 嘗試自動還原登入狀態
        const savedUserKey = `badminton_current_user_${spaceId}`;
        const savedUserStr = localStorage.getItem(savedUserKey);
        if (savedUserStr) {
          const savedUser = JSON.parse(savedUserStr);
          // 如果是管理員，需要確認是否已經有驗證過的 token
          if (savedUser.role === 'admin') {
            if (meta?.adminPasscode && !verifiedAdmins[spaceId!]) {
              // 雖然有 local 紀錄，但若空間有設定密碼且本地未標註已驗證，則重置為未登入
              localStorage.removeItem(savedUserKey);
              setCurrentUser(null);
            } else if (currentUserRef.current?.role !== 'admin') {
              // 僅在當前非管理員身分時，才進行自動還原與顯示提示
              setCurrentUser(savedUser);
              setIsAutoAnnounce(false); // 避免聲音通道被鎖定，預設先關閉，由用戶點擊按鈕啟用
              showToast("📢 已還原團主身分，若要播報請點擊語音按鈕");
            }
          } else if (currentUserRef.current?.role !== 'player' || currentUserRef.current?.memberId !== savedUser.memberId) {
            // 僅在當前非對應球員身分時，才自動還原
            setCurrentUser(savedUser);
          }
        } else if (currentUserRef.current !== null) {
          // 本地無紀錄但當前有登入狀態，說明可能需要登出
          setCurrentUser(null);
        }

        if (isCancelled) return;

        // 1. 訂閱核心即時狀態
        unsubSession = subscribeToSession(spaceId!, (session) => {
          if (isCancelled) {
            if (unsubSession) unsubSession();
            return;
          }
          // Map level to identity for backward compatibility
          const mappedPlayers = (session.players || []).map((p: any) => ({
            ...p,
            identity: p.identity || p.level || 'beginner'
          }));
          setPlayers(mappedPlayers);
          setCourts(session.courts || []);
          setQueueSlots(session.queueSlots || []);
          setIsWarmupDone(session.isWarmupDone ?? false);
          
          if (!isSessionLoadedRef.current) {
            const savedUserKey = `badminton_current_user_${spaceId}`;
            const savedUserStr = localStorage.getItem(savedUserKey);
            if (savedUserStr) {
              const savedUser = JSON.parse(savedUserStr);
              if (savedUser.role === 'admin') {
                // 團主若在場地與排隊皆無人的情況下登入，預設切換至報到區
                const sessionCourts = session.courts || [];
                const isCourtsEmpty = sessionCourts.every((c: any) => !c.playerIds || c.playerIds.every((id: any) => id === null));
                const isQueueEmpty = !mappedPlayers.some((p: any) => p.status === 'queued');
                if (isCourtsEmpty && isQueueEmpty) {
                  setActiveTab('members');
                }
              } else if (savedUser.role === 'player') {
                // 為了避免聲音通道鎖定，自動還原的球員一律預設為關閉播報，由其點擊喇叭開啟
                setIsAutoAnnounce(false);
              }
            }
          }

          setAllowPlayerAnnounce(session.allowPlayerAnnounce ?? true);
          setIsSessionLoaded(true);
          isSessionLoadedRef.current = true;

          // 實時語音播報判定
          if (session.lastAnnouncement) {
            const ann = session.lastAnnouncement;
            if (isFirstSessionLoadRef.current) {
              lastSpokenTimestampRef.current = ann.timestamp;
              isFirstSessionLoadRef.current = false;
            } else {
              const isAdmin = currentUserRef.current?.role === 'admin';
              const isAnotherDevice = ann.deviceId !== DEVICE_ID;
              
              if (isAdmin && isAutoAnnounceRef.current && isAnotherDevice) {
                if (ann.timestamp > lastSpokenTimestampRef.current) {
                  lastSpokenTimestampRef.current = ann.timestamp;
                  speak(ann.text);
                }
              }
            }
          } else if (isFirstSessionLoadRef.current) {
            isFirstSessionLoadRef.current = false;
          }
        }, () => {
          setSpaceError("加載賽局狀態失敗，請稍後重試。");
        });

        // 2. 訂閱球員名冊
        unsubMembers = subscribeToMembers(spaceId!, (list) => {
          if (isCancelled) {
            if (unsubMembers) unsubMembers();
            return;
          }
          // Map level to identity for backward compatibility
          const mappedMembers = list.map((m: any) => ({
            ...m,
            identity: m.identity || m.level || 'beginner'
          }));
          setMembers(mappedMembers);
          setIsMembersLoaded(true);
        });

        // 成功建立所有訂閱，記錄當前載入的 SpaceId
        if (!isCancelled) {
          lastLoadedSpaceIdRef.current = spaceId;
        }

      } catch (e) {
        console.error(e);
        if (!isCancelled) {
          setSpaceError("初始化球團空間出錯，請確認網路連線。");
        }
      } finally {
        if (!isCancelled) {
          setIsSpaceLoading(false);
        }
      }
    }

    initSpace();

    return () => {
      isCancelled = true;
      if (unsubMeta) unsubMeta();
      if (unsubSession) unsubSession();
      if (unsubMembers) unsubMembers();
    };
  }, [spaceId, verifiedSpaces, verifiedAdmins]);

  // --- 寫入雲端狀態的封裝函數 ---
  const updateCloudSession = useCallback(async (updates: Partial<SessionState>) => {
    if (!spaceId) return;
    try {
      await updateSession(spaceId, updates);
    } catch (e) {
      console.error("更新賽局狀態失敗:", e);
      showToast("❌ 雲端更新失敗，請檢查網路！");
    }
  }, [spaceId]);

  // --- Profile Menu Click-Outside ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileMenuOpen]);

  // --- Sort Menu Click-Outside ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };
    if (isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSortMenuOpen]);

  // --- 初始化空間設定編輯狀態 ---
  useEffect(() => {
    if (isSpaceSettingsOpen && spaceMetadata) {
      setEditSpaceName(spaceMetadata.name);
      setEditHasPasscode(!!spaceMetadata.adminPasscode);
      setEditSpacePasscode(spaceMetadata.adminPasscode || '');
      setEditHasSpacePasscode(!!spaceMetadata.spacePasscode);
      setEditSpaceAccessPasscode(spaceMetadata.spacePasscode || '');
      setEditAllowPlayerAnnounce(allowPlayerAnnounce);
    }
  }, [isSpaceSettingsOpen, spaceMetadata, allowPlayerAnnounce]);


  // --- 手勢滑動切換分頁 (Mobile Tab Swipe) ---
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // 僅在行動裝置（螢幕寬度 < 1024px）且未開啟選擇移動模式時啟用滑動
    if (window.innerWidth >= 1024 || selectedPlayerForMove !== null) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || selectedPlayerForMove !== null) return;
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStartRef.current.x;
    const diffY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // 門檻值：水平移動需大於 60px，且垂直移動需小於 40px (防止與正常上下滾動衝突)
    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 40) {
      const availableTabs = currentUser?.role === 'player' ? ['queue', 'courts'] : ['members', 'queue', 'courts'];
      const currentIdx = availableTabs.indexOf(activeTab);
      if (currentIdx === -1) return;

      if (diffX < 0) {
        // 向左滑動 -> 切換到右邊下一個分頁 (Next Tab)
        if (currentIdx < availableTabs.length - 1) {
          setActiveTab(availableTabs[currentIdx + 1] as Tab);
        }
      } else {
        // 向右滑動 -> 切換到左邊上一個分頁 (Prev Tab)
        if (currentIdx > 0) {
          setActiveTab(availableTabs[currentIdx - 1] as Tab);
        }
      }
    }
  };

  // 宣告用於提示音的 AudioContext Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // --- 語音引擎解鎖與提示音播放介面 ---
  const activateSpeechEngine = useCallback(() => {
    try {
      // 1. 播放柔和的和弦提示音以確認與解鎖 AudioContext
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now); // E5
      osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.15); // C6
      
      gainNode.gain.setValueAtTime(0.08, now); // 柔和音量
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.25);
      osc2.stop(now + 0.25);

      // 2. 清除 speechSynthesis 可能殘留的卡住狀態 (不發送 dummy utterance，那會導致引擎永久卡死)
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {
      console.warn('[Speech] 提示音播放或語音解鎖失敗:', e);
    }
  }, []);

  // --- 點選移動模式的 Esc 鍵處理 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedPlayerForMove) {
        setSelectedPlayerForMove(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPlayerForMove]);

  // --- 點選移動模式點擊外部取消選取 ---
  useEffect(() => {
    if (!selectedPlayerForMove) return;

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-keep-selection="true"]')) {
        return;
      }
      setSelectedPlayerForMove(null);
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [selectedPlayerForMove]);


  // --- Toast 提示功能 ---
  const [toastCounter, setToastCounter] = useState(0);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    setToastCounter(prev => prev + 1);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 2500);
  };

  // --- 權限防護判定 ---
  const canMovePlayer = useCallback((playerId: string) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    
    const member = members.find(m => m.id === currentUser.memberId);
    if (!member) return false;
    
    const player = players.find(p => p.id === playerId);
    if (!player) return false;
    
    return player.name === member.name;
  }, [currentUser, members, players]);

  // --- 衍生計算資料 (Memo) ---
  const currentUserMember = useMemo(() => {
    if (currentUser?.role === 'player') {
      return members.find(m => m.id === currentUser.memberId) || null;
    }
    return null;
  }, [currentUser, members]);

  const currentMemberName = useMemo(() => {
    return currentUserMember?.name || null;
  }, [currentUserMember]);

  const queue = useMemo(() => {
    const playerMap = new Map(players.map(p => [p.id, p]));
    return queueSlots
      .filter((id): id is string => id !== null)
      .map(id => playerMap.get(id))
      .filter((p): p is Player => p !== undefined);
  }, [players, queueSlots]);

  const idlePlayers = useMemo(() => 
    players.filter(p => p.status === 'idle').sort((a, b) => b.joinedAt - a.joinedAt), 
    [players]
  );

  const filteredIdlePlayers = useMemo(() => {
    let result = idlePlayers;
    if (restAreaSearchTerm) {
      result = idlePlayers.filter(p => p.name.toLowerCase().includes(restAreaSearchTerm.toLowerCase()));
    }
    
    if (currentMemberName) {
      result = [...result].sort((a, b) => {
        if (a.name === currentMemberName) return -1;
        if (b.name === currentMemberName) return 1;
        return 0;
      });
    }
    return result;
  }, [idlePlayers, restAreaSearchTerm, currentMemberName]);

  const idleCourtsCount = useMemo(() => courts.filter(c => c.startTime === null).length, [courts]);

  const getNextMatchBatch = useCallback((slots: (string | null)[], currentPlayers: Player[]) => {
    const playerMap = new Map(currentPlayers.map(p => [p.id, p]));
    for (let i = 0; i < slots.length; i += MAX_PLAYERS_PER_COURT) {
      const chunk = slots.slice(i, i + MAX_PLAYERS_PER_COURT);
      if (chunk.length === MAX_PLAYERS_PER_COURT && chunk.every(id => id !== null)) {
        return chunk.map(id => playerMap.get(id!)).filter((p): p is Player => p !== undefined);
      }
    }
    return [];
  }, []);

  const nextMatchPlayers = useMemo(() => {
    return getNextMatchBatch(queueSlots, players);
  }, [queueSlots, players, getNextMatchBatch]);

  const isQueueReady = nextMatchPlayers.length === MAX_PLAYERS_PER_COURT;

  const filteredMembers = useMemo(() => {
    const term = memberSearchTerm.toLowerCase().trim();
    let result = members.slice();
    if (term) {
      result = result.filter(m => m.name.toLowerCase().includes(term));
    }

    if (memberSortKey === 'newest') {
      result.sort((a, b) => b.createdAt - a.createdAt);
    } else if (memberSortKey === 'oldest') {
      result.sort((a, b) => a.createdAt - b.createdAt);
    } else if (memberSortKey === 'alphabetical') {
      result.sort((a, b) => {
        const isEnglish = (str: string) => /^[A-Za-z]/.test(str);
        const aIsEng = isEnglish(a.name);
        const bIsEng = isEnglish(b.name);
        if (aIsEng && !bIsEng) return -1;
        if (!aIsEng && bIsEng) return 1;
        return a.name.localeCompare(b.name, 'zh-hant');
      });
    } else if (memberSortKey === 'identity') {
      const priority: Record<MemberIdentity, number> = {
        admin: 1,
        beginner: 2,
        intermediate: 3
      };
      result.sort((a, b) => {
        const diff = priority[a.identity] - priority[b.identity];
        if (diff !== 0) return diff;
        return b.createdAt - a.createdAt;
      });
    }

    return result;
  }, [members, memberSearchTerm, memberSortKey]);

  const { notCheckedInMembers } = useMemo(() => {
    const activeNames = new Set(players.map(p => p.name));
    const checkedIn: Member[] = [];
    const notCheckedIn: Member[] = [];

    filteredMembers.forEach(m => {
      if (activeNames.has(m.name)) {
        checkedIn.push(m);
      } else {
        notCheckedIn.push(m);
      }
    });

    return { checkedInMembers: checkedIn, notCheckedInMembers: notCheckedIn };
  }, [players, filteredMembers]);

  const queueDisplayItems = useMemo(() => {
    const playerMap = new Map<string, Player>(players.map(p => [p.id, p]));
    const displayResult: ({ type: 'player', data: Player } | { type: 'empty', id: string })[] = [];

    const minSlots = (courts.length + 1) * 4;
    const slotsFromQueue = queueSlots.length > 0 ? Math.ceil(queueSlots.length / 4) * 4 : 0;
    const totalSlots = Math.max(minSlots, slotsFromQueue);
    for (let i = 0; i < totalSlots; i++) {
      const id = queueSlots[i];
      if (id) {
        const player = playerMap.get(id);
        if (player) {
          displayResult.push({ type: 'player', data: player });
        } else {
          displayResult.push({ type: 'empty', id: `slot-${i}` });
        }
      } else {
        displayResult.push({ type: 'empty', id: `slot-${i}` });
      }
    }
    return displayResult;
  }, [queueSlots, players, courts.length]);

  const chunkedQueueItems = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < queueDisplayItems.length; i += 4) {
      chunks.push(queueDisplayItems.slice(i, i + 4));
    }
    return chunks;
  }, [queueDisplayItems]);

  // --- 語音播報基礎函數 ---
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;

    const synth = window.speechSynthesis;
    
    // 反卡死機制：如果引擎卡在 speaking 狀態，強制連續 cancel 清除
    if (synth.speaking) {
      synth.cancel();
    }
    synth.cancel();

    const createUtterance = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-TW';
      utterance.rate = 1.0;
      utterance.pitch = 1.2;
      // 強制使用已快取的本地語音
      if (cachedLocalVoice) {
        utterance.voice = cachedLocalVoice;
      }
      return utterance;
    };

    // 如果 cancel() 後引擎仍卡住，延遲 250ms 再播放 (給引擎時間 reset)
    const doSpeak = () => {
      const u1 = createUtterance();
      const u2 = createUtterance();
      synth.speak(u1);
      synth.speak(u2);
    };

    if (synth.speaking) {
      // 引擎仍卡住，等待後再試
      setTimeout(() => {
        synth.cancel();
        setTimeout(doSpeak, 50);
      }, 300);
    } else {
      doSpeak();
    }
  }, []);

  // ==========================================
  // 賽局管理與排隊 Action
  // ==========================================

  const joinQueue = useCallback((playerId: string) => {
    setSelectedPlayerForMove(null);

    // 清除已有的排隊位置 (防重)
    const cleanedSlots = queueSlots.map(id => id === playerId ? null : id);
    const updatedSlots = [...cleanedSlots, playerId];
    while (updatedSlots.length > 0 && updatedSlots[updatedSlots.length - 1] === null) updatedSlots.pop();

    const updatedPlayers = players.map(p => 
      p.id === playerId ? { ...p, status: 'queued', joinedAt: Date.now() } as Player : p
    );

    // 確保也從球場中移出 (以防萬一)
    const updatedCourts = courts.map(c => {
      if (!c.playerIds.includes(playerId)) return c;
      const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
      };
    });

    updateCloudSession({ 
      queueSlots: updatedSlots, 
      players: updatedPlayers,
      courts: updatedCourts
    });
  }, [queueSlots, players, courts, updateCloudSession]);

  const insertIntoQueueAt = useCallback((playerId: string, position: number) => {
    setSelectedPlayerForMove(null);

    // 先清除已有的排隊位置 (防重)
    const cleanedSlots = queueSlots.map(id => id === playerId ? null : id);

    const newSlots = [...cleanedSlots];
    while (newSlots.length <= position) newSlots.push(null);
    if (newSlots[position] === null) {
      newSlots[position] = playerId;
    } else {
      newSlots.splice(position, 0, playerId);
    }
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();

    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'queued', joinedAt: Date.now() } as Player : p
    );

    // 確保也從球場中移出 (以防萬一)
    const updatedCourts = courts.map(c => {
      if (!c.playerIds.includes(playerId)) return c;
      const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
      };
    });

    updateCloudSession({ 
      queueSlots: newSlots, 
      players: updatedPlayers,
      courts: updatedCourts
    });
  }, [queueSlots, players, courts, updateCloudSession]);

  const moveInQueue = useCallback((playerId: string, toPosition: number) => {
    setSelectedPlayerForMove(null);
    const newSlots = [...queueSlots];
    const fromIdx = newSlots.indexOf(playerId);
    if (fromIdx === -1) return;

    newSlots[fromIdx] = null;
    while (newSlots.length <= toPosition) newSlots.push(null);
    if (newSlots[toPosition] === null) {
      newSlots[toPosition] = playerId;
    } else {
      const targetId = newSlots[toPosition];
      newSlots[toPosition] = playerId;
      newSlots[fromIdx] = targetId;
    }
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
    updateCloudSession({ queueSlots: newSlots });
  }, [queueSlots, updateCloudSession]);

  const removeFromQueue = useCallback(async (playerId: string) => {
    if (!await showConfirm('確定要讓此球員回到休息區嗎？')) return;
    setSelectedPlayerForMove(null);
    const newSlots = queueSlots.map(id => id === playerId ? null : id);
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'idle' } as Player : p
    );
    updateCloudSession({ queueSlots: newSlots, players: updatedPlayers });
  }, [queueSlots, players, updateCloudSession, showConfirm]);

  const deletePlayer = useCallback(async (playerId: string) => {
    if (await showConfirm('確定要讓此球員早退嗎？')) {
      setSelectedPlayerForMove(prev => prev === playerId ? null : prev);
      const newSlots = queueSlots.map(id => id === playerId ? null : id);
      while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
      
      // 找出該球員目前在哪個場地上
      const activeCourt = courts.find(c => c.playerIds.includes(playerId));
      
      let updatedCourts = courts;
      let shouldResetWarmup = false;
      
      if (activeCourt) {
        // 只有早退的人離開場地（該位置設為 null），其他人保留在場地上
        updatedCourts = courts.map(c => {
          if (c.id === activeCourt.id) {
            const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
            while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
            return { ...c, playerIds: newPlayerIds, startTime: null };
          }
          return c;
        });
        
        // 如果原本已經是「已熱身」狀態（isWarmupDone === true），解除回到「熱身中」以允許強制拉人上場
        if (isWarmupDone) {
          shouldResetWarmup = true;
        }
      }
      
      const updatedPlayers = players.filter(p => p.id !== playerId);

      updateCloudSession({ 
        queueSlots: newSlots, 
        players: updatedPlayers, 
        courts: updatedCourts,
        ...(shouldResetWarmup ? { isWarmupDone: false } : {})
      });
    }
  }, [queueSlots, players, courts, isWarmupDone, updateCloudSession, showConfirm]);

  const restAllQueue = useCallback(async () => {
    const queuedCount = players.filter(p => p.status === 'queued').length;
    if (queuedCount === 0) return;

    if (await showConfirm(`確定要讓排隊中的 ${queuedCount} 人全部回到休息區嗎？`)) {
      const updatedPlayers = players.map(p =>
        p.status === 'queued' ? { ...p, status: 'idle' } as Player : p
      );
      updateCloudSession({ queueSlots: [], players: updatedPlayers });
    }
  }, [players, updateCloudSession, showConfirm]);


  const resetSession = useCallback(async () => {
    if (await showConfirm('確定要結束今日打球嗎？\n所有球員將會回到未報到狀態。')) {
      setSelectedPlayerForMove(null);
      const clearedCourts = courts.map(c => ({ ...c, playerIds: [], startTime: null }));
      updateCloudSession({
        players: [],
        queueSlots: [],
        isWarmupDone: false,
        courts: clearedCourts
      });
    }
  }, [courts, updateCloudSession, showConfirm]);

  const addCourt = useCallback(() => {
    const nextId = courts.length > 0 ? Math.max(...courts.map(c => c.id)) + 1 : 1;
    const newCourt: Court = {
      id: nextId,
      name: `場地 ${nextId}`,
      playerIds: [],
      startTime: null,
    };
    updateCloudSession({ courts: [...courts, newCourt] });
  }, [courts, updateCloudSession]);

  const removeCourt = useCallback(async () => {
    if (courts.length <= 1) {
      await showAlert("至少需要保留一個場地");
      return;
    }
    const lastCourt = courts[courts.length - 1];
    if (lastCourt.playerIds.some(id => id !== null)) {
      await showAlert(`無法移除 ${lastCourt.name}：場上還有人`);
      return;
    }
    updateCloudSession({ courts: courts.slice(0, -1) });
  }, [courts, updateCloudSession, showAlert]);

  const renameCourt = useCallback(async (courtId: number, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      await showAlert("場地名稱不能為空");
      return;
    }
    const updatedCourts = courts.map(c =>
      c.id === courtId ? { ...c, name: trimmedName } : c
    );
    updateCloudSession({ courts: updatedCourts });
  }, [courts, updateCloudSession, showAlert]);

  const announceCourtPlayers = useCallback((courtId: number) => {
    const court = courts.find(c => c.id === courtId);
    if (!court || !court.playerIds.some(id => id !== null)) return;

    const playerNames = court.playerIds
      .map(id => players.find(p => p.id === id)?.name)
      .filter(Boolean);

    if (playerNames.length > 0) {
      const announcementText = `請 ${playerNames.join('，')}，到${court.name}打球`;
      
      const isPlayer = currentUser?.role === 'player';
      const shouldSyncAnnounce = !isPlayer || allowPlayerAnnounce;
      
      if (shouldSyncAnnounce) {
        // 更新雲端廣播信號
        updateCloudSession({
          lastAnnouncement: {
            text: announcementText,
            timestamp: Date.now(),
            deviceId: DEVICE_ID
          }
        });
        
        // 如果是本地端（且為團主啟用狀態），立即播放以提高反應度
        const isAdmin = currentUser?.role === 'admin';
        if (isAdmin && isAutoAnnounce) {
          speak(announcementText);
        }
      }
    }
  }, [courts, players, currentUser, allowPlayerAnnounce, isAutoAnnounce, speak, updateCloudSession]);

  const startMatch = useCallback(async (courtId: number) => {
    const playersToStart = getNextMatchBatch(queueSlots, players);
    if (playersToStart.length < MAX_PLAYERS_PER_COURT) {
      await showAlert("人數不足四人，無法開賽。請等待球員補滿空位。");
      return;
    }

    const playerIds = playersToStart.map(p => p.id);
    const playerNames = playersToStart.map(p => p.name);
    const court = courts.find(c => c.id === courtId);

    // 建立播報文字
    let announcementText = '';
    if (court) {
      announcementText = `請 ${playerNames.join('，')}，到${court.name}打球`;
      
      // 只有團主開啟本地播報時，才直接在本地端播放
      const isAdmin = currentUser?.role === 'admin';
      if (isAdmin && isAutoAnnounce) {
        speak(announcementText);
      }
    }

    const updatedPlayers = players.map(p =>
      playerIds.includes(p.id) ? { ...p, status: 'playing' } as Player : p
    );

    const newSlots = queueSlots.filter(id => id === null || !playerIds.includes(id));
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();

    const updatedCourts = courts.map(c =>
      c.id === courtId ? { ...c, playerIds, startTime: Date.now() } : c
    );

    const isPlayer = currentUser?.role === 'player';
    const shouldSyncAnnounce = !isPlayer || allowPlayerAnnounce;

    // 同步賽局與語音信號至雲端
    updateCloudSession({
      players: updatedPlayers,
      queueSlots: newSlots,
      courts: updatedCourts,
      ...(shouldSyncAnnounce && announcementText ? {
        lastAnnouncement: {
          text: announcementText,
          timestamp: Date.now(),
          deviceId: DEVICE_ID
        }
      } : {})
    });
  }, [queueSlots, players, courts, speak, isAutoAnnounce, currentUser, allowPlayerAnnounce, getNextMatchBatch, updateCloudSession, showAlert]);

  const endMatch = useCallback((courtId: number) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const finishedPlayerIds = court.playerIds;
    const updatedCourts = courts.map(c =>
      c.id === courtId ? { ...c, playerIds: [], startTime: null } : c
    );
    const updatedPlayers = players.map(p =>
      finishedPlayerIds.includes(p.id) ? { ...p, status: 'idle' } as Player : p
    );
    updateCloudSession({ courts: updatedCourts, players: updatedPlayers });
  }, [courts, players, updateCloudSession]);

  const restPlayerFromCourt = useCallback(async (playerId: string) => {
    if (!await showConfirm('確定要讓此球員下場休息嗎？')) return;
    setSelectedPlayerForMove(null);
    
    const updatedCourts = courts.map(c => {
      if (!c.playerIds.includes(playerId)) return c;
      const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
      };
    });
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'idle' } as Player : p
    );
    updateCloudSession({ courts: updatedCourts, players: updatedPlayers });
  }, [courts, players, updateCloudSession, showConfirm]);

  const handleWarmupToggle = useCallback(async () => {
    if (!isWarmupDone) {
      if (idleCourtsCount > 0) {
        await showAlert('目前場地尚未滿場，請保持熱身階段🔥');
        return;
      }
      if (await showConfirm('確定要結束熱身嗎？')) {
        updateCloudSession({ isWarmupDone: true });
      }
    } else {
      if (await showConfirm('確定要重新開始熱身嗎？\n(會開放直接排上場的功能)')) {
        updateCloudSession({ isWarmupDone: false });
      }
    }
  }, [idleCourtsCount, isWarmupDone, updateCloudSession, showConfirm, showAlert]);

  const dropPlayerToCourt = useCallback((courtId: number, playerId: string) => {
    setSelectedPlayerForMove(null);
    const court = courts.find(c => c.id === courtId);
    if (!court || court.playerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT) return;
    if (court.playerIds.includes(playerId)) return;

    // 1. 從排隊中移出
    const newSlots = queueSlots.map(id => id === playerId ? null : id);
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();

    // 2. 從其他場地移出 (跨場拖曳)
    const cleanCourts = courts.map(c => {
      if (!c.playerIds.includes(playerId)) return c;
      const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
      };
    });

    // 3. 加入新場地
    const updatedCourts = cleanCourts.map(c => {
      if (c.id !== courtId) return c;
      const newPlayerIds = [...c.playerIds];
      while (newPlayerIds.length < MAX_PLAYERS_PER_COURT) newPlayerIds.push(null);
      const nextEmptySlot = newPlayerIds.indexOf(null);
      if (nextEmptySlot !== -1) {
        newPlayerIds[nextEmptySlot] = playerId;
      } else {
        newPlayerIds.push(playerId);
      }
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
      
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? (c.startTime || Date.now()) : c.startTime
      };
    });

    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'playing' } as Player : p
    );

    updateCloudSession({
      queueSlots: newSlots,
      courts: updatedCourts,
      players: updatedPlayers
    });
  }, [courts, queueSlots, players, updateCloudSession]);

  const movePlayerFromCourtToQueue = useCallback((playerId: string, toPosition?: number) => {
    setSelectedPlayerForMove(null);

    // 1. 從所有球場中徹底移出該玩家
    const updatedCourts = courts.map(c => {
      if (!c.playerIds.includes(playerId)) return c;
      const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
      };
    });

    // 2. 加入排隊 (並從排隊的其他地方移出，以防重複)
    const newSlots = queueSlots.map(id => id === playerId ? null : id);
    if (toPosition === undefined) {
      newSlots.push(playerId);
    } else {
      while (newSlots.length <= toPosition) newSlots.push(null);
      if (newSlots[toPosition] === null) {
        newSlots[toPosition] = playerId;
      } else {
        newSlots.splice(toPosition, 0, playerId);
      }
    }
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();

    // 3. 更新玩家狀態
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'queued', joinedAt: Date.now() } as Player : p
    );

    // 4. 單一更新
    updateCloudSession({
      courts: updatedCourts,
      queueSlots: newSlots,
      players: updatedPlayers
    });
  }, [courts, queueSlots, players, updateCloudSession]);

  const movePlayerToCourtSlot = useCallback((playerId: string, courtId: number, slotIdx: number) => {
    setSelectedPlayerForMove(null);

    // 1. 從排隊區移除該玩家
    const newSlots = queueSlots.map(id => id === playerId ? null : id);
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();

    // 2. 預備玩家狀態更新 (預設將移動的玩家 status 設為 'playing')
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'playing' } as Player : p
    );

    // 3. 更新所有場地以確保沒有重複
    const updatedCourts = courts.map(c => {
      // 標準化 slots：清除該場地中所有原本就等於 playerId 的重複值
      const slots: (string | null)[] = Array.from({ length: MAX_PLAYERS_PER_COURT }, (_, i) => c.playerIds[i] ?? null)
        .map(id => id === playerId ? null : id);

      if (c.id !== courtId) {
        const newPlayerIds = [...slots];
        while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
        return {
          ...c,
          playerIds: newPlayerIds,
          startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
        };
      }

      // 目標場地處理
      const targetIdx = Math.min(slotIdx, MAX_PLAYERS_PER_COURT - 1);
      const originallyOnThisCourt = c.playerIds.includes(playerId);
      const originalSlotIdx = c.playerIds.indexOf(playerId);

      if (slots[targetIdx] !== null) {
        if (originallyOnThisCourt && originalSlotIdx !== -1) {
          // 如果原本就在同個場地，進行位置對調 (Swap)
          slots[originalSlotIdx] = slots[targetIdx];
        } else {
          // 如果是從別的地方移入，而被覆蓋的球員則下場休息 (設為 idle)
          const displacedPlayerId = slots[targetIdx];
          if (displacedPlayerId) {
            const idxInPlayers = updatedPlayers.findIndex(p => p.id === displacedPlayerId);
            if (idxInPlayers !== -1) {
              updatedPlayers[idxInPlayers] = { ...updatedPlayers[idxInPlayers], status: 'idle' } as Player;
            }
          }
        }
      }

      slots[targetIdx] = playerId;

      const newPlayerIds = [...slots];
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();

      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? (c.startTime || Date.now()) : null
      };
    });

    updateCloudSession({
      queueSlots: newSlots,
      players: updatedPlayers,
      courts: updatedCourts
    });
  }, [courts, queueSlots, players, updateCloudSession]);

  // ==========================================
  // 球員管理與報到 Action (寫入 Firestore / Mock)
  // ==========================================

  const createMember = useCallback(async (nameToAdd: string, identitySelected: MemberIdentity) => {
    if (!spaceId) return;
    const name = nameToAdd.trim();
    if (!name) return;

    if (members.some(m => m.name === name)) {
      await showAlert('此球員已存在');
      return;
    }

    const newMember: Member = {
      id: generateUUID(),
      name: name,
      identity: identitySelected,
      createdAt: Date.now()
    };

    try {
      await addMember(spaceId, newMember);
    } catch (e) {
      await showAlert("新增球員失敗");
    }
  }, [spaceId, members, showAlert]);

  const parseCsvAndImport = useCallback(async (csvText: string) => {
    if (!spaceId) return;
    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        await showAlert('CSV 檔案格式錯誤：至少需要標題列和一筆資料');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIndex = headers.findIndex(h => h === 'name');
      const identityIndex = headers.findIndex(h => h === 'identity');

      if (nameIndex === -1) {
        await showAlert('CSV 格式錯誤：缺少「Name」欄位');
        return;
      }

      if (identityIndex === -1) {
        await showAlert('CSV 格式錯誤：缺少「Identity」欄位');
        return;
      }

      const newMembers: Member[] = [];
      const skippedNames: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());
        const name = values[nameIndex];
        if (!name) continue;

        if (members.some(m => m.name === name) || newMembers.some(m => m.name === name)) {
          skippedNames.push(name);
          continue;
        }

        let identity: MemberIdentity = 'beginner'; // 預設為社員 (beginner)
        const identityValue = values[identityIndex]?.trim();
        if (identityValue === '零打') {
          identity = 'intermediate';
        } else if (identityValue === '管理員') {
          identity = 'admin';
        }

        newMembers.push({
          id: generateUUID(),
          name,
          identity,
          createdAt: Date.now()
        });
      }

      if (newMembers.length > 0) {
        await addMembersBatch(spaceId, newMembers);
      }

      let message = `成功匯入 ${newMembers.length} 位球員`;
      if (skippedNames.length > 0) {
        message += `\n跳過 ${skippedNames.length} 位重複球員：${skippedNames.join(', ')}`;
      }
      await showAlert(message, undefined, 'success');
      setIsImportModalOpen(false); // 關閉對話框
    } catch (error) {
      await showAlert('CSV 檔案解析失敗，請確認檔案格式正確');
    }
  }, [spaceId, members, showAlert]);

  const handleTextareaImport = useCallback(async (inputText: string) => {
    if (!spaceId) return;
    try {
      const lines = inputText.split('\n').map(l => l.trim());
      const newMembers: Member[] = [];
      const skippedNames: string[] = [];

      for (const line of lines) {
        if (!line) continue;
        const parts = line.split(/\s+/);
        const name = parts[0];
        if (!name) continue;

        if (members.some(m => m.name === name) || newMembers.some(m => m.name === name)) {
          skippedNames.push(name);
          continue;
        }

        let identity: MemberIdentity = 'beginner'; // 預設為社員 (beginner)
        const identityValue = parts[1]?.trim();
        if (identityValue === '零打') {
          identity = 'intermediate';
        } else if (identityValue === '管理員') {
          identity = 'admin';
        }

        newMembers.push({
          id: generateUUID(),
          name,
          identity,
          createdAt: Date.now()
        });
      }

      if (newMembers.length > 0) {
        await addMembersBatch(spaceId, newMembers);
      }

      let message = `成功匯入 ${newMembers.length} 位球員`;
      if (skippedNames.length > 0) {
        message += `\n跳過 ${skippedNames.length} 位重複球員：${skippedNames.join(', ')}`;
      }
      await showAlert(message, undefined, 'success');
      setImportText('');
      setIsImportModalOpen(false);
    } catch (error) {
      await showAlert('批次匯入失敗，請檢查輸入格式');
    }
  }, [spaceId, members, showAlert]);

  const handleBatchImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      await showAlert('請上傳 CSV 格式的檔案');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCsvAndImport(text);
    };
    reader.readAsText(file, 'UTF-8');
    if (event.target) event.target.value = '';
  }, [parseCsvAndImport, showAlert]);


  const selectPlayerAndNavigate = useCallback((playerId: string) => {
    const targetCourt = courts.find(c => c.playerIds.includes(playerId));
    const isOnCourt = !!targetCourt;
    
    if (isOnCourt) {
      setSelectedPlayerForMove(null);
      setActiveTab('courts');
      
      // 平滑滾動與雙次白色呼吸燈閃爍定位
      setTimeout(() => {
        const slotElement = document.getElementById(`player-slot-${playerId}`);
        if (slotElement) {
          slotElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          slotElement.classList.add('highlight-pulse-white-twice');
          setTimeout(() => {
            slotElement.classList.remove('highlight-pulse-white-twice');
          }, 2500);
        } else if (targetCourt) {
          const courtElement = document.getElementById(`court-${targetCourt.id}`);
          if (courtElement) {
            courtElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 200);
    } else {
      setSelectedPlayerForMove(playerId);
      if (window.innerWidth >= 1024) {
        setActiveTab('queue');
      } else {
        const hasEmptySlot = courts.some(
          c => c.playerIds.length < MAX_PLAYERS_PER_COURT || c.playerIds.some(id => id === null)
        );
        if (!isWarmupDone && hasEmptySlot) {
          setActiveTab('courts');
        } else {
          setActiveTab('queue');
        }
      }
    }
  }, [courts, isWarmupDone, setActiveTab, setSelectedPlayerForMove]);

  const [checkInSuccessName, setCheckInSuccessName] = useState<string | null>(null);
  const [checkInCounter, setCheckInCounter] = useState(0);
  const checkInTimeoutRef = useRef<any>(null);

  const checkInMember = useCallback((member: Member) => {
    const existingPlayer = players.find(p => p.name === member.name);
    if (existingPlayer) return existingPlayer.id;

    const newId = generateUUID();
    const newPlayer: Player = {
      id: newId,
      name: member.name,
      status: 'idle',
      identity: member.identity,
      joinedAt: Date.now(),
    };
    
    updateCloudSession({ players: [...players, newPlayer] });

    // 清除上一次的定時器，避免排隊的舊定時器提早將新報到提示關閉
    if (checkInTimeoutRef.current) {
      clearTimeout(checkInTimeoutRef.current);
    }

    setCheckInSuccessName(member.name);
    setCheckInCounter(prev => prev + 1); // 遞增 Key 強制重組 DOM (重新觸發 CSS 動畫)

    checkInTimeoutRef.current = setTimeout(() => {
      setCheckInSuccessName(null);
      checkInTimeoutRef.current = null;
    }, 3500);

    return newId;
  }, [players, updateCloudSession]);

  // --- 專屬球員自動報到與選取邏輯 ---
  const hasAutoSelectedRef = useRef(false);
  const hasCheckedInOnMountRef = useRef(false);

  // 當 spaceId 或登入球員變更時，重置自動選取與報到狀態
  useEffect(() => {
    hasAutoSelectedRef.current = false;
    hasCheckedInOnMountRef.current = false;
  }, [spaceId, currentUser?.memberId, currentUser?.role]);

  useEffect(() => {
    if (
      spaceId &&
      !spaceError &&
      !isSpaceLoading &&
      isSessionLoaded &&
      isMembersLoaded &&
      currentUser?.role === 'player' &&
      currentUser.memberId
    ) {
      const member = members.find(m => m.id === currentUser.memberId);
      if (!member) return;

      const currentMemberName = member.name;
      const matchedPlayer = players.find(p => p.name === currentMemberName);

      if (!matchedPlayer) {
        // 尚未報到
        if (!hasCheckedInOnMountRef.current) {
          // 首次載入或切換身分，執行自動報到
          console.log(`[Auto Check-In] 球員 ${currentMemberName} 尚未報到，執行自動報到...`);
          const pId = checkInMember(member);
          if (pId) {
            selectPlayerAndNavigate(pId);
            hasAutoSelectedRef.current = true;
          }
          hasCheckedInOnMountRef.current = true;
        } else {
          // 之前已經報到過，但現在不見了，說明已被移出賽局（早退），此時自動登出並顯示掰掰畫面，最後返回大廳
          console.log(`[Auto Logout] 球員 ${currentMemberName} 已早退/被移出，自動清除登入狀態。`);
          localStorage.removeItem(`badminton_current_user_${spaceId}`);
          setGoodbyePlayerName(currentMemberName);
          window.location.hash = ''; // 將會觸發 handleHashChange 清除 currentUser 等狀態，直接返回大廳
          setIsLoggingInAsPlayer(false);
          setLoginSearchTerm('');
          setSelectedPlayerForMove(null);
        }
      } else {
        // 已經報到
        hasCheckedInOnMountRef.current = true;
        if (!hasAutoSelectedRef.current) {
          // 如果尚未進行過自動選取，且球員在休息區 (idle) 或場地區 (playing)，則自動導航/定位
          const isOnCourt = courts.some(c => c.playerIds.includes(matchedPlayer.id));
          if (matchedPlayer.status === 'idle' || isOnCourt) {
            console.log(`[Auto Select/Navigate] 自動選取/定位場上或休息區球員 ${currentMemberName}`);
            selectPlayerAndNavigate(matchedPlayer.id);
          }
          hasAutoSelectedRef.current = true;
        }
      }
    }
  }, [
    spaceId,
    spaceError,
    isSpaceLoading,
    isSessionLoaded,
    isMembersLoaded,
    currentUser,
    members,
    players,
    courts,
    checkInMember,
    selectPlayerAndNavigate
  ]);

  const removeMember = useCallback(async (memberId: string) => {
    if (!spaceId) return;
    if (await showConfirm('確定要刪除此球員嗎？')) {
      try {
        await deleteMember(spaceId, memberId);
      } catch (e) {
        await showAlert("刪除球員失敗");
      }
    }
  }, [spaceId, showConfirm, showAlert]);

  // ==========================================
  // 管理員密碼驗證邏輯
  // ==========================================
  const handleAdminLoginAttempt = () => {
    if (!spaceMetadata) return;

    // 若無設定密碼，直接進入 admin
    if (!spaceMetadata.adminPasscode) {
      const user: CurrentUser = { role: 'admin' };
      setCurrentUser(user);
      localStorage.setItem(`badminton_current_user_${spaceId}`, JSON.stringify(user));
      setIsAutoAnnounce(false); // 團主登入預設關閉播報，需主動點擊解鎖
      
      const isCourtsEmpty = courts.every(c => !c.playerIds || c.playerIds.every(id => id === null));
      const isQueueEmpty = !players.some(p => p.status === 'queued');
      if (isCourtsEmpty && isQueueEmpty) {
        setActiveTab('members');
      } else {
        setActiveTab(window.innerWidth >= 1024 ? 'queue' : 'courts');
      }
      
      showToast("✨ 已成功切換為團主模式");
      return;
    }

    // 若有設定密碼且之前已驗證過，也直接進入
    if (spaceId && verifiedAdmins[spaceId]) {
      const user: CurrentUser = { role: 'admin' };
      setCurrentUser(user);
      localStorage.setItem(`badminton_current_user_${spaceId}`, JSON.stringify(user));
      setIsAutoAnnounce(false); // 團主登入預設關閉播報，需主動點擊解鎖
      
      const isCourtsEmpty = courts.every(c => !c.playerIds || c.playerIds.every(id => id === null));
      const isQueueEmpty = !players.some(p => p.status === 'queued');
      if (isCourtsEmpty && isQueueEmpty) {
        setActiveTab('members');
      } else {
        setActiveTab(window.innerWidth >= 1024 ? 'queue' : 'courts');
      }
      return;
    }

    // 否則，打開密碼輸入提示
    setPasscodeInput('');
    setPasscodeError(null);
    setFailedAttempts(0);
    setIsShaking(false);
    setPasscodePromptOpen(true);
  };

  const handleVerifyPasscode = () => {
    if (!spaceMetadata || !spaceId) return;

    if (passcodeInput.trim() === spaceMetadata.adminPasscode) {
      // 驗證成功
      const user: CurrentUser = { role: 'admin' };
      setCurrentUser(user);
      localStorage.setItem(`badminton_current_user_${spaceId}`, JSON.stringify(user));
      setIsAutoAnnounce(false); // 團主登入預設關閉播報，需主動點擊解鎖

      // 儲存已驗證標記
      const updatedVerified = { ...verifiedAdmins, [spaceId]: true };
      setVerifiedAdmins(updatedVerified);
      localStorage.setItem('badminton_verified_admins', JSON.stringify(updatedVerified));

      setPasscodePromptOpen(false);
      setFailedAttempts(0);
      setIsShaking(false);
      
      const isCourtsEmpty = courts.every(c => !c.playerIds || c.playerIds.every(id => id === null));
      const isQueueEmpty = !players.some(p => p.status === 'queued');
      if (isCourtsEmpty && isQueueEmpty) {
        setActiveTab('members');
      } else {
        setActiveTab(window.innerWidth >= 1024 ? 'queue' : 'courts');
      }
      
      showToast("🔑 密碼驗證成功！進入管理模式。");
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setPasscodeError(`密碼錯誤，請重新輸入 (已錯誤 ${nextAttempts} 次)`);
      
      // 觸發震動效果
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500); // 500ms 後停止震動
    }
  };

  const handleVerifySpacePasscode = () => {
    if (!spaceMetadata || !spaceId) return;

    if (spacePasscodeInput.trim() === spaceMetadata.spacePasscode) {
      // 驗證成功
      const updated = { ...verifiedSpaces, [spaceId]: true };
      setVerifiedSpaces(updated);
      localStorage.setItem('badminton_verified_spaces', JSON.stringify(updated));
      
      setSpacePasscodePromptOpen(false);
      setSpacePasscodeFailedAttempts(0);
      setSpacePasscodeIsShaking(false);
      showToast("🔓 空間驗證成功！歡迎進入。");
    } else {
      const nextAttempts = spacePasscodeFailedAttempts + 1;
      setSpacePasscodeFailedAttempts(nextAttempts);
      setSpacePasscodeError(`密碼錯誤，請重新輸入 (已錯誤 ${nextAttempts} 次)`);
      
      // 觸發震動效果
      setSpacePasscodeIsShaking(true);
      setTimeout(() => setSpacePasscodeIsShaking(false), 500);
    }
  };

  // 處理儲存球團內部空間設定
  const handleSaveSpaceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spaceId) return;

    const trimmedName = editSpaceName.trim();
    if (trimmedName === '') {
      showToast("❌ 球團名稱不能為空！");
      return;
    }

    if (editHasPasscode && (editSpacePasscode.length < 4 || editSpacePasscode.length > 10)) {
      showToast("❌ 管理員密碼長度需為 4-10 位！");
      return;
    }

    if (editHasSpacePasscode && (editSpaceAccessPasscode.length < 4 || editSpaceAccessPasscode.length > 10)) {
      showToast("❌ 空間存取密碼長度需為 4-10 位！");
      return;
    }

    try {
      const updates: any = {
        name: trimmedName,
        adminPasscode: editHasPasscode ? editSpacePasscode.trim() : null,
        spacePasscode: editHasSpacePasscode ? editSpaceAccessPasscode.trim() : null,
      };

      await updateSpaceMetadata(spaceId, updates);
      await updateCloudSession({ allowPlayerAnnounce: editAllowPlayerAnnounce });
      
      // 同步更新當前本地的驗證狀態 (僅在密碼啟用狀態或密碼內容有變更時才更新，避免觸發不必要的訂閱重置)
      const hasPasscodeChanged = editHasPasscode !== (!!spaceMetadata?.adminPasscode);
      const adminPasscodeValChanged = editHasPasscode && editSpacePasscode.trim() !== (spaceMetadata?.adminPasscode || '');
      
      if (hasPasscodeChanged || adminPasscodeValChanged) {
        if (!editHasPasscode) {
          const updatedVerified = { ...verifiedAdmins };
          delete updatedVerified[spaceId];
          setVerifiedAdmins(updatedVerified);
          localStorage.setItem('badminton_verified_admins', JSON.stringify(updatedVerified));
        } else {
          const updatedVerified = { ...verifiedAdmins, [spaceId]: true };
          setVerifiedAdmins(updatedVerified);
          localStorage.setItem('badminton_verified_admins', JSON.stringify(updatedVerified));
        }
      }

      const hasSpacePasscodeChanged = editHasSpacePasscode !== (!!spaceMetadata?.spacePasscode);
      const spacePasscodeValChanged = editHasSpacePasscode && editSpaceAccessPasscode.trim() !== (spaceMetadata?.spacePasscode || '');

      if (hasSpacePasscodeChanged || spacePasscodeValChanged) {
        if (!editHasSpacePasscode) {
          const updatedVerifiedSpaces = { ...verifiedSpaces };
          delete updatedVerifiedSpaces[spaceId];
          setVerifiedSpaces(updatedVerifiedSpaces);
          localStorage.setItem('badminton_verified_spaces', JSON.stringify(updatedVerifiedSpaces));
        } else {
          const updatedVerifiedSpaces = { ...verifiedSpaces, [spaceId]: true };
          setVerifiedSpaces(updatedVerifiedSpaces);
          localStorage.setItem('badminton_verified_spaces', JSON.stringify(updatedVerifiedSpaces));
        }
      }

      setIsSpaceSettingsOpen(false);
      showToast("✨ 球團設定已成功更新！");
    } catch (err) {
      console.error(err);
      showToast("❌ 更新設定失敗，請確認網路連線。");
    }
  };

  // ==========================================
  // 刪除球團空間邏輯
  // ==========================================
  const handleDeleteSpaceConfirm = async () => {
    if (!spaceId) return;
    if (deleteInputId.trim().toLowerCase() !== spaceId.toLowerCase()) {
      await showAlert("輸入的球團 ID 不正確，請重新輸入。");
      return;
    }

    try {
      setIsSpaceLoading(true);
      
      // 先移出該空間，觸發退訂，避免刪除過程中收到 Firestore「文檔不存在」的錯誤事件
      window.location.hash = '';
      
      // 等待短暫的 100 毫秒，確保路由切換與退訂已執行完畢
      await new Promise(resolve => setTimeout(resolve, 100));

      await deleteSpace(spaceId);

      // 清理管理員與空間存取授權憑證
      const updatedVerifiedAdmins = { ...verifiedAdmins };
      delete updatedVerifiedAdmins[spaceId];
      setVerifiedAdmins(updatedVerifiedAdmins);
      localStorage.setItem('badminton_verified_admins', JSON.stringify(updatedVerifiedAdmins));

      const updatedVerifiedSpaces = { ...verifiedSpaces };
      delete updatedVerifiedSpaces[spaceId];
      setVerifiedSpaces(updatedVerifiedSpaces);
      localStorage.setItem('badminton_verified_spaces', JSON.stringify(updatedVerifiedSpaces));

      // 清理「最近造訪」紀錄
      const updatedRecent = recentSpaces.filter(s => s.id !== spaceId);
      setRecentSpaces(updatedRecent);
      localStorage.setItem('badminton_recent_spaces', JSON.stringify(updatedRecent));

      setIsDeleteConfirmOpen(false);
      setIsSpaceSettingsOpen(false);
      setDeleteInputId('');

      showToast("👋 球團已成功刪除！已為您返回系統大廳");
    } catch (e) {
      console.error(e);
      await showAlert("刪除球團失敗，請確認網路或稍後重試。");
    } finally {
      setIsSpaceLoading(false);
    }
  };

  // ==========================================
  // 大廳 (Landing Page) 動作
  // ==========================================
  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingSpaceRef.current) return;

    const cleanId = newSpaceId.trim().toLowerCase();
    const name = newSpaceName.trim();
    const passcode = newSpacePasscode.trim();
    const spacePasscode = newSpaceAccessPasscode.trim();

    if (hasPasscode && (passcode.length < 4 || passcode.length > 10)) {
      await showAlert("管理員密碼長度必須在 4 到 10 位數之間！");
      return;
    }
    if (hasSpacePasscode && (spacePasscode.length < 4 || spacePasscode.length > 10)) {
      await showAlert("空間專屬存取密碼長度必須在 4 到 10 位數之間！");
      return;
    }

    isCreatingSpaceRef.current = true;
    setIsSpaceLoading(true);
    try {
      const exists = await checkSpaceExists(cleanId);
      if (exists) {
        await showAlert("此空間 ID 已被使用，請另選一個網址。");
        return;
      }

      await createSpace(
        cleanId, 
        name, 
        hasPasscode ? passcode : undefined,
        hasSpacePasscode ? spacePasscode : undefined
      );
      
      // 自動標註此空間為管理員已驗證 (因為是自己建的)
      if (hasPasscode && passcode) {
        const updatedVerified = { ...verifiedAdmins, [cleanId]: true };
        setVerifiedAdmins(updatedVerified);
        localStorage.setItem('badminton_verified_admins', JSON.stringify(updatedVerified));
      }

      // 自動授權此球團的專屬存取密碼 (因為是自己建的)
      if (hasSpacePasscode && spacePasscode) {
        const updatedVerifiedSpaces = { ...verifiedSpaces, [cleanId]: true };
        setVerifiedSpaces(updatedVerifiedSpaces);
        localStorage.setItem('badminton_verified_spaces', JSON.stringify(updatedVerifiedSpaces));
      }

      // 重置大廳輸入
      setNewSpaceId('');
      setNewSpaceName('');
      setNewSpacePasscode('');
      setNewSpaceAccessPasscode('');
      setHasPasscode(false);
      setHasSpacePasscode(false);

      // 跳轉至新空間
      window.location.hash = `#/space/${cleanId}`;
    } catch (e) {
      console.error(e);
      await showAlert("建立空間失敗，請確認網路或稍後重試。");
    } finally {
      isCreatingSpaceRef.current = false;
      setIsSpaceLoading(false);
    }
  };

  // 複製分享連結
  const handleCopyLink = () => {
    const url = window.location.href;
    
    // 優先使用 navigator.clipboard (需 HTTPS 或 localhost 才能使用)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          showToast("🔗 已成功複製分享網址！");
        })
        .catch((err) => {
          console.error("Clipboard copy failed:", err);
          fallbackCopyText(url);
        });
    } else {
      fallbackCopyText(url);
    }
  };

  const fallbackCopyText = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // 避免滾動且不可見
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showToast("🔗 已成功複製分享網址！");
      } else {
        showToast("❌ 複製網址失敗，請手動複製");
      }
    } catch (err) {
      console.error("Fallback copy failed:", err);
      showToast("❌ 複製網址失敗，請手動複製");
    }
    
    document.body.removeChild(textArea);
  };

  // 格式化空間 ID 輸入防呆
  const handleSpaceIdInputChange = (val: string) => {
    // 僅允許小寫英數字與連字號，並防止連續連字號
    const formatted = val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    setNewSpaceId(formatted);
  };

  // 計算行動版 Tabs 滑動底線樣式
  const getMobileUnderlineStyle = () => {
    const isPlayer = currentUser?.role === 'player';
    if (isPlayer) {
      const width = '50%';
      const left = activeTab === 'queue' ? '0%' : '100%';
      return { width, left };
    } else {
      const width = '33.333%';
      let left = '0%';
      if (activeTab === 'queue') left = '100%';
      if (activeTab === 'courts') left = '200%';
      return { width, left };
    }
  };

  // 計算桌機版 Tabs 滑動底線樣式
  const getDesktopUnderlineStyle = () => {
    const isPlayer = currentUser?.role === 'player';
    if (isPlayer) {
      return { width: '100%', left: '0%' };
    } else {
      const desktopAsideTab = activeTab === 'courts' ? 'queue' : activeTab;
      const width = '50%';
      const left = desktopAsideTab === 'members' ? '0%' : '100%';
      return { width, left };
    }
  };

  // 刪除最近造訪的球團紀錄
  const handleDeleteRecentSpace = async (id: string) => {
    const confirmed = await showConfirm("確定要移除此造訪紀錄嗎？");
    if (!confirmed) return;

    setRecentSpaces(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem('badminton_recent_spaces', JSON.stringify(updated));
      return updated;
    });
    showToast("🗑️ 已移除該造訪紀錄");
  };

  // ==========================================
  // 渲染早退掰掰畫面 (Goodbye Screen)
  // ==========================================
  if (goodbyePlayerName) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-slate-100 overflow-y-auto">
        <div className="min-h-full w-full flex flex-col items-center justify-center p-4 relative">
          {/* 背景發光光暈容器 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]" />
          </div>

          {/* 玻璃擬態卡片 */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-6 xs:p-7 sm:p-8 max-w-sm w-full mx-auto text-center shadow-2xl shadow-indigo-950/20 z-10 animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
            
            {/* 線條小雞 SVG 動畫 */}
            <div className="mb-6 flex justify-center">
              <svg 
                viewBox="0 0 200 200" 
                className="w-44 h-44 text-indigo-400/90 drop-shadow-[0_0_12px_rgba(129,140,248,0.25)]"
              >
                <style>{`
                  @keyframes chick-bob {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-5px) rotate(-2deg); }
                  }
                  @keyframes chick-left-leg {
                    0%, 100% { transform: rotate(0deg); }
                    50% { transform: rotate(-25deg); }
                  }
                  @keyframes chick-right-leg {
                    0%, 100% { transform: rotate(0deg); }
                    50% { transform: rotate(25deg); }
                  }
                  @keyframes chick-tail {
                    0%, 100% { transform: rotate(0deg); }
                    50% { transform: rotate(12deg); }
                  }
                  @keyframes chick-wing {
                    0%, 100% { transform: rotate(0deg); }
                    50% { transform: rotate(-8deg); }
                  }
                  .chick-body-group {
                    animation: chick-bob 0.8s ease-in-out infinite;
                    transform-origin: 100px 150px;
                  }
                  .chick-left-leg-group {
                    animation: chick-left-leg 0.8s ease-in-out infinite;
                    transform-origin: 75px 142px;
                  }
                  .chick-right-leg-group {
                    animation: chick-right-leg 0.8s ease-in-out infinite;
                    transform-origin: 110px 152px;
                  }
                  .chick-tail-group {
                    animation: chick-tail 0.8s ease-in-out infinite;
                    transform-origin: 129px 130px;
                  }
                  .chick-wing-group {
                    animation: chick-wing 0.8s ease-in-out infinite;
                    transform-origin: 82px 112px;
                  }
                  @keyframes shrink-progress {
                    from { width: 100%; }
                    to { width: 0%; }
                  }
                  .progress-bar-fill {
                    animation: shrink-progress 5s linear forwards;
                  }
                `}</style>
                
                {/* 地面陰影 */}
                <ellipse cx="105" cy="180" rx="35" ry="5" fill="rgba(30, 41, 59, 0.4)" />

                {/* 左腳 (踢向後方) */}
                <g className="chick-left-leg-group">
                  <path d="M 75,142 L 56,145" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M 56,145 L 56,135" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <path d="M 56,145 L 46,145" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <path d="M 56,145 L 50,154" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                </g>

                {/* 右腳 (踩向前方) */}
                <g className="chick-right-leg-group">
                  <path d="M 110,152 L 122,172" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M 122,172 L 132,176" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <path d="M 122,172 L 125,182" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <path d="M 122,172 L 114,178" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                </g>

                {/* 尾巴 (擺動) */}
                <g className="chick-tail-group">
                  <path d="M 129,130 C 137,130 146,134 146,138 C 146,142 137,144 129,136 Z" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M 129,133 L 142,138" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </g>

                {/* 身體與頭部組合 */}
                <g className="chick-body-group">
                  {/* 呆毛 */}
                  <path d="M 112,45 C 114,35 120,32 124,34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <path d="M 116,46 C 118,36 126,34 130,37" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />

                  {/* 身體輪廓 */}
                  <path d="M 82,90 C 72,85 70,68 78,58 C 86,48 102,42 118,46 C 134,50 142,66 138,80 C 136,90 128,95 124,98 C 128,110 124,101 129,122 C 131,138 124,150 110,152 C 95,154 80,148 75,135 C 70,122 72,102 82,90 Z" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

                  {/* 滿足的幸福雙眼 (^^) */}
                  <path d="M 76,60 Q 80,64 84,61" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <path d="M 96,62 Q 100,66 104,63" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />

                  {/* 嘴巴 */}
                  <path d="M 68,72 C 60,72 58,80 66,82 L 82,78 C 90,76 88,68 80,68 Z" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

                  {/* 前翅膀 */}
                  <g className="chick-wing-group">
                    <path d="M 82,112 C 78,110 74,102 78,98 C 82,94 86,100 84,106 C 82,112 86,120 92,118 C 96,116 94,110 90,110" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </g>

                  {/* 後翅膀 */}
                  <path d="M 116,118 C 122,120 128,118 128,112 C 128,106 122,104 118,108" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </g>
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-slate-100 mb-2">再見，{goodbyePlayerName}！</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              辛苦了～<br />
              期待下次再一起開心打球 🏸
            </p>

            {/* 倒數進度條 */}
            <div className="space-y-2">
              <div className="w-full bg-slate-800/50 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="progress-bar-fill bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                將在 {goodbyeCountdown} 秒後自動返回大廳
              </p>
            </div>

            {/* 返回大廳按鈕 */}
            <button
              onClick={() => setGoodbyePlayerName(null)}
              className="mt-6 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all duration-200 flex items-center justify-center gap-1.5"
            >
              直接返回大廳
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 渲染大廳 (Landing Page)
  // ==========================================
  if (!spaceId) {
    return (
      <div className="relative h-[100dvh] w-screen bg-slate-950 text-slate-100 flex flex-col overflow-y-auto overflow-x-hidden">
        {/* 背景發光光暈容器（使用 overflow-hidden 嚴格剪裁，防範行動裝置版面拓寬） */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]" />
        </div>

        {/* 頂部裝飾 */}
        <header className="h-16 px-4 border-b border-slate-900 flex justify-between items-center z-10 shrink-0 bg-slate-950/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/25">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">羽球排隊助手</h1>
          </div>
          <span className="text-xs text-slate-500 font-mono">v1.3.0</span>
        </header>

        {/* 主內容區 */}
        <main className="flex-1 flex items-center justify-center py-10 px-6 z-10">
          <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 my-auto">
            
            {/* 左側：進入/加入空間 */}
            <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl flex flex-col justify-between min-h-[460px]">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                    <ExternalLink className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">進入已建立球團</h2>
                </div>
                <p className="text-sm text-slate-400 mb-6">輸入現有球團 ID，或是從下方「最近造訪」進入球團。</p>

                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (joinSpaceIdInput.trim()) {
                    window.location.hash = `#/space/${joinSpaceIdInput.trim().toLowerCase()}`;
                  }
                }} className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="例如：happy-badminton"
                      className="w-full h-12 pl-4 pr-12 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-600 text-slate-200 text-base transition-all font-mono"
                      value={joinSpaceIdInput}
                      onChange={e => setJoinSpaceIdInput(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={!joinSpaceIdInput.trim()}
                      className="absolute right-2 top-2 w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-lg text-white transition-all shadow-md"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>

                {/* 最近造訪紀錄 */}
                <div className="mt-8 flex-1 flex flex-col min-h-0">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">最近造訪的球團</h3>
                  {recentSpaces.length === 0 ? (
                    <div className="py-6 text-center border border-dashed border-slate-800/60 rounded-2xl text-slate-600 text-xs">
                      目前此瀏覽器尚無造訪紀錄
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[230px] overflow-y-auto pr-1.5 flex-1 min-h-0 scroll-smooth [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.800)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                      {recentSpaces.map(space => (
                        <div
                          key={space.id}
                          onClick={() => window.location.hash = `#/space/${space.id}`}
                          className="w-full flex items-center justify-between py-3.5 px-3.5 bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800 rounded-xl transition-all text-left group relative cursor-pointer"
                        >
                          {/* 內容展示區域 */}
                          <div 
                            className="flex-1 flex items-center justify-between min-w-0 pr-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* <span className="text-xl">🏸</span> */}
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">{space.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono truncate">ID: {space.id}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 shrink-0">
                              {space.spacePasscode && (
                                <span className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/25 text-[10px] font-medium px-2 py-0.5 rounded-full text-rose-400 shrink-0">
                                  <Lock className="w-3 h-3 animate-pulse" />
                                  <span className="hidden lg:inline">私密</span>
                                </span>
                              )}
                              {space.adminPasscode && (
                                <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/25 text-[10px] font-medium px-2 py-0.5 rounded-full text-amber-400 shrink-0">
                                  <Key className="w-3 h-3" />
                                  <span className="hidden lg:inline">管理</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 刪除紀錄按鈕 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRecentSpace(space.id);
                            }}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 z-10"
                            title="刪除此造訪紀錄"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右側：建立全新空間 */}
            <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl flex flex-col justify-between min-h-[460px]">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">建立全新球團空間</h2>
                </div>
                <p className="text-sm text-slate-400 mb-6">為球團建立專屬的「即時排隊看板」，分享網址讓球員一同加入，享受方便的打球時光！</p>

                <form onSubmit={handleCreateSpace} className="space-y-4">
                  {/* 球團名稱 */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">球團名稱</label>
                    <input
                      type="text"
                      placeholder="例如：快樂週三羽球團"
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-base lg:text-sm placeholder-slate-700 transition-all"
                      value={newSpaceName}
                      onChange={e => setNewSpaceName(e.target.value)}
                      required
                    />
                  </div>

                  {/* 空間 ID */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">專屬網址 ID (限小寫英數字與連字號)</label>
                    <input
                      type="text"
                      placeholder="例如：happy-badminton"
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-base lg:text-sm font-mono placeholder-slate-700 transition-all"
                      value={newSpaceId}
                      onChange={e => handleSpaceIdInputChange(e.target.value)}
                      required
                    />
                    <div className="text-[10px] text-slate-500 font-mono mt-2.5 leading-tight truncate">
                      網址預覽: {window.location.origin}{window.location.pathname}#/space/{newSpaceId || '[您的空間ID]'}
                    </div>
                    <p className="text-[9px] text-rose-400/80 mt-1.5 leading-none font-medium">
                      ⚠️ 提醒：專屬網址 ID 建立後即無法變更。
                    </p>
                  </div>

                  {/* 進階安全防護設定按鈕 */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsSecuritySettingsOpen(true)}
                      className="w-full h-11 flex items-center justify-between px-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all group text-left shadow-inner"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                        <span className="text-xs font-semibold text-slate-300">安全與私密防護設定</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {confirmedHasPasscode && (
                          <span className="flex items-center bg-amber-500/10 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20">
                            🔑<span className="hidden lg:inline ml-0.5">管理</span>
                          </span>
                        )}
                        {confirmedHasSpacePasscode && (
                          <span className="flex items-center bg-rose-500/10 text-rose-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-rose-500/20">
                            🔒<span className="hidden lg:inline ml-0.5">私密</span>
                          </span>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isSpaceLoading}
                    className="w-full h-12 mt-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                  >
                    {isSpaceLoading ? '建立中...' : '建立並進入空間 🏸'}
                  </button>
                </form>
              </div>
            </div>

          </div>
        </main>

        {/* 底部 */}
        <footer className="px-6 py-6 border-t border-slate-900 text-center text-xs text-slate-600 z-10 shrink-0 bg-slate-950/60 backdrop-blur-md">
          © {new Date().getFullYear()} Badminton Queue Assistant. Powered by Firebase Firestore. Built for Speed and Simplicity.
        </footer>

        {/* 進階安全防護設定彈窗 */}
        {isSecuritySettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-slate-900 border border-slate-800 p-4 xs:p-5 sm:p-6 rounded-3xl max-w-sm w-full shadow-2xl relative overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  // X 關閉 = 取消，完整還原到上次「確認完成」的狀態
                  setHasPasscode(confirmedHasPasscode);
                  setNewSpacePasscode(confirmedPasscode);
                  setHasSpacePasscode(confirmedHasSpacePasscode);
                  setNewSpaceAccessPasscode(confirmedAccessPasscode);
                  setIsSecuritySettingsOpen(false);
                }}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center mb-5">
                <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-3">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">安全與私密防護設定</h3>
                <p className="text-xs text-slate-400 mt-1">設定管理權限與球團的進入權限</p>
              </div>

              <div className="space-y-5">
                {/* 1. 管理員密碼 */}
                <div className="bg-slate-950/50 p-3 xs:p-4 border border-slate-800/80 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between select-none">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-slate-200">啟用管理員密碼</span>
                    </div>
                    {/* iOS 風格 Switch Toggle */}
                    <div 
                      onClick={() => {
                        const nextVal = !hasPasscode;
                        setHasPasscode(nextVal);
                        if (!nextVal) setNewSpacePasscode(''); // 停用時清空輸入值
                      }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer flex items-center shrink-0 ${
                        hasPasscode ? 'bg-indigo-600' : 'bg-slate-800'
                      }`}
                    >
                      <div 
                        className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                          hasPasscode ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    防制一般球員在場邊隨意更改球場配置，啟用後切換為「團主」需輸入密碼。
                  </p>
                  <div className="pt-1">
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={hasPasscode ? "請設定管理密碼 (4-10 位)" : "管理密碼已停用"}
                      disabled={!hasPasscode}
                      className={`w-full h-10 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-base lg:text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
                        hasPasscode 
                          ? 'border-slate-800 focus:ring-indigo-500 opacity-100' 
                          : 'border-slate-900/50 opacity-30 cursor-not-allowed select-none'
                      }`}
                      value={newSpacePasscode}
                      onChange={e => setNewSpacePasscode(e.target.value)}
                      required={hasPasscode}
                    />
                    {/* 靜態高度驗證提示，完全防止 Layout Shift */}
                    <div className="flex justify-between items-center mt-1.5 px-1 text-[9px]">
                      <span className={`transition-all duration-300 ${
                        !hasPasscode 
                          ? "text-slate-600 opacity-40" 
                          : newSpacePasscode.length === 0 
                            ? "text-slate-500" 
                            : (newSpacePasscode.length >= 4 && newSpacePasscode.length <= 10) 
                              ? "text-emerald-400 font-semibold" 
                              : "text-amber-500 font-semibold"
                      }`}>
                        {!hasPasscode 
                          ? "—" 
                          : newSpacePasscode.length === 0 
                            ? "請輸入 4-10 位密碼" 
                            : (newSpacePasscode.length >= 4 && newSpacePasscode.length <= 10) 
                              ? "✓ 密碼長度安全" 
                              : "⚠ 密碼長度不符 (需為 4-10 位)"
                        }
                      </span>
                      <span className={`font-mono transition-all duration-300 ${
                        !hasPasscode 
                          ? "text-slate-600 opacity-40" 
                          : (newSpacePasscode.length >= 4 && newSpacePasscode.length <= 10) 
                            ? "text-slate-400" 
                            : "text-amber-500 font-semibold"
                      }`}>
                        {hasPasscode ? `${newSpacePasscode.length}/10` : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. 空間存取密碼 */}
                <div className="bg-slate-950/50 p-3 xs:p-4 border border-slate-800/80 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between select-none">
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-semibold text-slate-200">啟用私密球團空間</span>
                    </div>
                    {/* iOS 風格 Switch Toggle */}
                    <div 
                      onClick={() => {
                        const nextVal = !hasSpacePasscode;
                        setHasSpacePasscode(nextVal);
                        if (!nextVal) setNewSpaceAccessPasscode(''); // 停用時清空輸入值
                      }}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer flex items-center shrink-0 ${
                        hasSpacePasscode ? 'bg-indigo-600' : 'bg-slate-800'
                      }`}
                    >
                      <div 
                        className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                          hasSpacePasscode ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    設定此球團專屬的存取密碼。非公開球團，其他球員需要輸入此密碼才能進入該網址。
                  </p>
                  <div className="pt-1">
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={hasSpacePasscode ? "請設定空間存取密碼 (4-10 位)" : "空間密碼已停用"}
                      disabled={!hasSpacePasscode}
                      className={`w-full h-10 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-base lg:text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
                        hasSpacePasscode 
                          ? 'border-slate-800 focus:ring-indigo-500 opacity-100' 
                          : 'border-slate-900/50 opacity-30 cursor-not-allowed select-none'
                      }`}
                      value={newSpaceAccessPasscode}
                      onChange={e => setNewSpaceAccessPasscode(e.target.value)}
                      required={hasSpacePasscode}
                    />
                    {/* 靜態高度驗證提示，完全防止 Layout Shift */}
                    <div className="flex justify-between items-center mt-1.5 px-1 text-[9px]">
                      <span className={`transition-all duration-300 ${
                        !hasSpacePasscode 
                          ? "text-slate-600 opacity-40" 
                          : newSpaceAccessPasscode.length === 0 
                            ? "text-slate-500" 
                            : (newSpaceAccessPasscode.length >= 4 && newSpaceAccessPasscode.length <= 10) 
                              ? "text-emerald-400 font-semibold" 
                              : "text-amber-500 font-semibold"
                      }`}>
                        {!hasSpacePasscode 
                          ? "—" 
                          : newSpaceAccessPasscode.length === 0 
                            ? "請輸入 4-10 位密碼" 
                            : (newSpaceAccessPasscode.length >= 4 && newSpaceAccessPasscode.length <= 10) 
                              ? "✓ 密碼長度安全" 
                              : "⚠ 密碼長度不符 (需為 4-10 位)"
                        }
                      </span>
                      <span className={`font-mono transition-all duration-300 ${
                        !hasSpacePasscode 
                          ? "text-slate-600 opacity-40" 
                          : (newSpaceAccessPasscode.length >= 4 && newSpaceAccessPasscode.length <= 10) 
                            ? "text-slate-400" 
                            : "text-amber-500 font-semibold"
                      }`}>
                        {hasSpacePasscode ? `${newSpaceAccessPasscode.length}/10` : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (hasPasscode && (newSpacePasscode.length < 4 || newSpacePasscode.length > 10)) {
                      await showAlert("管理員密碼長度必須在 4 到 10 位數之間！");
                      return;
                    }
                    if (hasSpacePasscode && (newSpaceAccessPasscode.length < 4 || newSpaceAccessPasscode.length > 10)) {
                      await showAlert("空間專屬存取密碼長度必須在 4 到 10 位數之間！");
                      return;
                    }
                    // 驗證通過，更新已確認 badge 狀態與密碼快照
                    setConfirmedHasPasscode(hasPasscode);
                    setConfirmedPasscode(hasPasscode ? newSpacePasscode : '');
                    setConfirmedHasSpacePasscode(hasSpacePasscode);
                    setConfirmedAccessPasscode(hasSpacePasscode ? newSpaceAccessPasscode : '');
                    setIsSecuritySettingsOpen(false);
                  }}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg"
                >
                  確認完成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 自訂對話框 (Alert / Confirm) - 確保大廳頁面中觸發的 showAlert/showConfirm 也能正常顯示 */}
        {customDialog.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl relative flex flex-col text-center">
              {/* 圖標 (Icon) */}
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-indigo-500/10 text-indigo-400">
                {(() => {
                  if (customDialog.type === 'confirm') {
                    return <Info className="w-6 h-6" />;
                  }
                  const variant = customDialog.variant || 'warning';
                  if (variant === 'success') {
                    return <CheckCircle2 className="w-6 h-6" />;
                  }
                  if (variant === 'error') {
                    return <XCircle className="w-6 h-6" />;
                  }
                  if (variant === 'info') {
                    return <Info className="w-6 h-6" />;
                  }
                  return <AlertTriangle className="w-6 h-6" />;
                })()}
              </div>
              {customDialog.title && (
                <h3 className="text-base font-bold text-white mb-2">{customDialog.title}</h3>
              )}
              <p className="text-sm text-slate-300 break-words leading-relaxed mb-6 whitespace-pre-line">
                {customDialog.message}
              </p>
              <div className="flex gap-3 justify-center">
                {customDialog.type === 'confirm' && (
                  <button
                    onClick={() => {
                      if (customDialog.resolve) customDialog.resolve(false);
                      setCustomDialog(prev => ({ ...prev, isOpen: false }));
                    }}
                    className="flex-1 px-4 py-2 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold rounded-xl transition-colors min-w-[5.5rem]"
                  >
                    取消
                  </button>
                )}
                <button
                  onClick={() => {
                    if (customDialog.resolve) customDialog.resolve(true);
                    setCustomDialog(prev => ({ ...prev, isOpen: false }));
                  }}
                  className="flex-1 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-colors min-w-[5.5rem]"
                >
                  確定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // 渲染錯誤與私密驗證頁面 (優先判定，避免攔截)
  // ==========================================
  if (spaceError) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-slate-200 overflow-y-auto">
        <div className="min-h-full w-full flex flex-col items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto">
              <Unlink className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">球團空間加載失敗</h2>
            <p className="text-slate-400 text-sm leading-relaxed">{spaceError}</p>
            <button
              onClick={() => window.location.hash = ''}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> 返回系統大廳
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 私密空間驗證 UI
  // ==========================================
  if (spacePasscodePromptOpen) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-slate-200 overflow-y-auto">
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
            20%, 40%, 60%, 80% { transform: translateX(6px); }
          }
          .animate-shake {
            animation: shake 0.4s ease-in-out;
          }
        `}</style>
        
        <div className="min-h-full w-full flex flex-col items-center justify-center p-4">
          <div className={`bg-slate-900 border border-slate-800 p-6 xs:p-7 sm:p-8 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden text-center ${spacePasscodeIsShaking ? 'animate-shake' : ''}`}>
            {/* 返回鍵 */}
            <button
              onClick={() => window.location.hash = ''}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="返回大廳"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex justify-center mb-6 mt-2">
              <div className="bg-indigo-500/10 text-indigo-400 p-4 rounded-full flex items-center justify-center">
                <EyeOff className="w-8 h-8" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">私密球團空間驗證</h2>
            <p className="text-sm text-slate-400 mb-6">
              此空間（ID: <span className="font-mono text-indigo-400">{spaceId}</span>）設有專屬存取密碼。請輸入密碼以進入觀看或操作。
            </p>

            <div className="space-y-4">
              <input
                type="password"
                autoComplete="current-password"
                placeholder="請輸入空間專屬密碼"
                className="w-full h-12 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-mono text-slate-200 placeholder-slate-700"
                value={spacePasscodeInput}
                onChange={e => setSpacePasscodeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerifySpacePasscode()}
                autoFocus
              />

              {spacePasscodeError && (
                <p className="text-xs text-rose-400 text-center font-medium animate-[fadeIn_0.2s_ease-out]">
                  ❌ {spacePasscodeError}
                </p>
              )}

              <button
                onClick={handleVerifySpacePasscode}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                進入球團
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 渲染載入中頁面
  // ==========================================
  if (isSpaceLoading || (spaceId && (!isSessionLoaded || !isMembersLoaded))) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-4">
        <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
        <p className="text-sm text-slate-400 font-medium">正在加載「{spaceId}」賽局狀態與雲端連線中...</p>
      </div>
    );
  }

  // ==========================================
  // 登入選擇 UI (已指定 SpaceID 後)
  // ==========================================
  if (!currentUser) {
    const loginFilteredMembers = members
      .filter(m => m.name.toLowerCase().includes(loginSearchTerm.toLowerCase().trim()))
      .sort((a, b) => b.createdAt - a.createdAt);

    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-slate-200 overflow-y-auto">
        <div className="min-h-full w-full flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 xs:p-7 sm:p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-auto relative overflow-hidden animate-[fadeIn_0.2s_ease-out]">
          
          {/* 返回大廳按鈕 */}
          {/* 返回鍵：球員選取時返回身分選取，否則返回大廳 */}
          <button
            onClick={() => {
              if (isLoggingInAsPlayer) {
                setIsLoggingInAsPlayer(false);
                setLoginSearchTerm('');
              } else {
                window.location.hash = '';
              }
            }}
            className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title={isLoggingInAsPlayer ? "返回上一頁" : "返回大廳"}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex justify-center mb-6 mt-2">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg shadow-indigo-500/20">
              <Trophy className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-center text-white truncate max-w-xs">{spaceMetadata?.name}</h1>
          <p className="text-xs text-slate-500 text-center font-mono mb-6">ID: {spaceId}</p>
          <p className="text-slate-400 text-center text-sm mb-6">
            {isLoggingInAsPlayer ? '請選擇您的姓名進行報到' : '選擇您的身分進入系統'}
          </p>

          {!isLoggingInAsPlayer ? (
            <div className="space-y-4">
              <button
                onClick={handleAdminLoginAttempt}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                <Users className="w-5 h-5" />
                我是團主 (Admin)
              </button>
              <div className="relative py-2">
                <div className="absolute inset-y-0 left-0 w-full flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-slate-900 px-2 text-slate-500 font-medium">或</span>
                </div>
              </div>
              <button
                onClick={() => setIsLoggingInAsPlayer(true)}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-all border border-slate-700"
              >
                <UserCheck className="w-5 h-5" />
                我是球員 (Player)
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜尋名字..."
                  className="w-full h-10 pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base lg:text-sm text-slate-200"
                  value={loginSearchTerm}
                  onChange={e => setLoginSearchTerm(e.target.value)}
                  autoFocus
                />
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              </div>
              <div className="max-h-60 overflow-y-auto scrollbar-gutter-stable space-y-2 pr-1">
                {loginFilteredMembers.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    {loginSearchTerm ? '找不到符合的球員' : '目前尚無球員，請聯絡管理員新增'}
                  </div>
                ) : (
                  loginFilteredMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => {
                        const user: CurrentUser = { role: 'player', memberId: member.id };
                        setCurrentUser(user);
                        setIsAutoAnnounce(false); // 球員端不播音
                        
                        const pId = checkInMember(member);
                        if (pId) {
                          selectPlayerAndNavigate(pId);
                          hasAutoSelectedRef.current = true;
                        } else {
                          setActiveTab('queue');
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-slate-950/50 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors text-left group"
                    >
                      <PlayerAvatar identifier={member.name} identity={member.identity} className="w-8 h-8 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">{member.name}</div>
                        <div className={`text-xs ${IDENTITIES[member.identity].color}`}>{IDENTITIES[member.identity].label}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

        {/* 密碼驗證彈出視窗 */}
        {passcodePromptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
            <style>{`
              @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
                20%, 40%, 60%, 80% { transform: translateX(6px); }
              }
              .animate-shake {
                animation: shake 0.4s ease-in-out;
              }
            `}</style>
            <div className={`bg-slate-900 border border-slate-800 p-4 xs:p-5 sm:p-6 rounded-2xl max-w-sm w-full shadow-2xl relative ${isShaking ? 'animate-shake' : ''}`}>
              <button
                onClick={() => setPasscodePromptOpen(false)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-3">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">團主身分驗證</h3>
                <p className="text-xs text-slate-400 mt-1">此球團設有防護密碼，請輸入進行驗證</p>
              </div>

              <div className="space-y-4">
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="請輸入管理密碼"
                  className="w-full h-11 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-mono text-slate-200 text-base placeholder-slate-700"
                  value={passcodeInput}
                  onChange={e => setPasscodeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyPasscode()}
                  autoFocus
                />

                {passcodeError && (
                  <p className="text-xs text-red-400 text-center font-medium animate-[fadeIn_0.2s_ease-out]">❌ {passcodeError}</p>
                )}

                <button
                  onClick={handleVerifyPasscode}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg"
                >
                  確認驗證
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const renderRestArea = () => (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 px-4 py-3 lg:px-5">
      <div className="space-y-4 mb-3">
        <div className="flex items-center justify-between min-h-[32px]">
          <h2 className="text-sm font-semibold text-slate-400">
            休息區 ({idlePlayers.length})
          </h2>
          <button
            onClick={() => {
              setIsRestAreaSearchExpanded(!isRestAreaSearchExpanded);
              if (isRestAreaSearchExpanded) setRestAreaSearchTerm('');
            }}
            className={`p-1.5 rounded-lg transition-colors ${isRestAreaSearchExpanded
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            title="搜尋休息區"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {isRestAreaSearchExpanded && (
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="搜尋休息區..."
              className="w-full h-10 pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-slate-500 text-base lg:text-sm"
              value={restAreaSearchTerm}
              onChange={e => setRestAreaSearchTerm(e.target.value)}
              autoFocus
            />
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            {restAreaSearchTerm && (
              <button
                onClick={() => setRestAreaSearchTerm('')}
                className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
                title="清除字元"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-gutter-stable flex flex-wrap content-start gap-2 pt-1 pb-1">
        {filteredIdlePlayers.length === 0 ? (
          <div className="w-full py-8 text-center text-slate-500 text-sm">
            <p>{restAreaSearchTerm ? '沒有符合的球員' : '休息區空空如也'}</p>
            {!restAreaSearchTerm && <p className="text-xs mt-1 opacity-70">請至「報到區」進行報到</p>}
          </div>
        ) : (
          filteredIdlePlayers.map(player => {
            const isSelf = player.name === currentMemberName;
            return (
              <div
                key={player.id}
                data-keep-selection={selectedPlayerForMove === player.id ? "true" : undefined}
                draggable={canMovePlayer(player.id)}
                onDragStart={(e) => {
                  if (!canMovePlayer(player.id)) return;
                  e.dataTransfer.setData('text/plain', player.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setSelectedPlayerForMove(null)}
                onClick={() => {
                  if (!canMovePlayer(player.id)) return;
                  if (selectedPlayerForMove === player.id) {
                    setSelectedPlayerForMove(null);
                  } else {
                    selectPlayerAndNavigate(player.id);
                    setIsRestAreaOpen(false);
                  }
                }}
                className={`relative flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full border transition-all select-none
                  ${selectedPlayerForMove === player.id
                    ? 'bg-slate-800 border-slate-700 ring-2 ring-inset ring-blue-400 cursor-pointer shadow-lg'
                    : canMovePlayer(player.id)
                      ? (isSelf
                          ? 'self-player-glow cursor-grab active:cursor-grabbing font-bold'
                          : 'bg-slate-800/60 border-slate-700 hover:bg-slate-700 cursor-grab active:cursor-grabbing')
                      : 'bg-slate-800/40 border-slate-700/50 cursor-default'
                  }`}
              >
                <div className={`bubble-container ${selectedPlayerForMove === player.id ? 'active' : ''}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlayer(player.id);
                    }}
                    className="w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg border border-indigo-400 shadow-indigo-500/40 transition-all"
                    title="早退"
                  >
                    <UserX className="w-3 h-3" />
                  </button>
                </div>
                {isSelf && <span className="border-beam-container"></span>}
                <PlayerAvatar identifier={player.name} identity={player.identity} className="w-5 h-5 shrink-0" />
                <span className={`text-xs whitespace-nowrap ${isSelf ? 'text-white font-semibold' : 'text-slate-300'}`}>
                  {player.name}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const asideTab = activeTab === 'courts' ? 'queue' : activeTab;

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-slate-900 text-slate-100 overflow-hidden relative">
      <style>{`
        @keyframes pulse-white-twice {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
          50% { box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.6); }
        }
        .highlight-pulse-white-twice {
          animation: pulse-white-twice 1s ease-in-out 2;
          z-index: 20;
        }
        .self-player-glow {
          position: relative;
          background: rgba(255, 255, 255, 0.15) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          color: #ffffff !important;
          transition: all 0.2s ease;
        }
        .self-player-glow:hover {
          background: rgba(255, 255, 255, 0.22) !important;
          border-color: rgba(255, 255, 255, 0.25) !important;
        }
        .border-beam-container {
          position: absolute;
          inset: -1px;
          border-radius: 9999px;
          pointer-events: none;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          padding: 1px;
          z-index: 10;
        }
        .border-beam-container::after {
          content: '';
          position: absolute;
          aspect-ratio: 1;
          width: 45px;
          background: linear-gradient(to left, #ffffff, rgba(255, 255, 255, 0));
          offset-anchor: 90% 50%;
          offset-path: rect(0 auto auto 0 round 9999px);
          animation: border-beam 4.5s linear infinite;
        }
        @keyframes border-beam {
          100% {
            offset-distance: 100%;
          }
        }
        .bubble-container {
          position: absolute;
          top: -0.875rem;
          right: -0.5rem;
          display: flex;
          gap: 0.375rem;
          z-index: 40;
          pointer-events: none;
          opacity: 0;
          transform: scale(0.6) translateY(8px);
          transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.16s ease-out;
        }
        .bubble-container.active {
          pointer-events: auto;
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      `}</style>
      {/* Toast Alert */}
      {toastMessage && (
        <div key={toastCounter} className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[100] animate-[fadeIn_0.2s_ease-out] pointer-events-none w-full px-4 flex justify-center">
          <div className="bg-slate-950/95 border border-slate-800 shadow-2xl rounded-xl px-5 py-3 text-sm text-slate-200 flex items-center backdrop-blur-md w-max max-w-full">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Global Header (Normal Mode) */}
      <header className="h-16 px-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center justify-between w-full flex-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20 shrink-0">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex flex-col justify-center">
                <h1 className="text-base font-bold text-white truncate leading-tight">
                  {spaceMetadata?.name}
                </h1>
                <span className="text-[10px] text-slate-500 font-mono truncate leading-tight">ID: {spaceId}</span>
              </div>
            </div>

            {/* Header Action Controls */}
            <div className="flex items-center gap-2 shrink-0">
              
              {/* 複製連結 */}
              <button
                onClick={handleCopyLink}
                className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors shrink-0 flex items-center gap-1 text-xs"
                title="分享此羽球場網址"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">分享網址</span>
              </button>

              {/* 個人選單 */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors"
                  title="個人身分與管理選單"
                >
                  <div className="flex items-center justify-center w-4 h-4">
                    {currentUser?.role === 'admin' ? (
                      <span className="text-sm">🏸</span>
                    ) : (
                      <UserCheck className={`w-3.5 h-3.5 ${currentUserMember ? IDENTITIES[currentUserMember.identity].iconColor : 'text-indigo-400'}`} />
                    )}
                  </div>
                  <span className="text-xs text-slate-300 font-medium whitespace-nowrap hidden min-[375px]:inline-block">
                    {currentUser?.role === 'admin' ? '團主' : currentUserMember?.name || '球員'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-3 py-2 border-b border-slate-800/60 flex items-baseline gap-1.5 bg-slate-950/20">
                      <p className="text-[10px] text-slate-500 font-medium shrink-0">
                        {!currentUser 
                          ? '未登入' 
                          : currentUser.role === 'admin' 
                            ? '團主' 
                            : currentUserMember 
                              ? IDENTITIES[currentUserMember.identity].label 
                              : '球員'}
                      </p>
                      {currentUser && (
                        <p className="text-xs font-bold text-slate-300 truncate flex-1">
                          {currentUser.role === 'admin' ? '管理員' : currentUserMember?.name || ''}
                        </p>
                      )}
                    </div>
                    
                    <div className="py-1">
                      {currentUser?.role === 'admin' && (
                        <button
                          onClick={() => {
                            setIsSpaceSettingsOpen(true);
                            setIsProfileMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors group/settings"
                        >
                          <Settings className="w-4 h-4 text-slate-500 group-hover/settings:text-slate-300 transition-colors" />
                          球團空間設定
                        </button>
                      )}
                      
                      {currentUser?.role === 'player' && players.some(p => p.name === currentMemberName) && (
                        <button
                          onClick={async () => {
                            const activePlayer = players.find(p => p.name === currentMemberName);
                            if (activePlayer) {
                              if (await showConfirm('確定要早退嗎？')) {
                                const playerId = activePlayer.id;
                                const newSlots = queueSlots.map(id => id === playerId ? null : id);
                                while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
                                
                                // 找出該球員目前在哪個場地上
                                const activeCourt = courts.find(c => c.playerIds.includes(playerId));
                                
                                let updatedCourts = courts;
                                let shouldResetWarmup = false;
                                
                                if (activeCourt) {
                                  // 只有早退的人離開場地（該位置設為 null），其他人保留在場地上
                                  updatedCourts = courts.map(c => {
                                    if (c.id === activeCourt.id) {
                                      const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
                                      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
                                      return { ...c, playerIds: newPlayerIds, startTime: null };
                                    }
                                    return c;
                                  });
                                  
                                  // 如果原本已經是「已熱身」狀態（isWarmupDone === true），解除回到「熱身中」以允許強制拉人上場
                                  if (isWarmupDone) {
                                    shouldResetWarmup = true;
                                  }
                                }
                                
                                const updatedPlayers = players.filter(p => p.id !== playerId);
                                
                                // 非同步更新雲端資料，避免阻礙頁面切換
                                updateCloudSession({ 
                                  queueSlots: newSlots, 
                                  players: updatedPlayers, 
                                  courts: updatedCourts,
                                  ...(shouldResetWarmup ? { isWarmupDone: false } : {})
                                });

                                const currentName = currentMemberName || '';
                                if (spaceId) {
                                  localStorage.removeItem(`badminton_current_user_${spaceId}`);
                                }
                                setGoodbyePlayerName(currentName);
                                window.location.hash = ''; // 將會觸發 handleHashChange 清除 currentUser 等狀態，直接返回大廳
                                setIsLoggingInAsPlayer(false);
                                setLoginSearchTerm('');
                                setSelectedPlayerForMove(null);
                                setIsProfileMenuOpen(false);
                              }
                            }
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <UserX className="w-4 h-4 text-slate-500" />
                          早退
                        </button>
                      )}
                      <button
                        onClick={() => {
                          // 切換身分時，清除當前球團的管理員驗證狀態，確保下次切回團主時需要重輸密碼
                          if (spaceId) {
                            const updatedVerified = { ...verifiedAdmins };
                            delete updatedVerified[spaceId];
                            setVerifiedAdmins(updatedVerified);
                            localStorage.setItem('badminton_verified_admins', JSON.stringify(updatedVerified));
                            
                            // 同時清除本地儲存的登入狀態，確保不會在 useEffect 中被自動還原
                            localStorage.removeItem(`badminton_current_user_${spaceId}`);
                          }
                          setCurrentUser(null);
                          setIsLoggingInAsPlayer(false); // 重置為選擇身分（我是團主/一般球員）畫面
                          setLoginSearchTerm('');        // 清除搜尋字詞
                          setSelectedPlayerForMove(null);
                          setIsProfileMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-slate-500" />
                        切換身分
                      </button>

                      <button
                        onClick={() => {
                          window.location.hash = '';
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4 text-slate-500" />
                        返回大廳
                      </button>
                    </div>

                    {currentUser?.role === 'admin' && (
                      <>
                        <div className="h-px bg-slate-800/60 my-1 mx-2" />
                        <div className="py-1">
                          <button
                            onClick={() => {
                              resetSession();
                              setIsProfileMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-red-400 hover:bg-red-500/10 transition-colors group"
                          >
                            <Power className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors" />
                            結束本日打球
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
      </header>

      {/* Mobile Global Tabs */}
      <div data-keep-selection="true" className="lg:hidden border-b border-slate-800 bg-slate-950 z-10 shrink-0 px-2">
        <div className="flex relative">
          {currentUser?.role !== 'player' && (
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${activeTab === 'members'
                ? 'text-indigo-400 font-semibold'
                : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <UserCheck className="w-4 h-4" />
              報到區
            </button>
          )}
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${activeTab === 'queue'
              ? 'text-indigo-400 font-semibold'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <ListOrdered className="w-4 h-4" />
            排隊區
          </button>
          <button
            onClick={() => setActiveTab('courts')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${activeTab === 'courts'
              ? 'text-indigo-400 font-semibold'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <Swords className="w-4 h-4" />
            場地區
          </button>

          {/* 滑動底線 */}
          <div 
            className="absolute bottom-0 h-0.5 bg-indigo-500 transition-all duration-300 ease-out"
            style={{
              width: getMobileUnderlineStyle().width,
              transform: `translateX(${getMobileUnderlineStyle().left})`
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

        <aside
          className={`
            bg-slate-950 border-r border-slate-800 flex-col shrink-0 shadow-2xl lg:shadow-none
            lg:w-[25rem] lg:relative lg:flex lg:flex-initial
            ${activeTab === 'courts' ? 'hidden' : 'flex flex-1 w-full lg:w-[25rem] z-10 lg:z-auto'}
          `}
        >
          {/* Desktop Tabs */}
          <div data-keep-selection="true" className="hidden lg:flex border-b border-slate-800 px-2 shrink-0">
            <div className="flex flex-1 relative">
              {currentUser?.role !== 'player' && (
                <button
                  onClick={() => setActiveTab('members')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${asideTab === 'members'
                    ? 'text-indigo-400 font-semibold'
                    : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  <UserCheck className="w-4 h-4" />
                  報到區
                </button>
              )}
              <button
                onClick={() => setActiveTab('queue')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${asideTab === 'queue' || asideTab === 'courts'
                  ? 'text-indigo-400 font-semibold'
                  : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                <ListOrdered className="w-4 h-4" />
                排隊區
              </button>

              {/* 桌機版滑動底線 */}
              {currentUser?.role !== 'player' && (
                <div 
                  className="absolute bottom-0 h-0.5 bg-indigo-500 transition-all duration-300 ease-out"
                  style={{
                    width: getDesktopUnderlineStyle().width,
                    transform: `translateX(${getDesktopUnderlineStyle().left})`
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            
            {/* Tab Content: Queue Management */}
            {asideTab === 'queue' && (
              <div className="flex-1 overflow-y-auto scrollbar-gutter-stable flex flex-col min-h-0">
                {/* Waiting Queue */}
                <div
                  className={`p-4 transition-colors ${dragOverSlotKey === 'container' ? 'bg-indigo-500/10 ring-2 ring-inset ring-indigo-500/50 rounded-xl' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDragEnter={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setDragOverSlotKey('container'); }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSlotKey(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverSlotKey(null);
                    setSelectedPlayerForMove(null);
                    const playerId = e.dataTransfer.getData('text/plain');
                    if (!playerId) return;
                    const source = e.dataTransfer.getData('source');
                    if (source === 'queue') {
                      // 如果原本就在排隊，拖曳到排隊區背景空白處放開，不進行任何重複加入操作
                      return;
                    }
                    if (source === 'court') {
                      movePlayerFromCourtToQueue(playerId);
                    } else {
                      joinQueue(playerId);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-3 min-h-[32px]">
                    <h2 className="text-sm font-semibold text-slate-400">
                      等待上場 ({queue.length})
                    </h2>
                    {currentUser?.role === 'admin' && queue.length > 0 && (
                      <button
                        onClick={restAllQueue}
                        className="text-xs text-indigo-400 hover:text-white hover:bg-indigo-600 hover:border-indigo-600 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-md transition-all font-medium"
                      >
                        清空
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {queueDisplayItems.length === 0 ? (
                      <div className="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-sm bg-slate-900/50">
                        目前沒有人在排隊
                        <div className="text-xs mt-1 opacity-70">點擊下方「休息區」球員即可加入等待</div>
                      </div>
                    ) : (
                      chunkedQueueItems.map((chunk, chunkIdx) => {
                        return (
                          <React.Fragment key={chunkIdx}>
                            <div className="relative flex items-center py-2">
                              <div className="flex-1 flex items-center gap-3 min-w-0">
                                <span className="font-mono text-xs text-slate-500 w-4 text-center shrink-0">{chunkIdx + 1}</span>
                                <div className="grid grid-cols-2 gap-3 min-w-0 flex-1">
                                  {chunk.map((item, idx) => (
                                    <React.Fragment key={idx}>
                                      {item.type === 'player' ? (
                                      <div
                                          data-keep-selection={selectedPlayerForMove === item.data.id ? "true" : undefined}
                                          draggable={canMovePlayer(item.data.id)}
                                          onDragStart={(e) => {
                                            if (!canMovePlayer(item.data.id)) return;
                                            e.dataTransfer.setData('text/plain', item.data.id);
                                            e.dataTransfer.setData('source', 'queue');
                                            e.dataTransfer.effectAllowed = 'move';
                                          }}
                                          onDragEnd={() => setSelectedPlayerForMove(null)}
                                          className={`relative group/player min-w-0 h-10 transition-all ${
                                            selectedPlayerForMove === item.data.id
                                              ? 'cursor-pointer ring-2 ring-inset ring-blue-400 rounded-lg'
                                              : dragOverSlotKey === `${chunkIdx}-${idx}` && canMovePlayer(item.data.id)
                                                ? 'cursor-grab active:cursor-grabbing ring-2 ring-inset ring-indigo-500/70 rounded-lg'
                                                : canMovePlayer(item.data.id) ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-80'
                                          }`}
                                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; }}
                                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverSlotKey(`${chunkIdx}-${idx}`); }}
                                          onDragLeave={(e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSlotKey(null); }}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDragOverSlotKey(null);
                                          }}
                                          onClick={() => {
                                            if (!canMovePlayer(item.data.id)) return;
                                            if (selectedPlayerForMove === item.data.id) {
                                              setSelectedPlayerForMove(null);
                                            } else if (selectedPlayerForMove === null) {
                                              setSelectedPlayerForMove(item.data.id);
                                            }
                                          }}
                                        >
                                          <div className={`bubble-container ${selectedPlayerForMove === item.data.id ? 'active' : ''}`}>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                removeFromQueue(item.data.id);
                                              }}
                                              className="w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg border border-indigo-400 shadow-indigo-500/40 transition-all"
                                              title="下場休息"
                                            >
                                              <Coffee className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deletePlayer(item.data.id);
                                              }}
                                              className="w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg border border-indigo-400 shadow-indigo-500/40 transition-all"
                                              title="早退"
                                            >
                                              <UserX className="w-3 h-3" />
                                            </button>
                                          </div>
                                          <div
                                            title="排隊球員"
                                            className={`w-full h-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] transition-colors text-left min-w-0 border ${
                                              item.data.name === currentMemberName 
                                                ? 'bg-slate-100/10 hover:bg-slate-100/20 border-slate-300/30 shadow-[0_0_10px_rgba(255,255,255,0.05)]' 
                                                : 'bg-slate-800/50 hover:bg-slate-700/60 border-slate-700/30'
                                            }`}
                                          >
                                            <span className={`flex items-center gap-1.5 text-sm min-w-0 ${item.data.name === currentMemberName ? 'text-white font-bold' : 'text-slate-300 font-medium'}`}>
                                              <PlayerAvatar identifier={item.data.name} identity={item.data.identity} className="w-2.5 h-2.5 shrink-0" />
                                              <span className="truncate">{item.data.name}</span>
                                            </span>

                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          data-keep-selection={selectedPlayerForMove !== null ? "true" : undefined}
                                          className={`h-10 flex items-center justify-center rounded-lg border border-dashed transition-all cursor-pointer ${
                                            dragOverSlotKey === `${chunkIdx}-${idx}`
                                              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                                              : selectedPlayerForMove !== null
                                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/50'
                                                : 'border-slate-800/50 text-slate-500'
                                          }`}
                                          title={selectedPlayerForMove ? '點擊移動球員到此' : '空位'}
                                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; }}
                                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverSlotKey(`${chunkIdx}-${idx}`); }}
                                          onDragLeave={(e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSlotKey(null); }}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDragOverSlotKey(null);
                                            setSelectedPlayerForMove(null);
                                            const playerId = e.dataTransfer.getData('text/plain');
                                            if (playerId) {
                                              const flatIdx = chunkIdx * 4 + idx;
                                              const source = e.dataTransfer.getData('source');
                                              if (source === 'court' && isWarmupDone) return;
                                              if (source === 'court') {
                                                movePlayerFromCourtToQueue(playerId, flatIdx);
                                              } else if (source === 'queue') {
                                                moveInQueue(playerId, flatIdx);
                                              } else {
                                                insertIntoQueueAt(playerId, flatIdx);
                                              }
                                            }
                                          }}
                                          onClick={() => {
                                            if (selectedPlayerForMove) {
                                              const selectedPlayer = players.find(p => p.id === selectedPlayerForMove);
                                              if (selectedPlayer?.status === 'playing' && isWarmupDone) return;
                                              const flatIdx = chunkIdx * 4 + idx;
                                              const source = selectedPlayer?.status;
                                              if (source === 'playing') {
                                                movePlayerFromCourtToQueue(selectedPlayerForMove, flatIdx);
                                              } else if (source === 'queued') {
                                                moveInQueue(selectedPlayerForMove, flatIdx);
                                              } else if (source === 'idle') {
                                                insertIntoQueueAt(selectedPlayerForMove, flatIdx);
                                              }
                                              setSelectedPlayerForMove(null);
                                            }
                                          }}
                                        >
                                          <span className="text-xs opacity-75">{selectedPlayerForMove ? '移動到此' : '空位'}</span>
                                        </div>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {chunkIdx < chunkedQueueItems.length - 1 && (
                              <div className="mx-2 h-px bg-slate-800/50"></div>
                            )}
                          </React.Fragment>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab Content: Member List */}
            {asideTab === 'members' && (
              <div className="flex-1 overflow-y-auto scrollbar-gutter-stable flex flex-col min-h-0 bg-slate-950">
                <div className="px-6 pt-4 pb-3 sticky top-0 bg-slate-950/95 backdrop-blur z-10 space-y-2">
                  <div className="flex items-center justify-between min-h-[32px]">
                    <h2 className="text-sm font-semibold text-slate-400">
                      球員列表 ({notCheckedInMembers.length})
                    </h2>
                    <div className="flex items-center gap-1 -mr-1.5">
                      {currentUser?.role === 'admin' && (
                        <button
                          onClick={() => {
                            setIsImportModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          title="匯入球員名單"
                        >
                          <FileInput className="w-4 h-4" />
                        </button>
                      )}

                      {/* 排序選單 */}
                      <div className="relative" ref={sortMenuRef}>
                        <button
                          onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                          className={`p-1.5 rounded-lg transition-colors ${isSortMenuOpen
                            ? 'bg-slate-800 text-white'
                            : memberSortKey !== 'newest'
                              ? 'text-indigo-400 hover:text-indigo-350 hover:bg-slate-800'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                          title="排序球員名單"
                        >
                          <ArrowUpDown className="w-4 h-4" />
                        </button>

                        {isSortMenuOpen && (
                          <div className="absolute right-0 mt-1.5 w-40 bg-slate-900 border border-slate-800/80 rounded-lg shadow-xl py-1 z-20 animate-[fadeIn_0.15s_ease-out]">
                            {[
                              { key: 'newest', label: '最新加入' },
                              { key: 'oldest', label: '最早加入' },
                              { key: 'alphabetical', label: 'A-Z 順序' },
                              { key: 'identity', label: '按身份排序' }
                            ].map((opt) => (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => {
                                  setMemberSortKey(opt.key as any);
                                  setIsSortMenuOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between
                                  ${memberSortKey === opt.key ? 'text-indigo-400 font-medium bg-slate-800/40' : 'text-slate-300'}`}
                              >
                                <span>{opt.label}</span>
                                {memberSortKey === opt.key && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1.5" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setIsSearchExpanded(!isSearchExpanded);
                          if (isSearchExpanded) setMemberSearchTerm('');
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${isSearchExpanded
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                        title="搜尋球員"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isSearchExpanded && (
                    <div className="flex items-center gap-2 h-10 animate-[fadeIn_0.2s_ease-out] pt-1">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="搜尋球員..."
                          className="w-full h-10 pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base lg:text-sm text-slate-200"
                          value={memberSearchTerm}
                          onChange={e => setMemberSearchTerm(e.target.value)}
                        />
                        <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        {memberSearchTerm && (
                          <button
                            onClick={() => setMemberSearchTerm('')}
                            className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {currentUser?.role === 'admin' && (
                    <AddMemberBar onCreateMember={createMember} />
                  )}
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleBatchImport}
                  className="hidden"
                />

                <div className="flex-1 px-6 py-2 space-y-2 bg-slate-950 overflow-y-auto">
                  {notCheckedInMembers.length === 0 ? (
                    <div className="text-center py-8 text-slate-600 text-sm">
                      {memberSearchTerm ? '找不到符合的球員' : '尚未新增球員名單'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {notCheckedInMembers.map(member => (
                        <div key={member.id} className="group flex items-center justify-between py-2 rounded-lg border border-transparent">
                          <div className="flex items-center gap-2.5 min-w-0 pl-1.5">
                            <PlayerAvatar identifier={member.name} identity={member.identity} className="w-5.5 h-5.5 shrink-0 rounded-full" />
                            <span className={`inline-flex items-center justify-center w-[50px] py-0.5 rounded-md text-[10px] font-bold shrink-0 ${IDENTITIES[member.identity].bg} ${IDENTITIES[member.identity].color}`}>
                              {IDENTITIES[member.identity].label}
                            </span>
                            <span className="text-sm text-slate-300 font-medium truncate">{member.name}</span>
                          </div>
                          
                          <div className="flex items-center justify-end gap-1.5 shrink-0">
                            {(currentUser?.role === 'admin' || currentUser?.memberId === member.id) && (
                              <button
                                onClick={() => checkInMember(member)}
                                className="h-9 px-3 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-semibold transition-all border border-indigo-500/20"
                              >
                                報到
                              </button>
                            )}
                            {currentUser?.role === 'admin' && (
                              <button
                                onClick={() => removeMember(member.id)}
                                className="h-9 w-9 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="刪除此球員"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className={`flex-1 flex-col min-w-0 h-full relative z-0 bg-slate-950 lg:bg-transparent ${activeTab === 'courts' ? 'flex' : 'hidden lg:flex'}`}>
          {/* Toolbar */}
          <div className="py-3 sm:py-0 sm:h-16 border-b border-slate-800 flex items-center px-4 sm:px-8 justify-between bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="font-semibold text-slate-200 hidden sm:block">場地狀況</h2>

              {idleCourtsCount === 0 ? (
                <span className="flex items-center gap-1.5 text-green-400 hidden sm:flex text-xs font-semibold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                  滿場中
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-400 hidden sm:flex text-xs font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                  空閒場地: {idleCourtsCount} 面
                </span>
              )}
            </div>

            {/* Toolbar Actions */}
            <div className="flex items-center gap-3 text-sm">
              
              {/* 增減球場 */}
              {currentUser?.role === 'admin' && (
                <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 h-8">
                  <button
                    onClick={removeCourt}
                    className="w-8 h-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-l-lg transition-colors"
                    title="減少場地"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-4 bg-slate-800/50"></div>
                  <span className="px-2 text-xs font-mono text-slate-400 flex items-center justify-center min-w-[3rem]">
                    {courts.length} 面
                  </span>
                  <div className="w-px h-4 bg-slate-800/50"></div>
                  <button
                    onClick={addCourt}
                    className="w-8 h-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-indigo-400 rounded-r-lg transition-colors"
                    title="新增場地"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* 語音開關 (本地控制 - 僅限團主) */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => {
                    const val = !isAutoAnnounce;
                    setIsAutoAnnounce(val);
                    showToast(val ? "🔊 本裝置開啟語音播報" : "🔇 本裝置關閉語音播報");
                    
                    if (val) {
                      activateSpeechEngine();
                    } else {
                      if ('speechSynthesis' in window) {
                        window.speechSynthesis.cancel();
                      }
                    }
                  }}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isAutoAnnounce 
                      ? 'bg-slate-850 border-slate-700 text-indigo-400 hover:text-indigo-300' 
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                  }`}
                  title={isAutoAnnounce ? "點擊靜音本裝置" : "點擊開啟本裝置播報"}
                >
                  {isAutoAnnounce ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              )}

              {/* 熱身切換 */}
              <button
                onClick={currentUser?.role === 'admin' ? handleWarmupToggle : undefined}
                className={`flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-lg transition-all border
                  ${isWarmupDone
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  }
                  ${currentUser?.role !== 'admin' ? 'cursor-not-allowed opacity-80' : ''}
                `}
                title={isWarmupDone ? '已熱身結束 (已上鎖狀態)' : '熱身階段 (允許隨意拖拉)'}
              >
                {isWarmupDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Flame className="w-3.5 h-3.5" />}
                <span>{isWarmupDone ? '已熱身' : '熱身中'}</span>
              </button>
            </div>
          </div>

          {/* Courts Grid */}
          <div className="p-4 sm:p-8 overflow-y-auto scrollbar-gutter-stable flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-6 pb-10">
              {courts.map(court => (
                <CourtCard
                  key={court.id}
                  court={court}
                  playersOnCourt={court.playerIds.map(id => id ? players.find(p => p.id === id)! : null as any)}
                  queueLength={queue.length}
                  onStartMatch={startMatch}
                  onEndMatch={endMatch}
                  onRenameCourt={currentUser?.role === 'admin' ? renameCourt : undefined}
                  onAnnounce={announceCourtPlayers}
                  onRestPlayer={restPlayerFromCourt}
                  onEarlyLeavePlayer={deletePlayer}
                  isAutoAnnounce={currentUser?.role === 'admin' ? isAutoAnnounce : allowPlayerAnnounce}
                  canStartMatch={isQueueReady}
                  onDropPlayer={dropPlayerToCourt}
                  isWarmupDone={isWarmupDone}
                  selectedPlayerForMove={selectedPlayerForMove}
                  onSelectPlayer={setSelectedPlayerForMove}
                  onMovePlayerToSlot={movePlayerToCourtSlot}
                  canMovePlayer={canMovePlayer}
                  currentMemberName={currentMemberName}
                />
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Rest Area Drawer */}
      <div className={`fixed inset-0 z-[70] flex flex-col justify-end transition-all duration-300 ${isRestAreaOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${isRestAreaOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsRestAreaOpen(false)}
        />
        <div className={`relative w-full lg:max-w-2xl lg:mx-auto bg-slate-950 border-t border-slate-800 rounded-t-3xl shadow-2xl flex flex-col max-h-[40dvh] pb-safe transition-transform duration-300 ease-out ${isRestAreaOpen ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pt-2">
            <div className="pb-6 flex-1 flex flex-col">
              {renderRestArea()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Rest Area Floating Button */}
      <button
        onClick={() => setIsRestAreaOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-slate-850 hover:bg-slate-800 text-white shadow-2xl shadow-indigo-500/10 rounded-full py-3.5 px-6 flex items-center gap-2 border border-slate-700 transition-all font-semibold animate-[fadeIn_0.3s_ease-out]"
      >
        <Coffee className="w-5 h-5 text-amber-400" />
        休息區 <span className="bg-slate-950 text-amber-400 px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ml-1">{idlePlayers.length}</span>
      </button>

      {/* 自訂對話框 (Alert / Confirm) */}
      {customDialog.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl relative flex flex-col text-center">
            {/* 圖標 (Icon) */}
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-indigo-500/10 text-indigo-400">
              {(() => {
                if (customDialog.type === 'confirm') {
                  return <Info className="w-6 h-6" />;
                }
                const variant = customDialog.variant || 'warning';
                if (variant === 'success') {
                  return <CheckCircle2 className="w-6 h-6" />;
                }
                if (variant === 'error') {
                  return <XCircle className="w-6 h-6" />;
                }
                if (variant === 'info') {
                  return <Info className="w-6 h-6" />;
                }
                return <AlertTriangle className="w-6 h-6" />;
              })()}
            </div>

            {customDialog.title && (
              <h3 className="text-base font-bold text-white mb-2">{customDialog.title}</h3>
            )}

            <p className="text-sm text-slate-300 break-words leading-relaxed mb-6 whitespace-pre-line">
              {customDialog.message}
            </p>

            <div className="flex gap-3 justify-center">
              {customDialog.type === 'confirm' && (
                <button
                  onClick={() => {
                    if (customDialog.resolve) customDialog.resolve(false);
                    setCustomDialog(prev => ({ ...prev, isOpen: false }));
                  }}
                  className="flex-1 px-4 py-2 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold rounded-xl transition-colors min-w-[5.5rem]"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  if (customDialog.resolve) customDialog.resolve(true);
                  setCustomDialog(prev => ({ ...prev, isOpen: false }));
                }}
                className="flex-1 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-colors min-w-[5.5rem]"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in Success Modal Banner */}
      {checkInSuccessName && (
        <div key={checkInCounter} className="fixed bottom-6 left-0 right-0 flex justify-center z-[100] pointer-events-none px-4">
          <style>{`
            @keyframes toastFadeInOut {
              0% { opacity: 0; transform: translateY(16px) scale(0.97); }
              8% { opacity: 1; transform: translateY(0) scale(1); }
              92% { opacity: 1; transform: translateY(0) scale(1); }
              100% { opacity: 0; transform: translateY(-16px) scale(0.97); }
            }
            .animate-toast-fade {
              animation: toastFadeInOut 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
          <div data-keep-selection="true" className="max-w-[400px] w-full bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur-2xl relative overflow-hidden flex flex-col items-center text-center animate-toast-fade pointer-events-auto">
            {/* 關閉按鈕 */}
            <button
              onClick={() => setCheckInSuccessName(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800/50 transition-all"
              title="關閉"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <CheckCircle2 className="w-7 h-7 text-indigo-400" />
            </div>
            
            <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-1.5 justify-center">
              報到完成 🏸
            </h3>
            
            <p className="text-xs text-slate-300 break-words leading-relaxed">
              歡迎 <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{checkInSuccessName}</span> 已進入休息區！
            </p>
            
            <p className="text-[10px] text-slate-500 mt-4 border-t border-slate-800/80 pt-3 w-full">
              您可以切換至排隊區加入等待
            </p>
          </div>
        </div>
      )}

      {/* 球團空間設定彈窗 */}
      {isSpaceSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-slate-800 pt-5 pb-5 px-0 xs:pt-6 xs:pb-6 sm:pt-7 sm:pb-7 rounded-3xl max-w-sm w-full shadow-2xl relative flex flex-col max-h-[90dvh] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsSpaceSettingsOpen(false)}
              className="absolute top-4 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center mb-4 shrink-0 px-5 xs:px-6 sm:px-7 text-center">
              <h3 className="text-lg font-bold text-white">球團空間設定</h3>
            </div>

            <form onSubmit={handleSaveSpaceSettings} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                {/* 球團名稱 */}
                <div className="px-5 xs:px-6 sm:px-7">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">球團/群組名稱</label>
                  <input
                    type="text"
                    placeholder="例如：快樂週三羽球團"
                    className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-base lg:text-xs placeholder-slate-700 transition-all"
                    value={editSpaceName}
                    onChange={e => setEditSpaceName(e.target.value)}
                    required
                  />
                </div>

                {/* 允許球員連動播報設定 */}
                <div className="px-5 xs:px-6 sm:px-7">
                  <div className="bg-slate-950/50 p-3 xs:p-4 border border-slate-800/80 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between select-none">
                      <div className="flex items-center gap-2">
                        <Megaphone className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-xs font-semibold text-slate-200">允許球員連動團主裝置播音</span>
                      </div>
                      <div 
                        onClick={() => setEditAllowPlayerAnnounce(!editAllowPlayerAnnounce)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer flex items-center shrink-0 ${
                          editAllowPlayerAnnounce ? 'bg-indigo-600' : 'bg-slate-800'
                        }`}
                      >
                        <div 
                          className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                            editAllowPlayerAnnounce ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      啟用後，球員在手機上點擊大聲公或開賽按鈕時，將可觸發團主裝置播出語音唱名。
                    </p>
                  </div>
                </div>

                {/* 1. 管理員密碼 */}
                <div className="px-5 xs:px-6 sm:px-7">
                  <div className="bg-slate-950/50 p-3 xs:p-4 border border-slate-800/80 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between select-none">
                      <div className="flex items-center gap-2">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-semibold text-slate-200">啟用管理員密碼</span>
                      </div>
                      <div 
                        onClick={() => {
                          const nextVal = !editHasPasscode;
                          setEditHasPasscode(nextVal);
                          if (!nextVal) setEditSpacePasscode('');
                        }}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer flex items-center shrink-0 ${
                          editHasPasscode ? 'bg-indigo-600' : 'bg-slate-800'
                        }`}
                      >
                        <div 
                          className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                            editHasPasscode ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={editHasPasscode ? "設定管理密碼 (4-10 位)" : "管理密碼已停用"}
                      disabled={!editHasPasscode}
                      className={`w-full h-9 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-base lg:text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
                        editHasPasscode 
                          ? 'border-slate-800 focus:ring-indigo-500 opacity-100' 
                          : 'border-slate-900/50 opacity-30 cursor-not-allowed select-none'
                      }`}
                      value={editSpacePasscode}
                      onChange={e => setEditSpacePasscode(e.target.value)}
                      required={editHasPasscode}
                    />
                    <div className="flex justify-between items-center text-[9px]">
                      <span className={`transition-all duration-300 ${
                        !editHasPasscode 
                          ? "text-slate-600 opacity-40" 
                          : editSpacePasscode.length === 0 
                            ? "text-slate-500" 
                            : (editSpacePasscode.length >= 4 && editSpacePasscode.length <= 10) 
                              ? "text-emerald-400 font-semibold" 
                              : "text-amber-500 font-semibold"
                      }`}>
                        {!editHasPasscode 
                          ? "—" 
                          : editSpacePasscode.length === 0 
                            ? "請輸入 4-10 位密碼" 
                            : (editSpacePasscode.length >= 4 && editSpacePasscode.length <= 10) 
                              ? "✓ 密碼長度安全" 
                              : "⚠ 密碼長度不符 (需為 4-10 位)"
                      }
                      </span>
                      <span className={`font-mono transition-all duration-300 ${
                        !editHasPasscode 
                          ? "text-slate-600 opacity-40" 
                          : (editSpacePasscode.length >= 4 && editSpacePasscode.length <= 10) 
                            ? "text-slate-400" 
                            : "text-amber-500 font-semibold"
                      }`}>
                        {editHasPasscode ? `${editSpacePasscode.length}/10` : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. 空間存取密碼 */}
                <div className="px-5 xs:px-6 sm:px-7">
                  <div className="bg-slate-950/50 p-3 xs:p-4 border border-slate-800/80 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between select-none">
                      <div className="flex items-center gap-2">
                        <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-xs font-semibold text-slate-200">啟用私密球團空間</span>
                      </div>
                      <div 
                        onClick={() => {
                          const nextVal = !editHasSpacePasscode;
                          setEditHasSpacePasscode(nextVal);
                          if (!nextVal) setEditSpaceAccessPasscode('');
                        }}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer flex items-center shrink-0 ${
                          editHasSpacePasscode ? 'bg-indigo-600' : 'bg-slate-800'
                        }`}
                      >
                        <div 
                          className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                            editHasSpacePasscode ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={editHasSpacePasscode ? "設定空間存取密碼 (4-10 位)" : "空間密碼已停用"}
                      disabled={!editHasSpacePasscode}
                      className={`w-full h-9 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-base lg:text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
                        editHasSpacePasscode 
                          ? 'border-slate-800 focus:ring-indigo-500 opacity-100' 
                          : 'border-slate-900/50 opacity-30 cursor-not-allowed select-none'
                      }`}
                      value={editSpaceAccessPasscode}
                      onChange={e => setEditSpaceAccessPasscode(e.target.value)}
                      required={editHasSpacePasscode}
                    />
                    <div className="flex justify-between items-center text-[9px]">
                      <span className={`transition-all duration-300 ${
                        !editHasSpacePasscode 
                          ? "text-slate-600 opacity-40" 
                          : editSpaceAccessPasscode.length === 0 
                            ? "text-slate-500" 
                            : (editSpaceAccessPasscode.length >= 4 && editSpaceAccessPasscode.length <= 10) 
                              ? "text-emerald-400 font-semibold" 
                              : "text-amber-500 font-semibold"
                      }`}>
                        {!editHasSpacePasscode 
                          ? "—" 
                          : editSpaceAccessPasscode.length === 0 
                            ? "請輸入 4-10 位密碼" 
                            : (editSpaceAccessPasscode.length >= 4 && editSpaceAccessPasscode.length <= 10) 
                              ? "✓ 密碼長度安全" 
                              : "⚠ 密碼長度不符 (需為 4-10 位)"
                      }
                      </span>
                      <span className={`font-mono transition-all duration-300 ${
                        !editHasSpacePasscode 
                          ? "text-slate-600 opacity-40" 
                          : (editSpaceAccessPasscode.length >= 4 && editSpaceAccessPasscode.length <= 10) 
                            ? "text-slate-400" 
                            : "text-amber-500 font-semibold"
                      }`}>
                        {editHasSpacePasscode ? `${editSpaceAccessPasscode.length}/10` : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 移除球團危險區 */}
                <div className="px-5 xs:px-6 sm:px-7">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteInputId('');
                      setIsDeleteConfirmOpen(true);
                    }}
                    className="w-full h-9 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 text-red-400 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    移除此球團空間
                  </button>
                </div>
              </div>

              {/* 按鈕區 */}
              <div className="flex gap-3 pt-3 shrink-0 px-5 xs:px-6 sm:px-7">
                <button
                  type="button"
                  onClick={() => setIsSpaceSettingsOpen(false)}
                  className="flex-1 h-10 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg"
                >
                  儲存設定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 刪除確認彈窗 (GitHub 風格) */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl relative text-center flex flex-col">
            <button
              type="button"
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">確認要刪除此球團空間？</h3>
            
            <p className="text-xs text-slate-300 bg-red-500/5 border border-red-500/15 p-3 rounded-xl text-left leading-relaxed mb-4">
              <span className="text-red-400 font-bold">⚠️ 警告：此操作無法復原！</span><br />
              這將永久移除球團「{spaceMetadata?.name}」及其所有場地配置、排隊記錄與球員名冊。
            </p>

            <div className="space-y-4 text-left">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  請輸入球團 ID <span className="font-mono text-indigo-400 font-bold select-all">{spaceId}</span> 以確認刪除：
                </label>
                <input
                  type="text"
                  placeholder="請在此輸入球團 ID"
                  className="w-full h-11 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-mono text-slate-200 text-base lg:text-sm placeholder-slate-700 transition-all"
                  value={deleteInputId}
                  onChange={e => setDeleteInputId(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 h-11 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deleteInputId.trim().toLowerCase() !== (spaceId || '').toLowerCase()}
                  onClick={handleDeleteSpaceConfirm}
                  className={`flex-1 h-11 text-xs font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-1.5 ${
                    deleteInputId.trim().toLowerCase() === (spaceId || '').toLowerCase()
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/25'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                  }`}
                >
                  我同意，永久刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 批次匯入球員名單彈窗 */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-md w-full shadow-2xl relative flex flex-col max-h-[90dvh]">
            {/* 關閉按鈕 */}
            <button
              onClick={() => {
                setIsImportModalOpen(false);
                setImportText('');
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
              title="關閉"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-white mb-4">批次匯入球員名單</h3>

            <div className="flex-1 overflow-y-auto space-y-6 pr-1 font-sans">
              {/* 方法一：從 CSV 檔案匯入 */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  方法一：上傳 CSV 檔案
                </h4>
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
                  <div className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                    <p className="font-semibold text-slate-350">檔案格式說明：</p>
                    <p>1. CSV 檔案必須包含 <code className="text-emerald-400 font-mono">Name</code> 與 <code className="text-emerald-400 font-mono">Identity</code> 兩個欄位（大小寫皆可）。</p>
                    <p>2. <code className="text-emerald-400 font-mono">Identity</code> 欄位值可為 <code className="text-slate-200">管理員</code>、<code className="text-slate-200">社員</code> 或 <code className="text-slate-200">零打</code>（若留空或填寫其他值，系統將自動預設為 <code className="text-slate-200">社員</code>）。</p>
                    <p className="text-[10px] text-slate-500 border-t border-slate-900/60 pt-1.5 mt-1 flex items-start gap-1">
                      <span>💡</span>
                      <span>Excel 檔可於 Excel 點選「另存新檔」➔ 選擇格式為「CSV」即可匯入。</span>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                    className="w-full h-9 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <FileInput className="w-3.5 h-3.5" />
                    選擇 CSV 檔案匯入
                  </button>
                </div>
              </div>

              {/* 方法二：複製貼上文字匯入 */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  方法二：直接貼上名單
                </h4>
                <div className="space-y-2.5">
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    每行輸入一筆資料，格式為「<span className="text-indigo-400 font-semibold">姓名 身份</span>」（用空格分隔，身份可為「管理員」、「社員」或「零打」，空白或其他值將預設為「社員」）。
                  </div>
                  <div className="p-0.5">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl transition-all p-1 pb-1 focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-500">
                      <textarea
                        placeholder="範例：&#10;Hank 管理員&#10;Vincent 社員&#10;Alfred 零打"
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        className="w-full h-28 bg-transparent border-0 outline-none resize-none text-xs text-slate-200 font-mono px-2 pt-2 pb-1 scrollbar-track-transparent"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (importText.trim()) {
                        handleTextareaImport(importText);
                      }
                    }}
                    disabled={!importText.trim()}
                    className={`w-full h-9 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5
                      ${importText.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-600/30 text-white/30 cursor-not-allowed'}`}
                  >
                    確定貼上匯入
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}