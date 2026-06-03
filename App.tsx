import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  Users, Activity, Coffee, ArrowRight, RotateCcw, Trash2, Trophy, Plus, Minus, 
  Volume2, VolumeX, X, Swords, UserCheck, Search, CheckCircle2, ChevronDown, 
  ChevronRight, Unlink, ArrowUp, PanelLeft, LogOut, UserX, ChevronUp, Flame, 
  Lock, Unlock, UserPlus, Upload, Settings, MoreVertical, Power, Share2, Copy, 
  ArrowLeft, ExternalLink, Check, Key, EyeOff, Shield
} from 'lucide-react';
import { 
  Player, Court, Member, INITIAL_COURT_COUNT, MAX_PLAYERS_PER_COURT, 
  SkillLevel, SKILL_LEVELS, CurrentUser, UserRole 
} from './types';
import { CourtCard } from './components/CourtCard';
import { PlayerAvatar } from './components/PlayerAvatar';

// 引入 Firebase / Mock 服務與型別
import {
  DEVICE_ID,
  checkSpaceExists,
  createSpace,
  getSpaceMetadata,
  updateSpaceMetadata,
  subscribeToSpaceMetadata,
  subscribeToSession,
  updateSession,
  subscribeToMembers,
  addMember,
  addMembersBatch,
  updateMember,
  deleteMember,
  type SpaceMetadata,
  type SessionState
} from './firebase';

