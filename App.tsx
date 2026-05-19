import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Users, Activity, Coffee, ArrowRight, RotateCcw, Trash2, Trophy, Plus, Minus, Volume2, VolumeX, X, Swords, UserCheck, Search, CheckCircle2, ChevronDown, ChevronRight, Unlink, ArrowUp, PanelLeft, LogOut, UserX, ChevronUp, Flame, Lock, UserPlus, Upload, Settings, MoreVertical, Power } from 'lucide-react';
import { Player, Court, Member, INITIAL_COURT_COUNT, MAX_PLAYERS_PER_COURT, SkillLevel, SKILL_LEVELS, CurrentUser, UserRole } from './types';
import { CourtCard } from './components/CourtCard';
import { PlayerAvatar } from './components/PlayerAvatar';

type Tab = 'courts' | 'queue' | 'members';



export default function App() {
  // --- State ---
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    const saved = localStorage.getItem('badminton_current_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoggingInAsPlayer, setIsLoggingInAsPlayer] = useState(false);
  const [loginSearchTerm, setLoginSearchTerm] = useState('');

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('badminton_current_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.role === 'player' ? 'courts' : 'courts';
    }
    return 'courts';
  });
  const [isRestAreaOpen, setIsRestAreaOpen] = useState(false); // Bottom sheet state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // New: Sidebar toggle state
  const [currentTime, setCurrentTime] = useState(new Date()); // New: Clock state
  const [isAutoAnnounce, setIsAutoAnnounce] = useState(true); // New: Auto announce toggle

  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [queueSlots, setQueueSlots] = useState<(string | null)[]>([]);
  const [isWarmupDone, setIsWarmupDone] = useState(false);
  const [isCheckedInExpanded, setIsCheckedInExpanded] = useState(false);
  const [isMemberListExpanded, setIsMemberListExpanded] = useState(true);

  // Member UI Collapse State
  const [isSearchExpanded, setIsSearchExpanded] = useState(true);
  const [isAddMemberExpanded, setIsAddMemberExpanded] = useState(false);
  const [isBatchImportExpanded, setIsBatchImportExpanded] = useState(false);

  // Check-in Success Notification
  const [checkInSuccessName, setCheckInSuccessName] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);



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

  // Queue Display State

  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = localStorage.getItem('badminton_players');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: ensure level exists
      return parsed.map((p: any) => ({ ...p, level: p.level || 'intermediate' }));
    }
    return [];
  });

  const [courts, setCourts] = useState<Court[]>(() => {
    const saved = localStorage.getItem('badminton_courts');
    if (saved) return JSON.parse(saved);
    return Array.from({ length: INITIAL_COURT_COUNT }, (_, i) => ({
      id: i + 1,
      name: `場地 ${i + 1}`,
      playerIds: [],
      startTime: null,
    }));
  });

  // Member System State
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem('badminton_members');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: ensure level exists
      return parsed.map((m: any) => ({ ...m, level: m.level || 'intermediate' }));
    }
    return [];
  });

  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberLevel, setNewMemberLevel] = useState<SkillLevel>('intermediate');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [restAreaSearchTerm, setRestAreaSearchTerm] = useState('');
  const [isRestAreaSearchExpanded, setIsRestAreaSearchExpanded] = useState(false);

  // Click-to-move mode state
  const [selectedPlayerForMove, setSelectedPlayerForMove] = useState<string | null>(null);

  // Global notification banner for click-to-move
  const [showGlobalBanner, setShowGlobalBanner] = useState(false);
  useEffect(() => {
    if (selectedPlayerForMove) setShowGlobalBanner(true);
    else setShowGlobalBanner(false);
  }, [selectedPlayerForMove]);

  // --- Persistence ---
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('badminton_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('badminton_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('badminton_players', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem('badminton_courts', JSON.stringify(courts));
  }, [courts]);

  useEffect(() => {
    localStorage.setItem('badminton_members', JSON.stringify(members));
  }, [members]);

  // --- Clock Effect ---
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Keyboard Handler for Escape Key ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedPlayerForMove) {
        setSelectedPlayerForMove(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPlayerForMove]);

  // --- Auth Checks ---
  const canMovePlayer = useCallback((playerId: string) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    
    const member = members.find(m => m.id === currentUser.memberId);
    if (!member) return false;
    
    const player = players.find(p => p.id === playerId);
    if (!player) return false;
    
    return player.name === member.name;
  }, [currentUser, members, players]);

  // --- Derived Lists ---
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
  const idlePlayers = useMemo(() => players.filter(p => p.status === 'idle').sort((a, b) => b.joinedAt - a.joinedAt), [players]);

  // Filtered idle players based on search term
  const filteredIdlePlayers = useMemo(() => {
    let result = idlePlayers;
    if (restAreaSearchTerm) {
      result = idlePlayers.filter(p => p.name.toLowerCase().includes(restAreaSearchTerm.toLowerCase()));
    }
    
    if (currentMemberName) {
      result = [...result].sort((a, b) => {
        if (a.name === currentMemberName) return -1;
        if (b.name === currentMemberName) return 1;
        return 0; // maintain relative order
      });
    }
    return result;
  }, [idlePlayers, restAreaSearchTerm, currentMemberName]);
  const totalActivePlayers = useMemo(() => players.filter(p => p.status === 'playing').length, [players]);
  const idleCourtsCount = useMemo(() => courts.filter(c => c.startTime === null).length, [courts]);

  // --- Match Calculation Logic ---
  // Get the first group of 4 players that is fully occupied (slot order)
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

  // Next Match Group Calculation (Who is on deck?)
  const nextMatchPlayers = useMemo(() => {
    return getNextMatchBatch(queueSlots, players);
  }, [queueSlots, players, getNextMatchBatch]);

  const isQueueReady = nextMatchPlayers.length === MAX_PLAYERS_PER_COURT;

  // Filtered Members
  const filteredMembers = useMemo(() => {
    const term = memberSearchTerm.toLowerCase().trim();
    if (!term) return members.sort((a, b) => b.createdAt - a.createdAt);
    return members
      .filter(m => m.name.toLowerCase().includes(term))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [members, memberSearchTerm]);

  // Categorize members based on check-in status
  const { checkedInMembers, notCheckedInMembers } = useMemo(() => {
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

  // --- Queue Display Logic (Slot-Based) ---
  const queueDisplayItems = useMemo(() => {
    const playerMap = new Map<string, Player>(players.map(p => [p.id, p]));
    const displayResult: ({ type: 'player', data: Player } | { type: 'empty', id: string })[] = [];

    // Always show at least (courts + 1) groups of 4 slots
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

  // --- Chunked Queue for Collapsed View ---
  const chunkedQueueItems = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < queueDisplayItems.length; i += 4) {
      chunks.push(queueDisplayItems.slice(i, i + 4));
    }
    return chunks;
  }, [queueDisplayItems]);

  // --- Helper Functions ---
  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      // Helper to create utterance to avoid reuse issues
      const createUtterance = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = 1.0; // Speed set back to 1.0
        utterance.pitch = 1.2; // Higher pitch for "happy" tone
        return utterance;
      };

      // Speak twice as requested
      window.speechSynthesis.speak(createUtterance());

      // Add a small pause between repetitions by just queuing the next one
      // The browser queue handles the sequence
      window.speechSynthesis.speak(createUtterance());
    }
  }, []);

  // --- Actions ---

  // Create a new member
  const createMember = useCallback((nameToAdd: string) => {
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
    setMembers(prev => [newMember, ...prev]);
    setNewMemberName('');
    setNewMemberLevel('intermediate'); // Reset to default
  }, [members, newMemberLevel]);

  // Batch Import: Parse CSV and create members
  const parseCsvAndImport = useCallback((csvText: string) => {
    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        alert('CSV 檔案格式錯誤：至少需要標題列和一筆資料');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());

      // Validate headers
      const nameIndex = headers.findIndex(h => h === '姓名' || h === 'name' || h === '名稱');
      if (nameIndex === -1) {
        alert('CSV 格式錯誤：缺少「姓名」欄位');
        return;
      }

      const levelIndex = headers.findIndex(h => h === '等級' || h === '狀態' || h === 'level' || h === '技能');

      // Process each row
      const newMembers: Member[] = [];
      const skippedNames: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = line.split(',').map(v => v.trim());
        const name = values[nameIndex];

        if (!name) continue; // Skip rows with empty names

        // Check if member already exists
        if (members.some(m => m.name === name) || newMembers.some(m => m.name === name)) {
          skippedNames.push(name);
          continue;
        }

        // Parse skill level
        let level: SkillLevel = 'intermediate';
        if (levelIndex !== -1 && values[levelIndex]) {
          const levelValue = values[levelIndex].trim().toLowerCase();
          // Support both English and Chinese skill level names
          if (levelValue === 'intermediate' || levelValue === '一般' || levelValue === '零打' || levelValue === '中階' || levelValue === '中级') {
            level = 'intermediate';
          } else if (levelValue === 'beginner' || levelValue === '初階' || levelValue === '初级' || levelValue === '季打') {
            level = 'beginner';
          }
          // If none match, default to 'intermediate' (already set above)
        }

        newMembers.push({
          id: crypto.randomUUID(),
          name,
          level,
          createdAt: Date.now()
        });
      }

      // Add all new members
      if (newMembers.length > 0) {
        setMembers(prev => [...newMembers, ...prev]);
      }

      // Show result
      let message = `成功匯入 ${newMembers.length} 位會員`;
      if (skippedNames.length > 0) {
        message += `\n跳過 ${skippedNames.length} 位重複會員：${skippedNames.join(', ')}`;
      }
      alert(message);

    } catch (error) {
      alert('CSV 檔案解析失敗，請確認檔案格式正確');
      console.error('CSV parsing error:', error);
    }
  }, [members]);

  // Handle file upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBatchImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      alert('請上傳 CSV 格式的檔案');
      return;
    }

    // Read CSV file
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCsvAndImport(text);
    };
    reader.onerror = () => {
      alert('檔案讀取失敗');
    };
    reader.readAsText(file, 'UTF-8');

    // Reset file input
    if (event.target) {
      event.target.value = '';
    }
  }, [parseCsvAndImport]);

  // Update Member Level
  const updateMemberLevel = useCallback((memberId: string, newLevel: SkillLevel) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, level: newLevel } : m));

    // Optional: Also update the player if they are currently checked in?
    // Strategy: Let's sync them to keep consistency
    const memberName = members.find(m => m.id === memberId)?.name;
    if (memberName) {
      setPlayers(prev => prev.map(p => p.name === memberName ? { ...p, level: newLevel } : p));
    }
  }, [members]);

  // Update Player Level (in Queue/Rest)
  const updatePlayerLevel = useCallback((playerId: string, newLevel: SkillLevel) => {
    // Update player state
    setPlayers(prev => {
      const targetPlayer = prev.find(p => p.id === playerId);
      if (!targetPlayer) return prev;

      // Also sync back to member list for persistence
      setMembers(currMembers =>
        currMembers.map(m => m.name === targetPlayer.name ? { ...m, level: newLevel } : m)
      );

      return prev.map(p => p.id === playerId ? { ...p, level: newLevel } : p);
    });
  }, []);


  // Check In: Add member to session players (Bench)
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
    setPlayers(prev => [...prev, newPlayer]);

    // Show success notification
    setCheckInSuccessName(member.name);
    // Auto-hide after 2 seconds
    setTimeout(() => {
      setCheckInSuccessName(null);
    }, 2000);
    
    return newId;
  }, [players]);

  const removeMember = useCallback((memberId: string) => {
    if (confirm('確定要刪除此會員嗎？（這不會影響目前場上的球員）')) {
      setMembers(prev => prev.filter(m => m.id !== memberId));
    }
  }, []);

  // Move player up in the queue
  const moveQueueItemUp = useCallback((playerId: string) => {
    setQueueSlots(prev => {
      const idx = prev.indexOf(playerId);
      if (idx <= 0) return prev;
      // Find the previous non-null slot
      let prevIdx = idx - 1;
      while (prevIdx >= 0 && prev[prevIdx] === null) prevIdx--;
      if (prevIdx < 0) return prev;
      const newSlots = [...prev];
      [newSlots[prevIdx], newSlots[idx]] = [newSlots[idx], newSlots[prevIdx]];
      return newSlots;
    });
  }, []);

  // Move player down in the queue
  const moveQueueItemDown = useCallback((playerId: string) => {
    setQueueSlots(prev => {
      const idx = prev.indexOf(playerId);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      // Find the next non-null slot
      let nextIdx = idx + 1;
      while (nextIdx < prev.length && prev[nextIdx] === null) nextIdx++;
      if (nextIdx >= prev.length) return prev;
      const newSlots = [...prev];
      [newSlots[idx], newSlots[nextIdx]] = [newSlots[nextIdx], newSlots[idx]];
      return newSlots;
    });
  }, []);


  const joinQueue = useCallback((playerId: string) => {
    setSelectedPlayerForMove(null);
    // Append to end of queueSlots
    setQueueSlots(prev => [...prev, playerId]);
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, status: 'queued', joinedAt: Date.now() } : p
    ));
  }, []);

  const insertIntoQueueAt = useCallback((playerId: string, position: number) => {
    setSelectedPlayerForMove(null);
    setQueueSlots(prev => {
      const newSlots = [...prev];
      // Extend array if needed
      while (newSlots.length <= position) newSlots.push(null);
      // If slot is empty (null), place directly. Otherwise, insert and shift.
      if (newSlots[position] === null) {
        newSlots[position] = playerId;
      } else {
        newSlots.splice(position, 0, playerId);
      }
      return newSlots;
    });
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, status: 'queued', joinedAt: Date.now() } : p
    ));
  }, []);

  // Move an existing queued player to a new slot position
  const moveInQueue = useCallback((playerId: string, toPosition: number) => {
    setSelectedPlayerForMove(null);
    setQueueSlots(prev => {
      const newSlots = [...prev];
      const fromIdx = newSlots.indexOf(playerId);
      if (fromIdx === -1) return prev;
      // Remove from current position (leave null)
      newSlots[fromIdx] = null;
      // Extend if needed
      while (newSlots.length <= toPosition) newSlots.push(null);
      // If target is empty, place directly. Otherwise swap.
      if (newSlots[toPosition] === null) {
        newSlots[toPosition] = playerId;
      } else {
        // Swap: move the target player to the old position
        const targetId = newSlots[toPosition];
        newSlots[toPosition] = playerId;
        newSlots[fromIdx] = targetId;
      }
      // Trim trailing nulls
      while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
      return newSlots;
    });
  }, []);

  const removeFromQueue = useCallback((playerId: string) => {
    if (!confirm('確定要讓此球員回到休息區嗎？')) return;
    setSelectedPlayerForMove(null);
    // Set slot to null (preserve position gaps)
    setQueueSlots(prev => {
      const newSlots = prev.map(id => id === playerId ? null : id);
      // Trim trailing nulls
      while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
      return newSlots;
    });
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, status: 'idle' } : p
    ));
  }, []);

  // Remove from session (Check out) -> "Early Leave"
  const deletePlayer = useCallback((playerId: string) => {
    if (confirm('確定要讓此球員早退嗎？（將回到會員列表）')) {
      setSelectedPlayerForMove(prev => prev === playerId ? null : prev);
      setQueueSlots(prev => {
        const newSlots = prev.map(id => id === playerId ? null : id);
        while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
        return newSlots;
      });
      setPlayers(prev => prev.filter(p => p.id !== playerId));
      setCourts(prev => prev.map(c => ({
        ...c,
        playerIds: c.playerIds.filter(id => id !== playerId)
      })));
    }
  }, []);

  // Move all queued players to idle
  const restAllQueue = useCallback(() => {
    const queuedCount = players.filter(p => p.status === 'queued').length;
    if (queuedCount === 0) return;

    if (confirm(`確定要讓排隊中的 ${queuedCount} 人全部回到休息區嗎？`)) {
      setQueueSlots([]);
      setPlayers(prev => prev.map(p =>
        p.status === 'queued'
          ? { ...p, status: 'idle' }
          : p
      ));
    }
  }, [players]);

  // Clear Bench: Remove all idle players
  const clearBench = useCallback(() => {
    const idleCount = players.filter(p => p.status === 'idle').length;
    if (idleCount === 0) return;

    if (confirm(`確定要讓休息區的 ${idleCount} 人全部離開球場嗎？\n他們將回到會員列表。`)) {
      setPlayers(prev => prev.filter(p => p.status !== 'idle'));
    }
  }, [players]);

  // Reset Session (End of Game Day)
  const resetSession = useCallback(() => {
    if (confirm('確定要結束所有比賽嗎？\n所有場上和排隊的球員將會回到會員列表。')) {
      setSelectedPlayerForMove(null);
      // Move everyone back to member list (remove from players state)
      setPlayers([]);
      setQueueSlots([]);
      setIsWarmupDone(false);

      setCourts(prev => prev.map(c => ({
        ...c,
        playerIds: [],
        startTime: null
      })));
    }
  }, []);

  const addCourt = useCallback(() => {
    setCourts(prev => {
      const nextId = prev.length > 0 ? Math.max(...prev.map(c => c.id)) + 1 : 1;
      const newCourt: Court = {
        id: nextId,
        name: `場地 ${nextId}`,
        playerIds: [],
        startTime: null,
      };
      return [...prev, newCourt];
    });
  }, []);

  const removeCourt = useCallback(() => {
    setCourts(prev => {
      if (prev.length <= 1) {
        alert("至少需要保留一個場地");
        return prev;
      }
      const lastCourt = prev[prev.length - 1];
      if (lastCourt.playerIds.some(id => id !== null)) {
        alert(`無法移除 ${lastCourt.name}：場上還有人`);
        return prev;
      }
      return prev.slice(0, -1);
    });
  }, []);

  const renameCourt = useCallback((courtId: number, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      alert("場地名稱不能為空");
      return;
    }
    setCourts(prev => prev.map(c =>
      c.id === courtId ? { ...c, name: trimmedName } : c
    ));
  }, []);

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
    // Use the consistent match calculation logic
    const playersToStart = getNextMatchBatch(queueSlots, players);

    // Validation: Must have exactly 4 players to start
    if (playersToStart.length < MAX_PLAYERS_PER_COURT) {
      // This case should be covered by UI disabling, but safety check
      alert("人數不足四人，無法開賽。請等待球員補滿空位。");
      return;
    }

    const playerIds = playersToStart.map(p => p.id);
    const playerNames = playersToStart.map(p => p.name);
    const court = courts.find(c => c.id === courtId);

    if (court && isAutoAnnounce) {
      // Use commas for longer pauses between names
      const announcement = `請 ${playerNames.join('，')}，到${court.name}打球`;
      speak(announcement);
    }

    setPlayers(prev => prev.map(p =>
      playerIds.includes(p.id) ? { ...p, status: 'playing' } : p
    ));

    // Remove matched players from queueSlots explicitly by filtering them out.
    // This perfectly advances the trailing players by closing the gaps exactly
    // by the amount of positions (teams) that entered the court.
    setQueueSlots(prev => {
      const newSlots = prev.filter(id => id === null || !playerIds.includes(id));
      while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
      return newSlots;
    });

    setCourts(prev => prev.map(c =>
      c.id === courtId ? { ...c, playerIds, startTime: Date.now() } : c
    ));

  }, [queueSlots, players, courts, speak, isAutoAnnounce, getNextMatchBatch]);

  const endMatch = useCallback((courtId: number) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const finishedPlayerIds = court.playerIds;

    setCourts(prev => prev.map(c =>
      c.id === courtId ? { ...c, playerIds: [], startTime: null } : c
    ));

    setPlayers(prev => prev.map(p =>
      finishedPlayerIds.includes(p.id) ? { ...p, status: 'idle' } : p
    ));
  }, [courts]);

  // Remove a player from their court (used when dragging away)
  const removePlayerFromCourt = useCallback((playerId: string) => {
    setCourts(prev => prev.map(c => {
      if (!c.playerIds.includes(playerId)) return c;
      const newPlayerIds = c.playerIds.map(id => id === playerId ? null : id);
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
      };
    }));
  }, []);

  // Directly put a courst player back to rest without end match
  const restPlayerFromCourt = useCallback((playerId: string) => {
    if (!confirm('確定要讓此球員下場休息嗎？')) return;
    setSelectedPlayerForMove(null);
    removePlayerFromCourt(playerId);
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, status: 'idle' } : p
    ));
  }, [removePlayerFromCourt]);

  // Handle Warmup Toggle with validation
  const handleWarmupToggle = useCallback(() => {
    if (!isWarmupDone) {
      // 熱身中 - 需要檢查場地是否滿場
      if (idleCourtsCount > 0) {
        // 場地未滿
        alert('目前場地尚未滿場，請保持熱身階段🔥');
        return;
      }
      // 場地已滿，詢問是否結束熱身
      if (confirm('確定要結束熱身嗎？')) {
        setIsWarmupDone(true);
      }
    } else {
      // 已熱身 - 直接詢問是否回到熱身，忽略場地滿場判斷
      if (confirm('確定要回到熱身階段嗎？')) {
        setIsWarmupDone(false);
      }
    }
  }, [idleCourtsCount, isWarmupDone]);

  // Drop a player directly onto a court from rest area, queue, or another court
  const dropPlayerToCourt = useCallback((courtId: number, playerId: string) => {
    setSelectedPlayerForMove(null); // Force clear on drop
    const court = courts.find(c => c.id === courtId);
    if (!court || court.playerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT) return;
    if (court.playerIds.includes(playerId)) return;

    // Remove from queue if they were queued
    setQueueSlots(prev => {
      const newSlots = prev.map(id => id === playerId ? null : id);
      while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
      return newSlots;
    });

    // Remove from any other court (drag between courts)
    removePlayerFromCourt(playerId);

    // Set player status to playing
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, status: 'playing' } : p
    ));

    // Add to court — only start match timer when reaching 4 players
    setCourts(prev => prev.map(c => {
      if (c.id !== courtId) return c;
      const newPlayerIds = [...c.playerIds];
      const nextEmptySlot = newPlayerIds.indexOf(null);
      if (nextEmptySlot !== -1) {
        newPlayerIds[nextEmptySlot] = playerId;
      } else {
        newPlayerIds.push(playerId);
      }
      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? (c.startTime || Date.now()) : c.startTime
      };
    }));
  }, [courts, removePlayerFromCourt]);

  // Move a player to a specific slot in a court (supports cross-court moves)
  const movePlayerToCourtSlot = useCallback((playerId: string, courtId: number, slotIdx: number) => {
    setSelectedPlayerForMove(null); // Force clear on move
    // First, remove from queue if they're queued
    setQueueSlots(prev => {
      const newSlots = prev.map(id => id === playerId ? null : id);
      while (newSlots.length > 0 && newSlots[newSlots.length - 1] === null) newSlots.pop();
      return newSlots;
    });

    // Update player status to playing
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, status: 'playing' } : p
    ));

    // Update courts
    setCourts(prev => prev.map(c => {
      // Other courts: remove the player if they're here
      if (c.id !== courtId) {
        const newPlayerIds = c.playerIds.filter(id => id !== playerId);
        if (newPlayerIds.length !== c.playerIds.length) {
          return {
            ...c,
            playerIds: newPlayerIds,
            startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? c.startTime : null
          };
        }
        return c;
      }

      // Target court: place player at exact slotIdx (0-based, within MAX_PLAYERS_PER_COURT)
      // Work with a nullable fixed-length array to preserve positions
      const slots: (string | null)[] = Array.from({ length: MAX_PLAYERS_PER_COURT }, (_, i) => c.playerIds[i] ?? null);

      // Remove player from their current slot (if any)
      const currentSlot = slots.indexOf(playerId);
      if (currentSlot !== -1) slots[currentSlot] = null;

      // Place them at the target slot
      const targetIdx = Math.min(slotIdx, MAX_PLAYERS_PER_COURT - 1);
      // If target slot is already occupied by someone else, swap
      if (slots[targetIdx] !== null && slots[targetIdx] !== playerId) {
        if (currentSlot !== -1) {
          // Swap: put the displaced player where the dragged player came from
          slots[currentSlot] = slots[targetIdx];
        }
      }
      slots[targetIdx] = playerId;

      // Compact: filter out nulls for storage, but preserve relative order? NO! We want to keep nulls as placeholders.
      // But we should trim trailing nulls so array size stays minimal.
      const newPlayerIds = [...slots];
      while (newPlayerIds.length > 0 && newPlayerIds[newPlayerIds.length - 1] === null) newPlayerIds.pop();

      return {
        ...c,
        playerIds: newPlayerIds,
        startTime: newPlayerIds.filter(id => id !== null).length >= MAX_PLAYERS_PER_COURT ? (c.startTime || Date.now()) : null
      };
    }));
  }, []);

  // --- Components ---

  const LevelSelector = ({ level, onChange, disabled = false }: { level: SkillLevel, onChange: (l: SkillLevel) => void, disabled?: boolean }) => {
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent row selection
      if (disabled) return;

      const levels: SkillLevel[] = ['beginner', 'intermediate'];
      const currentIndex = levels.indexOf(level);
      const nextIndex = (currentIndex + 1) % levels.length;
      onChange(levels[nextIndex]);
    };

    return (
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`px-2 py-1 rounded text-[10px] font-bold border transition-all select-none
                ${SKILL_LEVELS[level].bg} ${SKILL_LEVELS[level].color} ${SKILL_LEVELS[level].border}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:brightness-110 shadow-sm'}
            `}
        title="點擊切換程度"
      >
        {SKILL_LEVELS[level].label}
      </button>
    );
  };

  // --- UI Components ---

  if (!currentUser) {
    const loginFilteredMembers = members
      .filter(m => m.name.toLowerCase().includes(loginSearchTerm.toLowerCase().trim()))
      .sort((a, b) => b.createdAt - a.createdAt);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-auto relative overflow-hidden">
          {/* Back button if in player mode */}
          {isLoggingInAsPlayer && (
            <button
              onClick={() => {
                setIsLoggingInAsPlayer(false);
                setLoginSearchTerm('');
              }}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ArrowRight className="w-5 h-5 rotate-180" />
            </button>
          )}

          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg shadow-indigo-500/20">
              <Trophy className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-white mb-2">羽球排隊助手</h1>
          <p className="text-slate-400 text-center text-sm mb-8">
            {isLoggingInAsPlayer ? '請選擇您的名字' : '選擇您的身分進入系統'}
          </p>

          {!isLoggingInAsPlayer ? (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setCurrentUser({ role: 'admin' });
                  setActiveTab('members');
                }}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                <Users className="w-5 h-5" />
                我是團主
              </button>
              <div className="relative py-2">
                <div className="absolute inset-y-0 left-0 w-full flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-slate-900 px-2 text-slate-500">或</span>
                </div>
              </div>
              <button
                onClick={() => setIsLoggingInAsPlayer(true)}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-all border border-slate-700"
              >
                <UserCheck className="w-5 h-5" />
                我是球員
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜尋名字..."
                  className="w-full h-10 pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  value={loginSearchTerm}
                  onChange={e => setLoginSearchTerm(e.target.value)}
                  autoFocus
                />
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              </div>
              <div className="max-h-64 overflow-y-auto scrollbar-gutter-stable space-y-2 pr-1">
                {loginFilteredMembers.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-sm">找不到符合的成員</div>
                ) : (
                  loginFilteredMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => {
                        setCurrentUser({ role: 'player', memberId: member.id });
                        setActiveTab('queue');
                        const playerId = checkInMember(member);
                        if (playerId) {
                          setSelectedPlayerForMove(playerId);
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-slate-950/50 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors text-left group"
                    >
                      <PlayerAvatar identifier={member.name} className="w-8 h-8 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200 group-hover:text-white truncate">{member.name}</div>
                        <div className="text-xs text-slate-500">{SKILL_LEVELS[member.level].label}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const renderRestArea = () => (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 px-4 py-3 lg:px-5">
      <div className="space-y-4 mb-3">
        {/* Header with Search Icon */}
        <div className="flex items-center justify-between min-h-[32px]">
          <h2 className="text-sm font-semibold text-slate-400">
            休息區 ({idlePlayers.length})
          </h2>
          <button
            onClick={() => {
              setIsRestAreaSearchExpanded(!isRestAreaSearchExpanded);
              if (isRestAreaSearchExpanded) {
                setRestAreaSearchTerm('');
              }
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

        {/* Search Input */}
        {isRestAreaSearchExpanded && (
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="搜尋休息區..."
              className="w-full h-10 pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 placeholder-slate-500 text-sm"
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
                          ? 'bg-slate-100/15 border-slate-300/40 hover:bg-slate-100/20 shadow-[0_0_8px_rgba(255,255,255,0.05)] cursor-grab active:cursor-grabbing font-bold'
                          : 'bg-slate-800/60 border-slate-700 hover:bg-slate-700 cursor-grab active:cursor-grabbing')
                      : 'bg-slate-800/40 border-slate-700/50 cursor-default'
                  }`}
              >
                <PlayerAvatar identifier={player.name} className="w-5 h-5 shrink-0" />
                <span className={`text-xs whitespace-nowrap ${isSelf ? 'text-white' : 'text-slate-300'}`}>
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
      {/* Global Header (Normal Mode / Action Mode) */}
      {showGlobalBanner && selectedPlayerForMove ? (() => {
        const p = players.find(p => p.id === selectedPlayerForMove);
        if (!p) return null;
        return (
          <header className="px-4 py-3 bg-indigo-950 border-b border-indigo-900/50 flex items-center justify-between z-20 shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center justify-between w-full flex-1">
              <div className="flex items-center gap-3">
                 <PlayerAvatar identifier={p.name} className="w-9 h-9 shrink-0 rounded-full shadow-sm" />
                 <div className="flex flex-col justify-center">
                    <div className="font-bold text-white text-sm leading-tight">已選取 {p.name}</div>
                    <div className="text-[11px] text-indigo-200/70 leading-tight">請點擊目標空位放置</div>
                 </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                 <button onClick={() => deletePlayer(p.id)} className="bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"><LogOut className="w-4 h-4"/>早退</button>
                 <button onClick={() => setSelectedPlayerForMove(null)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-1.5 rounded-lg transition-colors font-medium">取消</button>
              </div>
            </div>
          </header>
        );
      })() : (
        <header className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
            <div className="flex items-center justify-between w-full flex-1">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white gap-2 flex items-center">羽球排隊助手</h1>
              </div>

              {/* User Profile Dropdown */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors"
                  title="個人選單"
                >
                  <div className="flex items-center justify-center w-5 h-5">
                    {currentUser?.role === 'admin' ? (
                      <span className="text-sm">🏸</span>
                    ) : (
                      <UserCheck className="w-4 h-4 text-indigo-400" />
                    )}
                  </div>
                  <span className="text-sm text-slate-300 font-medium whitespace-nowrap hidden min-[375px]:inline-block">
                    {currentUser?.role === 'admin' ? '團主' : members.find(m => m.id === currentUser?.memberId)?.name || '球員'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {/* Dropdown Menu */}
                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-3 py-2.5 border-b border-slate-800 flex items-baseline gap-2">
                      <p className="text-xs text-slate-400 font-medium shrink-0">
                        {!currentUser ? '未登入' : (currentUser.role === 'admin' 
                          ? '團主' 
                          : (() => {
                              const member = members.find(m => m.id === currentUser.memberId);
                              return member ? SKILL_LEVELS[member.level]?.label || '球員' : '球員';
                            })())}
                      </p>
                      {currentUser && (
                        <p className="text-sm font-bold text-white truncate">
                          {currentUser.role === 'admin' 
                            ? '管理員' 
                            : members.find(m => m.id === currentUser.memberId)?.name || ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setCurrentUser(null);
                        setSelectedPlayerForMove(null);
                        setIsProfileMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-slate-800 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      登出 / 切換身分
                    </button>
                  </div>
                )}
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

          {/* Content Container - Hide on desktop when closed to prevent content reflow issues during transition */}
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
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverSlotKey(null);
                    }
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
                  </div>

                  <div className="space-y-2">
                    {queueDisplayItems.length === 0 ? (
                      <div className="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-sm bg-slate-900/50">
                        目前沒有人在排隊
                        <div className="text-xs mt-1 opacity-70">從下方休息區拖曳球員到此處</div>
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
                                            // Cannot drop on an occupied slot, do nothing.
                                          }}
                                          onClick={() => {
                                            if (!canMovePlayer(item.data.id)) return;
                                            if (selectedPlayerForMove === item.data.id) {
                                              setSelectedPlayerForMove(null);
                                            } else if (selectedPlayerForMove === null) {
                                              setSelectedPlayerForMove(item.data.id);
                                            }
                                            // If another player is selected for move, clicking here does nothing.
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
                                          title={selectedPlayerForMove ? '點擊移動成員到此' : '空位 - 拖曳球員到此處或點擊選擇'}
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
                                              // Only allow moving from court during warmup phase
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
                                              // Only allow moving from court during warmup phase
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
                                          <span className="text-xs opacity-70">{selectedPlayerForMove ? '移動到此' : '空位'}</span>
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
                {/* Sticky header: member list title + search + add/import */}
                <div className="px-6 pt-4 pb-3 sticky top-0 bg-slate-950/95 backdrop-blur z-10 space-y-2">
                  {/* Member List Header with Search Icon */}
                  <div className="flex items-center justify-between min-h-[32px]">
                    <h2 className="text-sm font-semibold text-slate-400">
                      會員列表 ({notCheckedInMembers.length})
                    </h2>
                    <div className="flex items-center gap-1 -mr-1.5">
                      <button
                        onClick={() => {
                          setIsSearchExpanded(!isSearchExpanded);
                          if (isSearchExpanded) {
                            setMemberSearchTerm('');
                          }
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
                            title="會員設定"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {isSettingsOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setIsSettingsOpen(false)}
                              />
                              <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                                <div className="p-2">
                                  {/* Import CSV Button */}
                                  <button
                                    onClick={() => {
                                      fileInputRef.current?.click();
                                      setIsSettingsOpen(false);
                                    }}
                                    className="w-full flex inset-y-0 items-start gap-3 p-2 hover:bg-slate-800 rounded-md transition-colors text-left group"
                                  >
                                    <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-md group-hover:bg-emerald-500 group-hover:text-white transition-colors mt-0.5">
                                      <Upload className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">匯入名單 (.csv)</div>
                                      <div className="text-[10px] text-slate-500 mt-1">
                                        格式：姓名,狀態(季打／零打)
                                      </div>
                                    </div>
                                  </button>

                                  {/* Divider */}
                                  <div className="h-px bg-slate-800 my-1 mx-2" />

                                  {/* Reset List Button */}
                                  <button
                                    onClick={() => {
                                      if (confirm('確定要清空會員列表中「尚未報到」的名單嗎？\n已經報到（在休息區或場上）的球員將不會被刪除。')) {
                                        const activeNames = new Set(players.map(p => p.name));
                                        setMembers(prev => prev.filter(m => activeNames.has(m.name)));
                                      }
                                      setIsSettingsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-slate-800 rounded-md transition-colors text-left group"
                                  >
                                    <div className="p-1.5 bg-red-500/10 text-red-400 rounded-md group-hover:bg-red-500 group-hover:text-white transition-colors">
                                      <Trash2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">名單重置</div>
                                      <div className="text-[10px] text-slate-500 mt-0.5">清空所有會員紀錄</div>
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

                  {/* Search Input - expands when toggled */}
                  {isSearchExpanded && (
                    <div className="flex items-center gap-2 h-10 animate-[fadeIn_0.2s_ease-out] pt-1 mb-8">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="搜尋會員..."
                          className="w-full h-10 pl-9 pr-10 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 placeholder-slate-500 text-sm"
                          value={memberSearchTerm}
                          onChange={e => setMemberSearchTerm(e.target.value)}
                          autoFocus
                        />
                        <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        {memberSearchTerm && (
                          <button
                            onClick={() => setMemberSearchTerm('')}
                            className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
                            title="清除字元"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Add Member Form & Batch Import */}
                  {currentUser?.role === 'admin' && (
                    <div className="flex items-center gap-2 h-10">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="輸入姓名"
                          maxLength={10}
                          className="w-full h-10 pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 placeholder-slate-500 text-sm"
                          value={newMemberName}
                          onChange={e => setNewMemberName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newMemberName) {
                              createMember(newMemberName);
                            }
                          }}
                        />
                        <UserPlus className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      </div>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => createMember(newMemberName)}
                        disabled={!newMemberName}
                        className={`h-10 w-[96px] bg-indigo-600 text-white text-xs font-medium rounded-lg transition-colors shrink-0 flex items-center justify-center
                          ${!newMemberName ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-500'}`}
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

                <div className="flex-1 px-6 py-4 space-y-6 bg-slate-950">
                  {/* Checked In Section - hidden */}

                  {/* Member List Section */}
                  <div>
                    {notCheckedInMembers.length === 0 ? (
                      <div className="text-center py-8 text-slate-600 text-sm animate-[fadeIn_0.2s_ease-out]">
                        {memberSearchTerm ? '找不到符合的會員' : '尚未新增會員'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 animate-[fadeIn_0.2s_ease-out]">
                        {notCheckedInMembers.map(member => (
                          <div key={member.id} className="group flex items-center justify-between py-2 rounded-lg border border-transparent">
                            <div className="flex items-center gap-3 pl-3">
                              <div className="flex items-center gap-2">
                                <PlayerAvatar identifier={member.name} className="w-2.5 h-2.5 shrink-0" />
                                <span className="text-sm text-slate-300">{member.name}</span>
                              </div>
                              <div className="scale-90 origin-left">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold border ${SKILL_LEVELS[member.level].bg} ${SKILL_LEVELS[member.level].color} ${SKILL_LEVELS[member.level].border}`}>
                                  {SKILL_LEVELS[member.level].label}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-1 w-24 shrink-0">
                              {(currentUser?.role === 'admin' || currentUser?.memberId === member.id) && (
                                <button
                                  onClick={() => checkInMember(member)}
                                  className="h-10 flex-1 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-medium transition-all"
                                >
                                  報到
                                </button>
                              )}
                              {currentUser?.role === 'admin' && (
                                <button
                                  onClick={() => removeMember(member.id)}
                                  className="h-10 w-10 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                  title="刪除會員"
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

              {/* Court Status Badge */}
              {idleCourtsCount === 0 ? (
                <span className="flex items-center gap-1.5 text-green-400 hidden sm:flex font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                  滿場
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-red-400 hidden sm:flex font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  空場: {idleCourtsCount}
                </span>
              )}

            </div>
            <div className="flex items-center gap-3 text-sm">
              {/* Court adjustments moved here */}
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

              {/* Global Warmup Status */}
              <button
                onClick={currentUser?.role === 'admin' ? handleWarmupToggle : undefined}
                className={`flex items-center justify-center gap-2 px-3 h-8 text-xs font-medium rounded-lg transition-colors border
                  ${isWarmupDone
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  }
                  ${currentUser?.role !== 'admin' ? 'cursor-not-allowed opacity-80' : ''}
                `}
                title={isWarmupDone ? '已熱身' : '熱身中'}
              >
                {isWarmupDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Flame className="w-3.5 h-3.5" />}
                <span>{isWarmupDone ? '已熱身' : '熱身中'}</span>
              </button>

              {currentUser?.role === 'admin' && (
                <button
                  onClick={resetSession}
                  className="flex items-center justify-center gap-2 px-3 h-8 bg-transparent text-red-400 border border-red-500/50 hover:bg-red-500 hover:text-white hover:border-red-500 text-xs font-medium rounded-lg transition-colors"
                  title="將場上及排隊球員全部移回會員列表"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">打球結束</span>
                </button>
              )}

            </div>
          </div>

          {/* Grid */}
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

      {/* Rest Area Bottom Sheet (Mobile + Desktop) */}
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
      
      {/* Rest Area FAB (Mobile + Desktop) */}
      <button
        onClick={() => setIsRestAreaOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-slate-800 hover:bg-slate-700 text-white shadow-2xl shadow-indigo-500/10 rounded-full py-3.5 px-6 flex items-center gap-2 border border-slate-700 transition-all font-medium animate-[fadeIn_0.3s_ease-out]"
      >
        <Coffee className="w-5 h-5 text-amber-400" />
        休息區 <span className="bg-slate-950 text-amber-400 px-2 py-0.5 rounded-full text-xs shrink-0 font-bold ml-1">{idlePlayers.length}</span>
      </button>

      {/* Check-in Success Modal */}
      {checkInSuccessName && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-slate-900 border-2 border-emerald-500 rounded-xl px-8 py-6 shadow-2xl animate-[fadeIn_0.3s_ease-out] pointer-events-auto">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-white mb-1">報到成功！</div>
                <div className="text-sm text-slate-300">
                  <span className="font-semibold text-emerald-400">{checkInSuccessName}</span> 已成功報到
                </div>
                <div className="text-xs text-slate-500 mt-1">請至排隊區加入等待</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}