type Tab = 'courts' | 'queue' | 'members';

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

  // --- 大廳 (Landing Page) 輸入 State ---
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpacePasscode, setNewSpacePasscode] = useState('');
  const [hasPasscode, setHasPasscode] = useState(false);
  const [newSpaceAccessPasscode, setNewSpaceAccessPasscode] = useState('');
  const [hasSpacePasscode, setHasSpacePasscode] = useState(false);
  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false); // 安全設定彈窗
  const [joinSpaceIdInput, setJoinSpaceIdInput] = useState('');
  
  // --- 球團內部空間設定 State ---
  const [isSpaceSettingsOpen, setIsSpaceSettingsOpen] = useState(false);
  const [editSpaceName, setEditSpaceName] = useState('');
  const [editHasPasscode, setEditHasPasscode] = useState(false);
  const [editSpacePasscode, setEditSpacePasscode] = useState('');
  const [editHasSpacePasscode, setEditHasSpacePasscode] = useState(false);
  const [editSpaceAccessPasscode, setEditSpaceAccessPasscode] = useState('');
  const [recentSpaces, setRecentSpaces] = useState<SpaceMetadata[]>(() => {
    const saved = localStorage.getItem('badminton_recent_spaces');
    return saved ? JSON.parse(saved) : [];
  });

  // --- 密碼驗證與身分 State ---
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
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
  const [announceMode, setAnnounceMode] = useState<'local' | 'all'>('local');

  // --- 靜態/低頻同步狀態 ---
  const [members, setMembers] = useState<Member[]>([]);

  // --- UI 與控制狀態 ---
  const [activeTab, setActiveTab] = useState<Tab>('courts');
  const [isRestAreaOpen, setIsRestAreaOpen] = useState(false); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [currentTime, setCurrentTime] = useState(new Date()); 
  const [isAutoAnnounce, setIsAutoAnnounce] = useState(true); // 本地裝置的語音開關
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberLevel, setNewMemberLevel] = useState<SkillLevel>('intermediate');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [restAreaSearchTerm, setRestAreaSearchTerm] = useState('');
  const [isRestAreaSearchExpanded, setIsRestAreaSearchExpanded] = useState(false);

  // 點選移動模式 State
  const [selectedPlayerForMove, setSelectedPlayerForMove] = useState<string | null>(null);
  const [showGlobalBanner, setShowGlobalBanner] = useState(false);

  // Refs
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastVoiceTimestampRef = useRef<number>(0);
  const isFirstLoadRef = useRef<boolean>(true);

  // --- 監聽 Hash 路由變化 ---
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/space/')) {
        const id = hash.substring(8).trim().toLowerCase();
        setSpaceId(id);
      } else {
        setSpaceId(null);
        setSpaceMetadata(null);
        setCurrentUser(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // --- 載入空間元資料與訂閱實時同步 ---
  useEffect(() => {
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
      setIsMembersLoaded(false);
      
      // 回到大廳時，若有已驗證的管理員權限，則清除並移除本地登入紀錄（防範無限重繪迴圈）
      if (Object.keys(verifiedAdmins).length > 0) {
        setVerifiedAdmins({});
        localStorage.removeItem('badminton_verified_admins');
      }
      return;
    }

    let unsubMeta: (() => void) | null = null;
    let unsubSession: (() => void) | null = null;
    let unsubMembers: (() => void) | null = null;

    async function initSpace() {
      setIsSpaceLoading(true);
      setIsSessionLoaded(false);
      setIsMembersLoaded(false);
      setSpaceError(null);
      isFirstLoadRef.current = true; // 重置首載標記

      try {
        const exists = await checkSpaceExists(spaceId!);
        if (!exists) {
          setSpaceError(`球團空間「${spaceId}」不存在。請確認網址或返回大廳建立全新空間。`);
          setIsSpaceLoading(false);
          return;
        }

        // 訂閱空間元資料變動 (Real-time Space Metadata Sync)
        unsubMeta = subscribeToSpaceMetadata(spaceId!, (meta) => {
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
            } else {
              setCurrentUser(savedUser);
            }
          } else {
            setCurrentUser(savedUser);
          }
        } else {
          setCurrentUser(null);
        }

        // 1. 訂閱核心即時狀態
        unsubSession = subscribeToSession(spaceId!, (session) => {
          setPlayers(session.players || []);
          setCourts(session.courts || []);
          setQueueSlots(session.queueSlots || []);
          setIsWarmupDone(session.isWarmupDone ?? false);
          setAnnounceMode(session.announceMode || 'local');
          setIsSessionLoaded(true);

          // 實時語音播報判定
          if (session.lastAnnouncement) {
            const ann = session.lastAnnouncement;
            if (isFirstLoadRef.current) {
              // 首載：僅記錄時間戳，不發出聲音，避免一進網頁就吵人
              lastVoiceTimestampRef.current = ann.timestamp;
              isFirstLoadRef.current = false;
            } else if (ann.timestamp > lastVoiceTimestampRef.current) {
              lastVoiceTimestampRef.current = ann.timestamp;
              
              // 判定是否播放：
              // - 若為「全裝置播音 (all)」且非本裝置發送
              // - 且本裝置未靜音 (isAutoAnnounce)
              const isAnotherDevice = ann.deviceId !== DEVICE_ID;
              if (session.announceMode === 'all' && isAnotherDevice && isAutoAnnounce) {
                speak(ann.text);
              }
            }
          } else if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
          }
        }, (err) => {
          setSpaceError("加載賽局狀態失敗，請稍後重試。");
        });

        // 2. 訂閱會員名冊
        unsubMembers = subscribeToMembers(spaceId!, (list) => {
          setMembers(list);
          setIsMembersLoaded(true);
        });

      } catch (e) {
        console.error(e);
        setSpaceError("初始化球團空間出錯，請確認網路連線。");
      } finally {
        setIsSpaceLoading(false);
      }
    }

    initSpace();

    return () => {
      if (unsubMeta) unsubMeta();
      if (unsubSession) unsubSession();
      if (unsubMembers) unsubMembers();
    };
  }, [spaceId, verifiedAdmins, verifiedSpaces]);

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

  // --- 初始化空間設定編輯狀態 ---
  useEffect(() => {
    if (isSpaceSettingsOpen && spaceMetadata) {
      setEditSpaceName(spaceMetadata.name);
      setEditHasPasscode(!!spaceMetadata.adminPasscode);
      setEditSpacePasscode(spaceMetadata.adminPasscode || '');
      setEditHasSpacePasscode(!!spaceMetadata.spacePasscode);
      setEditSpaceAccessPasscode(spaceMetadata.spacePasscode || '');
    }
  }, [isSpaceSettingsOpen, spaceMetadata]);

  // --- 時鐘定時器 ---
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
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

  // 監聽選中狀態，同步顯示橫幅
  useEffect(() => {
    if (selectedPlayerForMove) setShowGlobalBanner(true);
    else setShowGlobalBanner(false);
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
  const currentMemberName = useMemo(() => {
    if (currentUser?.role === 'player') {
      return members.find(m => m.id === currentUser.memberId)?.name;
    }
    return null;
  }, [currentUser, members]);

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

  const totalActivePlayers = useMemo(() => players.filter(p => p.status === 'playing').length, [players]);
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
    if (!term) return members.slice().sort((a, b) => b.createdAt - a.createdAt);
    return members
      .filter(m => m.name.toLowerCase().includes(term))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [members, memberSearchTerm]);

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
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const createUtterance = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = 1.0; 
        utterance.pitch = 1.2; 
        return utterance;
      };
      window.speechSynthesis.speak(createUtterance());
      window.speechSynthesis.speak(createUtterance());
    }
  }, []);

  // ==========================================
  // 賽局管理與排隊 Action
  // ==========================================

  const joinQueue = useCallback((playerId: string) => {
    setSelectedPlayerForMove(null);
    const updatedSlots = [...queueSlots, playerId];
    const updatedPlayers = players.map(p => 
      p.id === playerId ? { ...p, status: 'queued', joinedAt: Date.now() } as Player : p
    );
    updateCloudSession({ queueSlots: updatedSlots, players: updatedPlayers });
  }, [queueSlots, players, updateCloudSession]);

  const insertIntoQueueAt = useCallback((playerId: string, position: number) => {
    setSelectedPlayerForMove(null);
    const newSlots = [...queueSlots];
    while (newSlots.length <= position) newSlots.push(null);
    if (newSlots[position] === null) {
      newSlots[position] = playerId;
    } else {
      newSlots.splice(position, 0, playerId);
    }
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'queued', joinedAt: Date.now() } as Player : p
    );
    updateCloudSession({ queueSlots: newSlots, players: updatedPlayers });
  }, [queueSlots, players, updateCloudSession]);

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

  const removeFromQueue = useCallback((playerId: string) => {
    if (!confirm('確定要讓此球員回到休息區嗎？')) return;
    setSelectedPlayerForMove(null);
    const newSlots = queueSlots.map(id => id === playerId ? null : id);
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'idle' } as Player : p
    );
    updateCloudSession({ queueSlots: newSlots, players: updatedPlayers });
  }, [queueSlots, players, updateCloudSession]);

  const deletePlayer = useCallback((playerId: string) => {
    if (confirm('確定要讓此球員早退嗎？（將回到會員列表）')) {
      setSelectedPlayerForMove(prev => prev === playerId ? null : prev);
      const newSlots = queueSlots.map(id => id === playerId ? null : id);
      while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
      
      const updatedPlayers = players.filter(p => p.id !== playerId);
      const updatedCourts = courts.map(c => ({
        ...c,
        playerIds: c.playerIds.filter(id => id !== playerId)
      }));
      updateCloudSession({ queueSlots: newSlots, players: updatedPlayers, courts: updatedCourts });
    }
  }, [queueSlots, players, courts, updateCloudSession]);

  const restAllQueue = useCallback(() => {
    const queuedCount = players.filter(p => p.status === 'queued').length;
    if (queuedCount === 0) return;

    if (confirm(`確定要讓排隊中的 ${queuedCount} 人全部回到休息區嗎？`)) {
      const updatedPlayers = players.map(p =>
        p.status === 'queued' ? { ...p, status: 'idle' } as Player : p
      );
      updateCloudSession({ queueSlots: [], players: updatedPlayers });
    }
  }, [players, updateCloudSession]);

  const clearBench = useCallback(() => {
    const idleCount = players.filter(p => p.status === 'idle').length;
    if (idleCount === 0) return;

    if (confirm(`確定要讓休息區的 ${idleCount} 人全部離開球場嗎？\n他們將回到會員列表。`)) {
      const updatedPlayers = players.filter(p => p.status !== 'idle');
      updateCloudSession({ players: updatedPlayers });
    }
  }, [players, updateCloudSession]);

  const resetSession = useCallback(() => {
    if (confirm('確定要結束所有比賽嗎？\n所有場上和排隊的球員將會回到會員列表。')) {
      setSelectedPlayerForMove(null);
      const clearedCourts = courts.map(c => ({ ...c, playerIds: [], startTime: null }));
      updateCloudSession({
        players: [],
        queueSlots: [],
        isWarmupDone: false,
        courts: clearedCourts
      });
    }
  }, [courts, updateCloudSession]);

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

  const removeCourt = useCallback(() => {
    if (courts.length <= 1) {
      alert("至少需要保留一個場地");
      return;
    }
    const lastCourt = courts[courts.length - 1];
    if (lastCourt.playerIds.some(id => id !== null)) {
      alert(`無法移除 ${lastCourt.name}：場上還有人`);
      return;
    }
    updateCloudSession({ courts: courts.slice(0, -1) });
  }, [courts, updateCloudSession]);

  const renameCourt = useCallback((courtId: number, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      alert("場地名稱不能為空");
      return;
    }
    const updatedCourts = courts.map(c =>
      c.id === courtId ? { ...c, name: trimmedName } : c
    );
    updateCloudSession({ courts: updatedCourts });
  }, [courts, updateCloudSession]);

  const announceCourtPlayers = useCallback((courtId: number) => {
    const court = courts.find(c => c.id === courtId);
    if (!court || !court.playerIds.some(id => id !== null)) return;

    const playerNames = court.playerIds
      .map(id => players.find(p => p.id === id)?.name)
      .filter(Boolean);

    if (playerNames.length > 0) {
      const announcement = `請 ${playerNames.join('，')}，到${court.name}打球`;
      speak(announcement);
    }
  }, [courts, players, speak]);

  const startMatch = useCallback((courtId: number) => {
    const playersToStart = getNextMatchBatch(queueSlots, players);
    if (playersToStart.length < MAX_PLAYERS_PER_COURT) {
      alert("人數不足四人，無法開賽。請等待球員補滿空位。");
      return;
    }

    const playerIds = playersToStart.map(p => p.id);
    const playerNames = playersToStart.map(p => p.name);
    const court = courts.find(c => c.id === courtId);

    // 建立播報文字
    let announcementText = '';
    if (court) {
      announcementText = `請 ${playerNames.join('，')}，到${court.name}打球`;
      if (isAutoAnnounce) {
        // 本地發起端：立刻播報，提升反應度
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

    // 同步賽局與語音信號至雲端
    updateCloudSession({
      players: updatedPlayers,
      queueSlots: newSlots,
      courts: updatedCourts,
      lastAnnouncement: announcementText ? {
        text: announcementText,
        timestamp: Date.now(),
        deviceId: DEVICE_ID
      } : undefined
    });
  }, [queueSlots, players, courts, speak, isAutoAnnounce, getNextMatchBatch, updateCloudSession]);

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

  const removePlayerFromCourt = useCallback((playerId: string) => {
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
    updateCloudSession({ courts: updatedCourts });
  }, [courts, updateCloudSession]);

  const restPlayerFromCourt = useCallback((playerId: string) => {
    if (!confirm('確定要讓此球員下場休息嗎？')) return;
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
  }, [courts, players, updateCloudSession]);

  const handleWarmupToggle = useCallback(() => {
    if (!isWarmupDone) {
      if (idleCourtsCount > 0) {
        alert('目前場地尚未滿場，請保持熱身階段🔥');
        return;
      }
      if (confirm('確定要結束熱身嗎？')) {
        updateCloudSession({ isWarmupDone: true });
      }
    } else {
      if (confirm('確定要重新開始熱身嗎？\n這將重置所有場地狀態，讓大家重新上場。')) {
        const clearedCourts = courts.map(c => ({ ...c, playerIds: [], startTime: null }));
        updateCloudSession({
          isWarmupDone: false,
          players: players.map(p => ({ ...p, status: 'idle' }) as Player),
          queueSlots: [],
          courts: clearedCourts
        });
      }
    }
  }, [idleCourtsCount, isWarmupDone, courts, players, updateCloudSession]);

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

  const movePlayerToCourtSlot = useCallback((playerId: string, courtId: number, slotIdx: number) => {
    setSelectedPlayerForMove(null);

    const newSlots = queueSlots.map(id => id === playerId ? null : id);
    while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();

    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, status: 'playing' } as Player : p
    );

    const updatedCourts = courts.map(c => {
      if (c.id !== courtId) {
        const newPlayerIds = c.playerIds.filter(id => id !== playerId);
        return {
          ...c,
          playerIds: newPlayerIds,
          startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
        };
      }

      const slots: (string | null)[] = Array.from({ length: MAX_PLAYERS_PER_COURT }, (_, i) => c.playerIds[i] ?? null);
      const currentSlot = slots.indexOf(playerId);
      if (currentSlot !== -1) slots[currentSlot] = null;

      const targetIdx = Math.min(slotIdx, MAX_PLAYERS_PER_COURT - 1);
      if (slots[targetIdx] !== null && slots[targetIdx] !== playerId) {
        if (currentSlot !== -1) {
          slots[currentSlot] = slots[targetIdx];
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
  // 會員管理與報到 Action (寫入 Firestore / Mock)
  // ==========================================

  const createMember = useCallback(async (nameToAdd: string) => {
    if (!spaceId) return;
    const name = nameToAdd.trim();
    if (!name) return;

    if (members.some(m => m.name === name)) {
      alert('此會員已存在');
      return;
    }

    const newMember: Member = {
      id: crypto.randomUUID(),
      name: name,
      level: newMemberLevel,
      createdAt: Date.now()
    };

    try {
      await addMember(spaceId, newMember);
      setNewMemberName('');
      setNewMemberLevel('intermediate'); 
    } catch (e) {
      alert("新增會員失敗");
    }
  }, [spaceId, members, newMemberLevel]);

  const parseCsvAndImport = useCallback(async (csvText: string) => {
    if (!spaceId) return;
    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        alert('CSV 檔案格式錯誤：至少需要標題列和一筆資料');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const nameIndex = headers.findIndex(h => h === '姓名' || h === 'name' || h === '名稱');
      if (nameIndex === -1) {
        alert('CSV 格式錯誤：缺少「姓名」欄位');
        return;
      }

      const levelIndex = headers.findIndex(h => h === '等級' || h === '狀態' || h === 'level' || h === '技能');

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

        let level: SkillLevel = 'intermediate';
        if (levelIndex !== -1 && values[levelIndex]) {
          const levelValue = values[levelIndex].trim().toLowerCase();
          if (['intermediate', '一般', '零打', '中階', '中级'].includes(levelValue)) {
            level = 'intermediate';
          } else if (['beginner', '初階', '初级', '季打'].includes(levelValue)) {
            level = 'beginner';
          }
        }

        newMembers.push({
          id: crypto.randomUUID(),
          name,
          level,
          createdAt: Date.now()
        });
      }

      if (newMembers.length > 0) {
        await addMembersBatch(spaceId, newMembers);
      }

      let message = `成功匯入 ${newMembers.length} 位會員`;
      if (skippedNames.length > 0) {
        message += `\n跳過 ${skippedNames.length} 位重複會員：${skippedNames.join(', ')}`;
      }
      alert(message);
    } catch (error) {
      alert('CSV 檔案解析失敗，請確認檔案格式正確');
    }
  }, [spaceId, members]);

  const handleBatchImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('請上傳 CSV 格式的檔案');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCsvAndImport(text);
    };
    reader.readAsText(file, 'UTF-8');
    if (event.target) event.target.value = '';
  }, [parseCsvAndImport]);

  const updateMemberLevel = useCallback(async (memberId: string, newLevel: SkillLevel) => {
    if (!spaceId) return;
    try {
      await updateMember(spaceId, memberId, { level: newLevel });
      const memberName = members.find(m => m.id === memberId)?.name;
      if (memberName) {
        const updatedPlayers = players.map(p => 
          p.name === memberName ? { ...p, level: newLevel } as Player : p
        );
        updateCloudSession({ players: updatedPlayers });
      }
    } catch (e) {
      console.error(e);
    }
  }, [spaceId, members, players, updateCloudSession]);

  const updatePlayerLevel = useCallback(async (playerId: string, newLevel: SkillLevel) => {
    const targetPlayer = players.find(p => p.id === playerId);
    if (!targetPlayer || !spaceId) return;

    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, level: newLevel } as Player : p
    );
    await updateCloudSession({ players: updatedPlayers });

    const targetMember = members.find(m => m.name === targetPlayer.name);
    if (targetMember) {
      await updateMember(spaceId, targetMember.id, { level: newLevel });
    }
  }, [spaceId, players, members, updateCloudSession]);
  const [checkInSuccessName, setCheckInSuccessName] = useState<string | null>(null);
  const [checkInCounter, setCheckInCounter] = useState(0);
  const checkInTimeoutRef = useRef<any>(null);

  const checkInMember = useCallback((member: Member) => {
    const existingPlayer = players.find(p => p.name === member.name);
    if (existingPlayer) return existingPlayer.id;

    const newId = crypto.randomUUID();
    const newPlayer: Player = {
      id: newId,
      name: member.name,
      status: 'idle',
      level: member.level,
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

  // 當 spaceId 或登入球員變更時，重置自動選取狀態
  useEffect(() => {
    hasAutoSelectedRef.current = false;
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
        // 尚未報到，自動報到
        console.log(`[Auto Check-In] 球員 ${currentMemberName} 尚未報到，執行自動報到...`);
        const pId = checkInMember(member);
        if (pId) {
          setSelectedPlayerForMove(pId);
          hasAutoSelectedRef.current = true;
        }
      } else {
        // 已經報到
        if (!hasAutoSelectedRef.current) {
          // 如果尚未進行過自動選取，且球員在休息區 (idle)，則自動選取
          if (matchedPlayer.status === 'idle') {
            console.log(`[Auto Select] 自動選取休息區中的球員 ${currentMemberName}`);
            setSelectedPlayerForMove(matchedPlayer.id);
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
    checkInMember
  ]);

  const removeMember = useCallback(async (memberId: string) => {
    if (!spaceId) return;
    if (confirm('確定要刪除此會員嗎？（這不會影響目前場上的球員）')) {
      try {
        await deleteMember(spaceId, memberId);
      } catch (e) {
        alert("刪除會員失敗");
      }
    }
  }, [spaceId]);

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
      setActiveTab('members');
      showToast("🔑 已成功切換為團主模式！");
      return;
    }

    // 若有設定密碼且之前已驗證過，也直接進入
    if (spaceId && verifiedAdmins[spaceId]) {
      const user: CurrentUser = { role: 'admin' };
      setCurrentUser(user);
      localStorage.setItem(`badminton_current_user_${spaceId}`, JSON.stringify(user));
      setActiveTab('members');
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

      // 儲存已驗證標記
      const updatedVerified = { ...verifiedAdmins, [spaceId]: true };
      setVerifiedAdmins(updatedVerified);
      localStorage.setItem('badminton_verified_admins', JSON.stringify(updatedVerified));

      setPasscodePromptOpen(false);
      setFailedAttempts(0);
      setIsShaking(false);
      setActiveTab('members');
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
      
      // 同步更新當前本地的驗證狀態
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

      setIsSpaceSettingsOpen(false);
      showToast("✨ 球團設定已成功更新！");
    } catch (err) {
      console.error(err);
      showToast("❌ 更新設定失敗，請確認網路連線。");
    }
  };

  // ==========================================
  // 大廳 (Landing Page) 動作
  // ==========================================
  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newSpaceId.trim().toLowerCase();
    const name = newSpaceName.trim();
    const passcode = newSpacePasscode.trim();
    const spacePasscode = newSpaceAccessPasscode.trim();

    if (hasPasscode && (passcode.length < 4 || passcode.length > 10)) {
      alert("管理員密碼長度必須在 4 到 10 位數之間！");
      return;
    }
    if (hasSpacePasscode && (spacePasscode.length < 4 || spacePasscode.length > 10)) {
      alert("空間專屬存取密碼長度必須在 4 到 10 位數之間！");
      return;
    }

    setIsSpaceLoading(true);
    try {
      const exists = await checkSpaceExists(cleanId);
      if (exists) {
        alert("此空間 ID 已被使用，請另選一個網址。");
        setIsSpaceLoading(false);
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
      alert("建立空間失敗，請確認網路或稍後重試。");
    } finally {
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
          showToast("已成功複製分享網址！");
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
        showToast("已成功複製分享網址！");
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

  // 刪除最近造訪的球團紀錄
  const handleDeleteRecentSpace = (id: string) => {
    setRecentSpaces(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem('badminton_recent_spaces', JSON.stringify(updated));
      return updated;
    });
    showToast("🗑️ 已移除該造訪紀錄");
  };

  // ==========================================
  // 渲染大廳 (Landing Page)
  // ==========================================
  if (!spaceId) {
    return (
      <div className="relative h-full bg-slate-950 text-slate-100 flex flex-col overflow-y-auto overflow-x-hidden">
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
          <span className="text-xs text-slate-500 font-mono">v1.2</span>
        </header>

        {/* 主內容區 */}
        <main className="flex-1 flex items-center justify-center py-10 px-6 z-10">
          <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 my-auto">
            
            {/* 左側：進入/加入空間 */}
            <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl flex flex-col justify-between min-h-[460px] md:h-[55vh] md:min-h-[500px] md:max-h-[580px]">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                    <ExternalLink className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">進入已建立球團</h2>
                </div>
                <p className="text-sm text-slate-400 mb-6">輸入現有球團 ID，或是從下方「最近造訪」紀錄一鍵秒速返回。</p>

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
                      className="w-full h-12 pl-4 pr-12 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-600 text-slate-200 transition-all font-mono"
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
                    <div className="space-y-2 max-h-[180px] md:max-h-none overflow-y-auto pr-1.5 flex-1 min-h-0 scroll-smooth [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.800)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                      {recentSpaces.map(space => (
                        <div
                          key={space.id}
                          className="w-full flex items-center justify-between p-3.5 bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800 rounded-xl transition-all text-left group relative"
                        >
                          {/* 點擊進入空間區域 */}
                          <div 
                            onClick={() => window.location.hash = `#/space/${space.id}`}
                            className="flex-1 flex items-center justify-between cursor-pointer min-w-0 pr-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xl">🏸</span>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">{space.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono truncate">ID: {space.id}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 shrink-0">
                              {space.spacePasscode && (
                                <span className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/25 text-[10px] font-medium px-2 py-0.5 rounded-full text-rose-400 shrink-0">
                                  <Lock className="w-3 h-3 animate-pulse" />
                                  私密
                                </span>
                              )}
                              {space.adminPasscode && (
                                <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/25 text-[10px] font-medium px-2 py-0.5 rounded-full text-amber-400 shrink-0">
                                  <Key className="w-3 h-3" />
                                  管理
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

              <div className="text-xs text-slate-600 pt-6 border-t border-slate-900/60">
                💡 多裝置同步提示：其他打球球員可使用手機掃描團主專屬網址，即可隨時查閱即時隊伍、自動排隊，完全零時差。
              </div>
            </div>

            {/* 右側：建立全新空間 */}
            <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl flex flex-col justify-between min-h-[460px] md:h-[55vh] md:min-h-[500px] md:max-h-[580px]">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">建立全新球團空間</h2>
                </div>
                <p className="text-sm text-slate-400 mb-6">為您的球團建立獨立且免費的雲端排隊空間，設定完即可立即使用。</p>

                <form onSubmit={handleCreateSpace} className="space-y-4">
                  {/* 球團名稱 */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">球團/群組名稱</label>
                    <input
                      type="text"
                      placeholder="例如：快樂週三羽球團"
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm placeholder-slate-700 transition-all"
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
                      className="w-full h-11 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm font-mono placeholder-slate-700 transition-all"
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
                        {hasPasscode && (
                          <span className="flex items-center bg-amber-500/10 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20">🔑 管理</span>
                        )}
                        {hasSpacePasscode && (
                          <span className="flex items-center bg-rose-500/10 text-rose-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-rose-500/20">🔒 私密</span>
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
                onClick={() => setIsSecuritySettingsOpen(false)}
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
                        hasPasscode ? 'bg-purple-600' : 'bg-slate-800'
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
                      placeholder={hasPasscode ? "請設定管理密碼 (4-10 位)" : "管理密碼已停用"}
                      disabled={!hasPasscode}
                      className={`w-full h-10 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
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
                        hasSpacePasscode ? 'bg-purple-600' : 'bg-slate-800'
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
                      placeholder={hasSpacePasscode ? "請設定空間存取密碼 (4-10 位)" : "空間密碼已停用"}
                      disabled={!hasSpacePasscode}
                      className={`w-full h-10 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
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
                  onClick={() => {
                    if (hasPasscode && (newSpacePasscode.length < 4 || newSpacePasscode.length > 10)) {
                      alert("管理員密碼長度必須在 4 到 10 位數之間！");
                      return;
                    }
                    if (hasSpacePasscode && (newSpaceAccessPasscode.length < 4 || newSpaceAccessPasscode.length > 10)) {
                      alert("空間專屬存取密碼長度必須在 4 到 10 位數之間！");
                      return;
                    }
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
      </div>
    );
  }

  // ==========================================
  // 渲染載入中 / 錯誤頁面
  // ==========================================
  if (isSpaceLoading || (spaceId && (!isSessionLoaded || !isMembersLoaded))) {
    return (
      <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-4">
        <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
        <p className="text-sm text-slate-400 font-medium">正在加載「{spaceId}」賽局狀態與雲端連線中...</p>
      </div>
    );
  }

  if (spaceError) {
    return (
      <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-6">
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
    );
  }

  // ==========================================
  // 私密空間驗證 UI
  // ==========================================
  if (spacePasscodePromptOpen) {
    return (
      <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-4">
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
            <div className="bg-rose-500/10 text-rose-400 p-4 rounded-full flex items-center justify-center">
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
              placeholder="請輸入空間專屬密碼"
              className="w-full h-12 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-center font-mono text-slate-200 placeholder-slate-700"
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
              className="w-full h-12 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-rose-600/20"
            >
              進入球團
            </button>
          </div>
        </div>
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
      <div className="flex flex-col items-center justify-center h-full w-full bg-slate-950 text-slate-200 p-4">
        <div className="bg-slate-900 border border-slate-800 p-6 xs:p-7 sm:p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-auto relative overflow-hidden">
          
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
                  className="w-full h-10 pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-200"
                  value={loginSearchTerm}
                  onChange={e => setLoginSearchTerm(e.target.value)}
                  autoFocus
                />
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              </div>
              <div className="max-h-60 overflow-y-auto scrollbar-gutter-stable space-y-2 pr-1">
                {loginFilteredMembers.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    {loginSearchTerm ? '找不到符合的成員' : '目前尚無會員，請聯絡管理員新增'}
                  </div>
                ) : (
                  loginFilteredMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => {
                        const user: CurrentUser = { role: 'player', memberId: member.id };
                        setCurrentUser(user);
                        localStorage.setItem(`badminton_current_user_${spaceId}`, JSON.stringify(user));
                        setActiveTab('queue');
                        
                        const pId = checkInMember(member);
                        if (pId) setSelectedPlayerForMove(pId);
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-slate-950/50 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors text-left group"
                    >
                      <PlayerAvatar identifier={member.name} className="w-8 h-8 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">{member.name}</div>
                        <div className="text-xs text-slate-500">{SKILL_LEVELS[member.level].label}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 密碼驗證彈出視窗 */}
        {passcodePromptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
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
            <div className={`bg-slate-900 border border-slate-800 p-4 xs:p-5 sm:p-6 rounded-2xl max-w-sm w-full shadow-2xl animate-[fadeIn_0.2s_ease-out] relative ${isShaking ? 'animate-shake' : ''}`}>
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
                  placeholder="請輸入管理密碼"
                  className="w-full h-11 px-4 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-mono text-slate-200 placeholder-slate-700"
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
              className="w-full h-10 pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-slate-500 text-sm"
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
                    setSelectedPlayerForMove(player.id);
                    setIsRestAreaOpen(false);
                  }
                }}
                className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full border transition-all select-none
                  ${selectedPlayerForMove === player.id
                    ? 'bg-slate-800 border-slate-700 ring-2 ring-inset ring-blue-400 cursor-pointer shadow-lg'
                    : canMovePlayer(player.id)
                      ? (isSelf
                          ? 'bg-slate-100/15 border-slate-300/40 hover:bg-slate-100/20 shadow-[0_0_8px_rgba(255,255,255,0.05)] cursor-grab active:cursor-grabbing font-bold animate-[pulse_3s_infinite]'
                          : 'bg-slate-800/60 border-slate-700 hover:bg-slate-700 cursor-grab active:cursor-grabbing')
                      : 'bg-slate-800/40 border-slate-700/50 cursor-default'
                  }`}
              >
                <PlayerAvatar identifier={player.name} className="w-5 h-5 shrink-0" />
                <span className={`text-xs whitespace-nowrap ${isSelf ? 'text-white font-semibold' : 'text-slate-300'}`}>
                  {player.name}
                </span>
                <span 
                  title={SKILL_LEVELS[player.level].label} 
                  className={`w-2 h-2 rounded-full shrink-0 ${SKILL_LEVELS[player.level].bg}`}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const asideTab = activeTab === 'courts' ? 'queue' : activeTab;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden relative">
      {/* Toast Alert */}
      {toastMessage && (
        <div key={toastCounter} className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[100] animate-[fadeIn_0.2s_ease-out] pointer-events-none w-full px-4 flex justify-center">
          <div className="bg-slate-950/95 border border-slate-800 shadow-2xl rounded-xl px-5 py-3 text-sm text-slate-200 flex items-center gap-2.5 backdrop-blur-md w-max max-w-full">
            <div className="w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center">
              <Check className="w-3.5 h-3.5" />
            </div>
            {toastMessage}
          </div>
        </div>
      )}

      {/* Global Header (Normal Mode / Action Mode) */}
      {showGlobalBanner && selectedPlayerForMove ? (() => {
        const p = players.find(p => p.id === selectedPlayerForMove);
        if (!p) return null;
        return (
          <header className="h-16 px-4 bg-indigo-950 border-b border-indigo-900/50 flex items-center justify-between z-20 shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center justify-between w-full flex-1">
              <div className="flex items-center gap-3">
                 <PlayerAvatar identifier={p.name} className="w-9 h-9 shrink-0 rounded-full shadow-sm" />
                 <div className="flex flex-col justify-center gap-1">
                    <div className="font-bold text-white text-sm leading-tight">已選取 {p.name}</div>
                    <div className="text-[11px] text-indigo-200/70 leading-tight">請點擊 ”移動至此“ 的空位放置</div>
                 </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                 <button onClick={() => deletePlayer(p.id)} className="bg-slate-850 hover:bg-red-500/20 text-slate-300 hover:text-red-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"><LogOut className="w-3.5 h-3.5"/>早退</button>
                 <button onClick={() => setSelectedPlayerForMove(null)} className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-4 py-1.5 rounded-lg transition-colors font-semibold">取消</button>
              </div>
            </div>
          </header>
        );
      })() : (
        <header className="h-16 px-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
            <div className="flex items-center justify-between w-full flex-1">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20 shrink-0">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex flex-col gap-1">
                  <h1 className="text-base font-bold text-white truncate leading-none">
                    {spaceMetadata?.name}
                  </h1>
                  <span className="text-[10px] text-slate-500 font-mono truncate leading-none">ID: {spaceId}</span>
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
                        <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                      )}
                    </div>
                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap hidden min-[375px]:inline-block">
                      {currentUser?.role === 'admin' ? '團主' : members.find(m => m.id === currentUser?.memberId)?.name || '球員'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-500" />
                  </button>

                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="px-3 py-2 border-b border-slate-800/60 flex items-baseline gap-1.5 bg-slate-950/20">
                        <p className="text-[10px] text-slate-500 font-medium shrink-0">
                          {!currentUser ? '未登入' : (currentUser.role === 'admin' ? '團主' : '球員')}
                        </p>
                        {currentUser && (
                          <p className="text-xs font-bold text-slate-300 truncate flex-1">
                            {currentUser.role === 'admin' ? '管理員' : members.find(m => m.id === currentUser.memberId)?.name || ''}
                          </p>
                        )}
                      </div>
                      
                      {currentUser?.role === 'admin' && (
                        <div className="py-1">
                          <button
                            onClick={() => {
                              setIsSpaceSettingsOpen(true);
                              setIsProfileMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                          >
                            <Settings className="w-4 h-4 text-slate-500" />
                            球團空間設定
                          </button>
                          <button
                            onClick={() => {
                              resetSession();
                              setIsProfileMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400/90 hover:text-red-400 hover:bg-red-500/10 transition-colors group"
                          >
                            <Power className="w-4 h-4 text-red-500/70 group-hover:text-red-400 transition-colors" />
                            結束本日打球
                          </button>
                          <div className="h-px bg-slate-800/60 my-1 mx-2" />
                        </div>
                      )}
                      
                      <div className="py-1">
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
                    </div>
                  )}
                </div>
              </div>
            </div>
        </header>
      )}

      {/* Mobile Global Tabs */}
      <div className="lg:hidden flex border-b border-slate-800 px-2 shrink-0 bg-slate-950 z-10">
          {currentUser?.role !== 'player' && (
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'members'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
            >
              <Users className="w-4 h-4" />
              報到區
            </button>
          )}
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'queue'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
              }`}
          >
            <Swords className="w-4 h-4" />
            排隊區
          </button>
          <button
            onClick={() => setActiveTab('courts')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'courts'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
              }`}
          >
            <Trophy className="w-4 h-4" />
            場地區
          </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        <aside
          className={`
            bg-slate-950 border-r border-slate-800 flex-col shrink-0 shadow-2xl lg:shadow-none
            lg:w-[25rem] lg:relative lg:flex lg:flex-initial
            ${activeTab === 'courts' ? 'hidden' : 'flex flex-1 w-full lg:w-[25rem] z-10 lg:z-auto'}
          `}
        >
          {/* Desktop Tabs */}
          <div className="hidden lg:flex border-b border-slate-800 px-2 shrink-0">
            {currentUser?.role !== 'player' && (
              <button
                onClick={() => setActiveTab('members')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${asideTab === 'members'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
              >
                <Users className="w-4 h-4" />
                報到區
              </button>
            )}
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${asideTab === 'queue' || asideTab === 'courts'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
            >
              <Swords className="w-4 h-4" />
              排隊區
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            
            {/* Tab Content: Queue Management */}
            {asideTab === 'queue' && (
              <div className="flex-1 overflow-y-auto scrollbar-gutter-stable flex flex-col min-h-0 animate-[fadeIn_0.2s_ease-out]">
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
                    if (source === 'court') {
                      removePlayerFromCourt(playerId);
                      joinQueue(playerId);
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
                        className="text-xs text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md transition-colors font-medium"
                      >
                        清空
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {queueDisplayItems.length === 0 ? (
                      <div className="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-sm bg-slate-900/50">
                        目前沒有人在排隊
                        <div className="text-xs mt-1 opacity-70">點擊下方「休息區」成員即可加入等待</div>
                      </div>
                    ) : (
                      chunkedQueueItems.map((chunk, chunkIdx) => {
                        return (
                          <React.Fragment key={chunkIdx}>
                            <div className="relative flex items-center py-2 animate-[fadeIn_0.3s_ease-out]">
                              <div className="flex-1 flex items-center gap-3 min-w-0 overflow-hidden">
                                <span className="font-mono text-xs text-slate-500 w-4 text-center shrink-0">{chunkIdx + 1}</span>
                                <div className="grid grid-cols-2 gap-3 min-w-0 flex-1">
                                  {chunk.map((item, idx) => (
                                    <React.Fragment key={idx}>
                                      {item.type === 'player' ? (
                                      <div
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
                                          <div
                                            title="排隊成員"
                                            className={`w-full h-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] transition-colors text-left min-w-0 border ${
                                              item.data.name === currentMemberName 
                                                ? 'bg-slate-100/10 hover:bg-slate-100/20 border-slate-300/30 shadow-[0_0_10px_rgba(255,255,255,0.05)]' 
                                                : 'bg-slate-800/50 hover:bg-slate-700/60 border-slate-700/30'
                                            }`}
                                          >
                                            <span className={`flex items-center gap-1.5 text-sm min-w-0 ${item.data.name === currentMemberName ? 'text-white font-bold' : 'text-slate-300 font-medium'}`}>
                                              <PlayerAvatar identifier={item.data.name} className="w-2.5 h-2.5 shrink-0" />
                                              <span className="truncate">{item.data.name}</span>
                                            </span>
                                            {canMovePlayer(item.data.id) && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  removeFromQueue(item.data.id);
                                                }}
                                                className="p-1 text-slate-500 hover:text-amber-400 transition-colors -mr-1"
                                                title="讓球員休息 (移出佇列)"
                                              >
                                                <Coffee className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          className={`h-10 flex items-center justify-center rounded-lg border border-dashed transition-all cursor-pointer ${
                                            dragOverSlotKey === `${chunkIdx}-${idx}`
                                              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                                              : selectedPlayerForMove !== null
                                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/50'
                                                : 'border-slate-800/50 text-slate-500'
                                          }`}
                                          title={selectedPlayerForMove ? '點擊移動成員到此' : '空位'}
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
                                              if (source === 'court') removePlayerFromCourt(playerId);
                                              if (source === 'queue') {
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
                                                removePlayerFromCourt(selectedPlayerForMove);
                                                insertIntoQueueAt(selectedPlayerForMove, flatIdx);
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
              <div className="flex-1 overflow-y-auto scrollbar-gutter-stable flex flex-col min-h-0 animate-[fadeIn_0.2s_ease-out] bg-slate-950">
                <div className="px-6 pt-4 pb-3 sticky top-0 bg-slate-950/95 backdrop-blur z-10 space-y-2">
                  <div className="flex items-center justify-between min-h-[32px]">
                    <h2 className="text-sm font-semibold text-slate-400">
                      會員列表 ({notCheckedInMembers.length})
                    </h2>
                    <div className="flex items-center gap-1 -mr-1.5">
                      <button
                        onClick={() => {
                          setIsSearchExpanded(!isSearchExpanded);
                          if (isSearchExpanded) setMemberSearchTerm('');
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${isSearchExpanded
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                        title="搜尋會員"
                      >
                        <Search className="w-4 h-4" />
                      </button>

                      {/* Settings Dropdown */}
                      {currentUser?.role === 'admin' && (
                        <div className="relative">
                          <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                              }`}
                            title="更多操作與播報設定"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {isSettingsOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setIsSettingsOpen(false)} />
                              <div className="absolute right-0 top-full mt-2 w-60 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                                <div className="p-2">
                                  
                                  {/* 播報設定 */}
                                  <div className="px-3 py-2">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">📢 雲端播報同步設定</div>
                                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px]">
                                      <button
                                        onClick={() => {
                                          updateCloudSession({ announceMode: 'local' });
                                          setIsSettingsOpen(false);
                                        }}
                                        className={`py-1.5 rounded-md font-semibold text-center transition-all ${
                                          announceMode === 'local' 
                                            ? 'bg-indigo-600 text-white shadow-md' 
                                            : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        僅開賽裝置播音
                                      </button>
                                      <button
                                        onClick={() => {
                                          updateCloudSession({ announceMode: 'all' });
                                          setIsSettingsOpen(false);
                                        }}
                                        className={`py-1.5 rounded-md font-semibold text-center transition-all ${
                                          announceMode === 'all' 
                                            ? 'bg-indigo-600 text-white shadow-md' 
                                            : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        全裝置同步播音
                                      </button>
                                    </div>
                                  </div>

                                  <div className="h-px bg-slate-800 my-1 mx-2" />

                                  {/* CSV 匯入 */}
                                  <button
                                    onClick={() => {
                                      fileInputRef.current?.click();
                                      setIsSettingsOpen(false);
                                    }}
                                    className="w-full flex items-start gap-3 p-2 hover:bg-slate-800 rounded-md transition-colors text-left group"
                                  >
                                    <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-md group-hover:bg-emerald-500 group-hover:text-white transition-colors mt-0.5">
                                      <Upload className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">匯入名單 (.csv)</div>
                                      <div className="text-[9px] text-slate-500 mt-0.5 leading-tight">格式: 姓名,等級(季打/零打)</div>
                                    </div>
                                  </button>

                                  <div className="h-px bg-slate-800 my-1 mx-2" />

                                  {/* 清空休息區 */}
                                  <button
                                    onClick={() => {
                                      clearBench();
                                      setIsSettingsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-slate-800 rounded-md transition-colors text-left group text-red-400 hover:text-red-300"
                                  >
                                    <div className="p-1.5 bg-red-500/10 rounded-md group-hover:bg-red-500 group-hover:text-white transition-colors">
                                      <UserX className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="text-xs font-semibold">清空休息區</div>
                                      <div className="text-[9px] text-slate-500 mt-0.5 leading-none">讓休息中球員全部早退</div>
                                    </div>
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {isSearchExpanded && (
                    <div className="flex items-center gap-2 h-10 animate-[fadeIn_0.2s_ease-out] pt-1">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="搜尋會員..."
                          className="w-full h-10 pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-200"
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
                    <div className="flex items-center gap-2 h-10">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="新會員姓名"
                          maxLength={10}
                          className="w-full h-10 pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-200"
                          value={newMemberName}
                          onChange={e => setNewMemberName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newMemberName) createMember(newMemberName);
                          }}
                        />
                        <UserPlus className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      </div>
                      <button
                        onClick={() => createMember(newMemberName)}
                        disabled={!newMemberName.trim()}
                        className={`h-10 px-3 bg-indigo-600 text-white text-xs font-semibold rounded-lg transition-all shrink-0 flex items-center justify-center
                          ${!newMemberName.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-500'}`}
                      >
                        新增會員
                      </button>
                    </div>
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
                      {memberSearchTerm ? '找不到符合的會員' : '尚未新增會員名單'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {notCheckedInMembers.map(member => (
                        <div key={member.id} className="group flex items-center justify-between py-2 rounded-lg border border-transparent">
                          <div className="flex items-center gap-2 min-w-0 pl-1.5">
                            <PlayerAvatar identifier={member.name} className="w-5.5 h-5.5 shrink-0 rounded-full" />
                            <span className="text-sm text-slate-300 font-medium truncate">{member.name}</span>
                            <div className="scale-90 origin-left">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${SKILL_LEVELS[member.level].bg} ${SKILL_LEVELS[member.level].color} ${SKILL_LEVELS[member.level].border}`}>
                                {SKILL_LEVELS[member.level].label}
                              </span>
                            </div>
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
                                title="刪除此會員"
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

        {/* Main Content: Courts Grid */}
        <main className={`flex-1 flex-col min-w-0 h-full relative z-0 ${activeTab === 'courts' ? 'flex' : 'hidden lg:flex'}`}>
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
              
              {/* 語音開關 (本地控制) */}
              <button
                onClick={() => {
                  const val = !isAutoAnnounce;
                  setIsAutoAnnounce(val);
                  showToast(val ? "🔊 本裝置開啟語音播報" : "🔇 本裝置關閉語音播報");
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
                  isAutoAnnounce={isAutoAnnounce}
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
        <div className={`relative w-full lg:max-w-2xl lg:mx-auto bg-slate-950 border-t border-slate-800 rounded-t-3xl shadow-2xl flex flex-col max-h-[40vh] pb-safe transition-transform duration-300 ease-out ${isRestAreaOpen ? 'translate-y-0' : 'translate-y-full'}`}>
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
          <div className="max-w-[400px] w-full bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur-2xl relative overflow-hidden flex flex-col items-center text-center animate-toast-fade pointer-events-auto">
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
              您可以切換至排隊區加入賽局等待
            </p>
          </div>
        </div>
      )}

      {/* 球團空間設定彈窗 */}
      {isSpaceSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-slate-800 p-4 xs:p-5 sm:p-6 rounded-3xl max-w-sm w-full shadow-2xl relative overflow-hidden">
            <button
              type="button"
              onClick={() => setIsSpaceSettingsOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center mb-5">
              <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mb-3">
                <Settings className="w-6 h-6 animate-[spin_8s_linear_infinite]" />
              </div>
              <h3 className="text-lg font-bold text-white">球團空間設定</h3>
              <p className="text-xs text-slate-400 mt-1">修改目前球團名稱與安全防護密碼</p>
            </div>

            <form onSubmit={handleSaveSpaceSettings} className="space-y-4">
              {/* 球團名稱 */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">球團/群組名稱</label>
                <input
                  type="text"
                  placeholder="例如：快樂週三羽球團"
                  className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-xs placeholder-slate-700 transition-all"
                  value={editSpaceName}
                  onChange={e => setEditSpaceName(e.target.value)}
                  required
                />
              </div>

              {/* 1. 管理員密碼 */}
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
                      editHasPasscode ? 'bg-purple-600' : 'bg-slate-800'
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
                  placeholder={editHasPasscode ? "設定管理密碼 (4-10 位)" : "管理密碼已停用"}
                  disabled={!editHasPasscode}
                  className={`w-full h-9 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
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

              {/* 2. 空間存取密碼 */}
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
                      editHasSpacePasscode ? 'bg-purple-600' : 'bg-slate-800'
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
                  placeholder={editHasSpacePasscode ? "設定空間存取密碼 (4-10 位)" : "空間密碼已停用"}
                  disabled={!editHasSpacePasscode}
                  className={`w-full h-9 px-3 bg-slate-950 border rounded-xl focus:outline-none focus:ring-2 text-slate-200 text-xs transition-all duration-[1000ms] ease-in-out font-mono ${
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

              {/* 按鈕區 */}
              <div className="flex gap-3 pt-2">
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
    </div>
  );
}