import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Users, Activity, Coffee, ArrowRight, RotateCcw, Trash2, Trophy, Plus, Minus, Volume2, VolumeX, X, Swords, UserCheck, Search, CheckCircle2, ChevronDown, ChevronRight, Unlink, ArrowUp, PanelLeft, LogOut, UserX, ChevronUp, Zap, UserPlus, Upload, Settings, MoreVertical } from 'lucide-react';
import { Player, Court, Member, INITIAL_COURT_COUNT, MAX_PLAYERS_PER_COURT, SkillLevel, SKILL_LEVELS } from './types';
import { CourtCard } from './components/CourtCard';
import { PlayerAvatar } from './components/PlayerAvatar';

type Tab = 'queue' | 'members';
// test3

// Helper to generate consistent colors for groups
const getGroupColor = (groupId: string) => {
  const colors = [
    'bg-indigo-500', 'bg-pink-500', 'bg-emerald-500',
    'bg-orange-500', 'bg-cyan-500', 'bg-violet-500',
    'bg-yellow-500', 'bg-rose-500', 'bg-sky-500'
  ];
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // New: Sidebar toggle state
  const [currentTime, setCurrentTime] = useState(new Date()); // New: Clock state
  const [isAutoAnnounce, setIsAutoAnnounce] = useState(true); // New: Auto announce toggle

  // Grouping & Selection State
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [isCheckedInExpanded, setIsCheckedInExpanded] = useState(false);
  const [isMemberListExpanded, setIsMemberListExpanded] = useState(true);

  // Member UI Collapse State
  const [isSearchExpanded, setIsSearchExpanded] = useState(true);
  const [isAddMemberExpanded, setIsAddMemberExpanded] = useState(false);
  const [isBatchImportExpanded, setIsBatchImportExpanded] = useState(false);

  // Check-in Success Notification
  const [checkInSuccessName, setCheckInSuccessName] = useState<string | null>(null);

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

  // Drag and drop state removed

  // --- Persistence ---
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

  // --- Derived Lists ---
  const queue = useMemo(() => {
    const queued = players.filter(p => p.status === 'queued');

    // Sort by joinedAt first
    const sorted = [...queued].sort((a, b) => a.joinedAt - b.joinedAt);

    // Build items with join time tracking
    interface QueueItem {
      type: 'group' | 'individual';
      players: Player[];
      joinTime: number;
    }

    const items: QueueItem[] = [];
    const processedIds = new Set<string>();
    const processedGroupIds = new Set<string>();

    for (const p of sorted) {
      if (processedIds.has(p.id)) continue;

      if (p.groupId) {
        if (processedGroupIds.has(p.groupId)) continue;

        const groupMembers = sorted.filter(m => m.groupId === p.groupId);
        items.push({
          type: 'group',
          players: groupMembers,
          joinTime: Math.min(...groupMembers.map(m => m.joinedAt))
        });
        groupMembers.forEach(m => processedIds.add(m.id));
        processedGroupIds.add(p.groupId);
      } else {
        items.push({
          type: 'individual',
          players: [p],
          joinTime: p.joinedAt
        });
        processedIds.add(p.id);
      }
    }

    // Sort by join time
    items.sort((a, b) => a.joinTime - b.joinTime);

    // Find the cutoff: last group's join time
    const lastGroupIndex = items.map((item, idx) => item.type === 'group' ? idx : -1).filter(idx => idx >= 0).pop();
    const cutoffTime = lastGroupIndex !== undefined ? items[lastGroupIndex].joinTime : Infinity;

    // Separate: early items (before/including last group) and late individuals
    const earlyItems: QueueItem[] = [];
    const lateIndividuals: QueueItem[] = [];

    for (const item of items) {
      if (item.joinTime <= cutoffTime) {
        earlyItems.push(item);
      } else if (item.type === 'individual') {
        lateIndividuals.push(item);
      }
    }

    // Build result: process early items and track group boundaries
    const result: Player[] = [];
    const groupBoundaries: number[] = []; // Positions where groups end (multiples of 4)
    let currentPos = 0;

    for (const item of earlyItems) {
      if (item.type === 'group') {
        // Check if group fits in current 4-slot
        const currentSlot = Math.floor(currentPos / 4);
        const slotStart = currentSlot * 4;
        const slotRemaining = 4 - (currentPos - slotStart);

        if (slotRemaining < item.players.length && currentPos % 4 !== 0) {
          // Group doesn't fit, mark boundary and start new slot
          groupBoundaries.push(slotStart + 4);
          currentPos = slotStart + 4;
        }

        result.push(...item.players);
        currentPos += item.players.length;
      } else {
        result.push(...item.players);
        currentPos++;
      }
    }

    // Fill gaps with late individuals
    const finalResult: Player[] = [];
    let lateIndex = 0;

    for (let i = 0; i < result.length; i += 4) {
      const groupSlice = result.slice(i, Math.min(i + 4, result.length));
      finalResult.push(...groupSlice);

      let slotsNeeded = 4 - groupSlice.length;
      while (slotsNeeded > 0 && lateIndex < lateIndividuals.length) {
        finalResult.push(...lateIndividuals[lateIndex].players);
        lateIndex++;
        slotsNeeded--;
      }
    }

    // Add remaining late individuals
    while (lateIndex < lateIndividuals.length) {
      finalResult.push(...lateIndividuals[lateIndex].players);
      lateIndex++;
    }

    return finalResult;
  }, [players]);
  const idlePlayers = useMemo(() => players.filter(p => p.status === 'idle').sort((a, b) => b.joinedAt - a.joinedAt), [players]);

  // Filtered idle players based on search term
  const filteredIdlePlayers = useMemo(() => {
    if (!restAreaSearchTerm) return idlePlayers;
    return idlePlayers.filter(p => p.name.toLowerCase().includes(restAreaSearchTerm.toLowerCase()));
  }, [idlePlayers, restAreaSearchTerm]);
  const totalActivePlayers = useMemo(() => players.filter(p => p.status === 'playing').length, [players]);
  const idleCourtsCount = useMemo(() => courts.filter(c => c.playerIds.length === 0).length, [courts]);

  // --- Match Calculation Logic ---
  // Calculate the next batch of players (Greedy Fit)
  const getNextMatchBatch = useCallback((currentQueue: Player[]) => {
    const batch: Player[] = [];
    const processedGroups = new Set<string>();

    for (const p of currentQueue) {
      // Stop if we have enough players
      if (batch.length >= MAX_PLAYERS_PER_COURT) break;

      if (p.groupId) {
        // If we already processed this group (either added or skipped), ignore subsequent members in the loop
        if (processedGroups.has(p.groupId)) continue;

        // Find all members of this group
        const groupMembers = currentQueue.filter(m => m.groupId === p.groupId);

        // Check if the WHOLE group fits into the remaining slots
        if (batch.length + groupMembers.length <= MAX_PLAYERS_PER_COURT) {
          batch.push(...groupMembers);
        }
        // If they don't fit, we skip them. They wait for a court where they can fit entirely.

        // Mark group as processed
        processedGroups.add(p.groupId);
      } else {
        // Individuals always fit 1 slot (if available)
        batch.push(p);
      }
    }
    return batch;
  }, []);

  // Next Match Group Calculation (Who is on deck?)
  const nextMatchPlayers = useMemo(() => {
    return getNextMatchBatch(queue);
  }, [queue, getNextMatchBatch]);

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

  // --- Queue Display Logic (Match-Based Grouping) ---
  // Group players by who will actually play together in matches
  const queueDisplayItems = useMemo(() => {
    const displayResult: ({ type: 'player', data: Player } | { type: 'empty', groupId: string })[] = [];

    // Process queue in chunks of 4 (match groups)
    let remainingQueue = [...queue];
    let groupIndex = 0;

    while (remainingQueue.length > 0) {
      // Get next batch using the same logic as match start
      const nextBatch = getNextMatchBatch(remainingQueue);

      if (nextBatch.length === 0) break; // Safety check

      // Add this batch as a visual group
      nextBatch.forEach(p => {
        displayResult.push({ type: 'player', data: p });
      });

      // Fill remaining slots with empty placeholders
      const slotsToFill = 4 - nextBatch.length;
      for (let i = 0; i < slotsToFill; i++) {
        displayResult.push({ type: 'empty', groupId: `filler-${groupIndex}-${i}` });
      }

      // Remove processed players from remaining queue
      const processedIds = new Set(nextBatch.map(p => p.id));
      remainingQueue = remainingQueue.filter(p => !processedIds.has(p.id));

      groupIndex++;
    }

    return displayResult;
  }, [queue, getNextMatchBatch]);

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
    if (players.some(p => p.name === member.name)) return;

    const newPlayer: Player = {
      id: crypto.randomUUID(),
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
  }, [players]);

  const removeMember = useCallback((memberId: string) => {
    if (confirm('確定要刪除此會員嗎？（這不會影響目前場上的球員）')) {
      setMembers(prev => prev.filter(m => m.id !== memberId));
    }
  }, []);

  // Move queue item (player or group) up in the queue
  const moveQueueItemUp = useCallback((playerId: string) => {
    const queuedPlayers = players.filter(p => p.status === 'queued').sort((a, b) => a.joinedAt - b.joinedAt);
    const playerIndex = queuedPlayers.findIndex(p => p.id === playerId);

    if (playerIndex <= 0) return; // Already at top or not found

    const player = queuedPlayers[playerIndex];
    const groupId = player.groupId;

    // Get all players in this item (individual or group)
    const itemPlayers = groupId
      ? queuedPlayers.filter(p => p.groupId === groupId)
      : [player];

    // Find the first player in this item
    const firstItemIndex = queuedPlayers.findIndex(p => itemPlayers.includes(p));

    if (firstItemIndex <= 0) return; // Already at top

    // Find the previous item (player or group)
    let prevItemIndex = firstItemIndex - 1;
    const prevPlayer = queuedPlayers[prevItemIndex];
    const prevGroupId = prevPlayer.groupId;

    const prevItemPlayers = prevGroupId
      ? queuedPlayers.filter(p => p.groupId === prevGroupId)
      : [prevPlayer];

    // Find the first player in the previous item
    const prevFirstIndex = queuedPlayers.findIndex(p => prevItemPlayers.includes(p));

    // Calculate new timestamps
    const prevItemFirstTime = queuedPlayers[prevFirstIndex].joinedAt;
    const itemFirstTime = queuedPlayers[firstItemIndex].joinedAt;

    // Swap timestamps between the two items
    setPlayers(prev => prev.map(p => {
      if (itemPlayers.find(ip => ip.id === p.id)) {
        // Move current item to previous item's position
        const offset = itemPlayers.indexOf(itemPlayers.find(ip => ip.id === p.id)!);
        return { ...p, joinedAt: prevItemFirstTime + offset };
      }
      if (prevItemPlayers.find(pp => pp.id === p.id)) {
        // Move previous item to current item's position
        const offset = prevItemPlayers.indexOf(prevItemPlayers.find(pp => pp.id === p.id)!);
        return { ...p, joinedAt: itemFirstTime + offset };
      }
      return p;
    }));
  }, [players]);

  // Move queue item (player or group) down in the queue
  const moveQueueItemDown = useCallback((playerId: string) => {
    const queuedPlayers = players.filter(p => p.status === 'queued').sort((a, b) => a.joinedAt - b.joinedAt);
    const playerIndex = queuedPlayers.findIndex(p => p.id === playerId);

    if (playerIndex === -1) return; // Not found

    const player = queuedPlayers[playerIndex];
    const groupId = player.groupId;

    // Get all players in this item (individual or group)
    const itemPlayers = groupId
      ? queuedPlayers.filter(p => p.groupId === groupId)
      : [player];

    // Find the last player in this item
    const lastItemIndex = queuedPlayers.findIndex(p => p === itemPlayers[itemPlayers.length - 1]);

    if (lastItemIndex >= queuedPlayers.length - 1) return; // Already at bottom

    // Find the next item (player or group)
    let nextItemIndex = lastItemIndex + 1;
    const nextPlayer = queuedPlayers[nextItemIndex];
    const nextGroupId = nextPlayer.groupId;

    const nextItemPlayers = nextGroupId
      ? queuedPlayers.filter(p => p.groupId === nextGroupId)
      : [nextPlayer];

    // Find the first player in the current item
    const firstItemIndex = queuedPlayers.findIndex(p => itemPlayers.includes(p));

    // Calculate new timestamps
    const itemFirstTime = queuedPlayers[firstItemIndex].joinedAt;
    const nextItemFirstTime = queuedPlayers[nextItemIndex].joinedAt;

    // Swap timestamps between the two items
    setPlayers(prev => prev.map(p => {
      if (itemPlayers.find(ip => ip.id === p.id)) {
        // Move current item to next item's position
        const offset = itemPlayers.indexOf(itemPlayers.find(ip => ip.id === p.id)!);
        return { ...p, joinedAt: nextItemFirstTime + offset };
      }
      if (nextItemPlayers.find(np => np.id === p.id)) {
        // Move next item to current item's position
        const offset = nextItemPlayers.indexOf(nextItemPlayers.find(np => np.id === p.id)!);
        return { ...p, joinedAt: itemFirstTime + offset };
      }
      return p;
    }));
  }, [players]);
  // Drag and drop handlers removed
  // Toggle Selection for Batch Actions
  const togglePlayerSelection = useCallback((playerId: string) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        if (next.size >= MAX_PLAYERS_PER_COURT) {
          alert(`最多只能選擇 ${MAX_PLAYERS_PER_COURT} 人組成搭檔`);
          return prev;
        }
        next.add(playerId);
      }
      return next;
    });
  }, []);

  // Batch Join Queue with Fill Logic
  const batchJoinQueue = useCallback(() => {
    if (selectedPlayerIds.size === 0) return;

    setPlayers(prev => {
      const now = Date.now();
      // Always create a new group if > 1 selected, otherwise undefined
      const newGroupId = selectedPlayerIds.size > 1 ? crypto.randomUUID() : undefined;

      return prev.map(p => {
        if (selectedPlayerIds.has(p.id)) {
          return {
            ...p,
            status: 'queued',
            groupId: newGroupId,
            joinedAt: now,
          };
        }
        return p;
      });
    });

    setSelectedPlayerIds(new Set()); // Clear selection
  }, [selectedPlayerIds]);

  const joinQueue = useCallback((playerId: string) => {
    setPlayers(prev => {
      return prev.map(p =>
        p.id === playerId ? {
          ...p,
          status: 'queued',
          groupId: undefined, // Always individual, no fill
          joinedAt: Date.now()
        } : p
      );
    });
  }, []);

  const unbindPlayer = useCallback((playerId: string) => {
    setPlayers(prev => prev.map(p =>
      // When unbinding, reduce joinedAt slightly to make them appear BEFORE (above) the group they left
      p.id === playerId ? { ...p, groupId: undefined, joinedAt: p.joinedAt - 1 } : p
    ));
  }, []);

  const removeFromQueue = useCallback((playerId: string) => {
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, status: 'idle', groupId: undefined } : p
    ));
  }, []);

  // Remove from session (Check out) -> "Early Leave"
  const deletePlayer = useCallback((playerId: string) => {
    if (confirm('確定要讓此球員早退嗎？（將回到會員列表）')) {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
      setCourts(prev => prev.map(c => ({
        ...c,
        playerIds: c.playerIds.filter(id => id !== playerId)
      })));
      setSelectedPlayerIds(prev => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
    }
  }, []);

  // Move all queued players to idle
  const restAllQueue = useCallback(() => {
    const queuedCount = players.filter(p => p.status === 'queued').length;
    if (queuedCount === 0) return;

    if (confirm(`確定要讓排隊中的 ${queuedCount} 人全部回到休息區嗎？`)) {
      setPlayers(prev => prev.map(p =>
        p.status === 'queued'
          ? { ...p, status: 'idle', groupId: undefined }
          : p
      ));
      setSelectedPlayerIds(new Set());
    }
  }, [players]);

  // Clear Bench: Remove all idle players
  const clearBench = useCallback(() => {
    const idleCount = players.filter(p => p.status === 'idle').length;
    if (idleCount === 0) return;

    if (confirm(`確定要讓休息區的 ${idleCount} 人全部離開球場嗎？\n他們將回到會員列表。`)) {
      setPlayers(prev => prev.filter(p => p.status !== 'idle'));
      // Also clear selections just in case
      setSelectedPlayerIds(new Set());
    }
  }, [players]);

  // Reset Session (End of Game Day)
  const resetSession = useCallback(() => {
    if (confirm('確定要結束所有比賽嗎？\n所有場上和排隊的球員將會回到會員列表。')) {
      // Move everyone back to member list (remove from players state)
      setPlayers([]);

      setCourts(prev => prev.map(c => ({
        ...c,
        playerIds: [],
        startTime: null
      })));
      setSelectedPlayerIds(new Set());
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
      if (lastCourt.playerIds.length > 0) {
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
    if (!court || court.playerIds.length === 0) return;

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
    const playersToStart = getNextMatchBatch(queue);

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

    setCourts(prev => prev.map(c =>
      c.id === courtId ? { ...c, playerIds, startTime: Date.now() } : c
    ));

  }, [queue, courts, speak, isAutoAnnounce, getNextMatchBatch]);

  const endMatch = useCallback((courtId: number) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const finishedPlayerIds = court.playerIds;

    setCourts(prev => prev.map(c =>
      c.id === courtId ? { ...c, playerIds: [], startTime: null } : c
    ));

    setPlayers(prev => prev.map(p =>
      finishedPlayerIds.includes(p.id) ? { ...p, status: 'idle', groupId: undefined } : p
    ));
  }, [courts]);

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

  return (
    // Layout: Side-by-side on desktop, Absolute Sidebar on Mobile.
    // Root is fixed height to allow scrolling within Main content.
    <div className="flex h-full bg-slate-900 text-slate-100 overflow-hidden relative">

      {/* Mobile Backdrop for Sidebar */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {/* Mobile: Fixed/Absolute with translate transform for slide effect */}
      {/* Desktop: Relative flow, permanently visible */}
      <aside
        className={`
          fixed md:relative inset-y-0 left-0 z-40
          bg-slate-950 border-r border-slate-800 flex flex-col shrink-0 shadow-2xl md:shadow-none
          transition-transform duration-300 ease-in-out w-80 md:w-[28rem] xl:w-[32rem]
          ${isSidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full md:translate-x-0'
          }
        `}
      >

        {/* App Header */}
        <div className="px-6 pt-6 pb-4 bg-slate-950">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">羽球排隊助手</h1>
          </div>

          {/* Stats Summary */}
          <div className="flex gap-4 text-xs text-slate-400 mt-3">
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> 今日打球人數: {players.length}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 px-2">
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
        </div>

        {/* Content Container - Hide on desktop when closed to prevent content reflow issues during transition */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Tab Content: Queue Management */}
          {activeTab === 'queue' && (
            <div className="flex-1 overflow-y-auto flex flex-col min-h-0 animate-[fadeIn_0.2s_ease-out]">
              {/* Waiting Queue */}
              <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-400">
                    等待上場 ({queue.length})
                  </h2>
                </div>

                <div className="space-y-2">
                  {queueDisplayItems.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-sm bg-slate-900/50">
                      目前沒有人在排隊
                      <div className="text-xs mt-1 opacity-70">請從下方休息區加入</div>
                    </div>
                  ) : (
                    chunkedQueueItems.map((chunk, chunkIdx) => {
                      const firstItem = chunk[0];
                      const groupId = (firstItem.type === 'player' && firstItem.data.groupId) || (firstItem.type === 'empty' ? firstItem.groupId : undefined);
                      const groupColor = groupId ? getGroupColor(groupId) : 'bg-indigo-500';
                      const isGrouped = !!groupId;

                      return (
                        <React.Fragment key={chunkIdx}>
                          <div className="relative flex items-center py-2 animate-[fadeIn_0.3s_ease-out]">
                            <div className="flex-1 flex items-center gap-3">
                              <span className="font-mono text-xs text-slate-500 w-4 text-center shrink-0">{chunkIdx + 1}</span>
                              <div className="flex items-center gap-3 flex-wrap">
                                {(() => {
                                  const subGroups: { isGrouped: boolean; items: typeof chunk; groupId?: string }[] = [];
                                  let currentSubGroup: { isGrouped: boolean; items: typeof chunk; groupId?: string } | null = null;

                                  chunk.forEach(item => {
                                    const itemGroupId = item.type === 'player' ? item.data.groupId : item.groupId;
                                    const isGrouped = item.type === 'player' && !!itemGroupId;

                                    if (!currentSubGroup) {
                                      currentSubGroup = { isGrouped, items: [item], groupId: itemGroupId };
                                    } else if (currentSubGroup.groupId === itemGroupId && isGrouped === currentSubGroup.isGrouped && isGrouped) {
                                      // Only group together if they share the same valid groupId AND both are considered grouped (meaning both are players)
                                      currentSubGroup.items.push(item);
                                    } else if (!currentSubGroup.isGrouped && !isGrouped) {
                                      // If both are NOT grouped, we can safely put them in the same container because it has no background
                                      currentSubGroup.items.push(item);
                                    } else {
                                      subGroups.push(currentSubGroup);
                                      currentSubGroup = { isGrouped, items: [item], groupId: itemGroupId };
                                    }
                                  });
                                  if (currentSubGroup) subGroups.push(currentSubGroup);

                                  return subGroups.map((subGroup, subIdx) => (
                                    <div key={subIdx} className={`flex items-center gap-1 ${subGroup.isGrouped ? 'p-1 rounded-xl border border-[#554EE6]' : ''}`}>
                                      {subGroup.items.map((item, idx) => (
                                        <React.Fragment key={idx}>
                                          {item.type === 'player' ? (
                                            <div className="relative group/player">
                                              <button
                                                onClick={() => removeFromQueue(item.data.id)}
                                                title="讓球員休息 (移出佇列)"
                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-700 transition-colors text-left ${subGroup.isGrouped ? 'hover:bg-slate-700/80' : ''}`}
                                              >
                                                <span className={`text-sm font-medium text-slate-300 group-hover/player:text-amber-400 transition-colors truncate max-w-[120px] lg:max-w-[160px]`}>
                                                  {item.data.name}
                                                </span>
                                                <Coffee className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover/player:opacity-100 group-hover/player:text-amber-500 transition-all" />
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-600 opacity-40 text-slate-400" title="空位">
                                              <span className="text-sm font-medium">空位</span>
                                            </div>
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  ));
                                })()}
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

              {/* Divider */}
              <div className="h-px bg-slate-800 mx-6 my-2"></div>

              {/* Bench / Idle Section */}
              <div className="px-6 py-4 flex-1 flex flex-col">
                <div className="space-y-4 mb-3">
                  {/* Header with Search Icon */}
                  <div className="flex items-center justify-between">
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

                {/* Batch Action Bar - Moved to Top */}
                <div className="pl-7">
                  {selectedPlayerIds.size > 0 && (
                    <div className="mb-3 pt-1">
                      <button
                        onClick={batchJoinQueue}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-sm shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 transition-all animate-[slideUp_0.2s_ease-out]"
                      >
                        <ArrowUp className="w-4 h-4" />
                        {selectedPlayerIds.size === 1 ? '加入排隊' : `將 ${selectedPlayerIds.size} 人組成搭檔上場`}
                      </button>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-2">
                    {filteredIdlePlayers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">
                        <p>{restAreaSearchTerm ? '沒有符合的球員' : '休息區空空如也'}</p>
                        {!restAreaSearchTerm && <p className="mt-1">請至「報到區」進行報到</p>}
                      </div>
                    ) : (
                      filteredIdlePlayers.map(player => {
                        const isSelected = selectedPlayerIds.has(player.id);
                        return (
                          <div
                            key={player.id}
                            className={`flex items-center justify-between py-2 px-2 rounded-lg border transition-all group
                                                ${isSelected
                                ? 'bg-indigo-900/20 border-indigo-500/30'
                                : 'bg-transparent border-transparent hover:bg-slate-800/50 hover:border-slate-800'}
                                            `}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {selectedPlayerIds.size > 0 && (
                                <div className="flex items-center h-5 shrink-0 transition-opacity">
                                  {(isSelected || selectedPlayerIds.size < MAX_PLAYERS_PER_COURT) ? (
                                    <label className="relative flex items-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => togglePlayerSelection(player.id)}
                                        className="sr-only peer"
                                      />
                                      <div className="w-4 h-4 rounded-md border border-slate-600 hover:border-indigo-500 bg-transparent peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all flex items-center justify-center">
                                        {isSelected && (
                                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </div>
                                    </label>
                                  ) : (
                                    <div className="w-4 h-4" />
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onClick={() => togglePlayerSelection(player.id)}>
                                <div className="flex flex-col min-w-0">
                                  <span className={`text-sm transition-colors truncate ${isSelected ? 'text-indigo-200 font-bold' : 'text-slate-300'}`}>
                                    {player.name}
                                  </span>
                                </div>
                                <div className="scale-90 origin-left shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <LevelSelector
                                    level={player.level}
                                    onChange={(l) => updatePlayerLevel(player.id, l)}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-1 pl-2">
                              {!selectedPlayerIds.size && (
                                <button
                                  onClick={() => deletePlayer(player.id)}
                                  className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                  title="早退 (回到會員列表)"
                                >
                                  <LogOut className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Member List */}
          {activeTab === 'members' && (
            <div className="flex-1 overflow-y-auto flex flex-col min-h-0 animate-[fadeIn_0.2s_ease-out] bg-slate-950">
              {/* Sticky header: member list title + search + add/import */}
              <div className="px-6 pt-5 pb-3 sticky top-0 bg-slate-950/95 backdrop-blur z-10 space-y-2">
                {/* Member List Header with Search Icon */}
                <div className="flex items-center justify-between">
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
                  </div>
                </div>

                {/* Search Input - expands when toggled */}
                {isSearchExpanded && (
                  <div className="flex items-center gap-2 h-10 animate-[fadeIn_0.2s_ease-out]">
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
                <div className="flex items-center gap-2 h-10">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="輸入姓名"
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
                          <div className="flex items-center gap-3 pl-9">
                            <span className="text-sm text-slate-300">{member.name}</span>
                            <div className="scale-90 origin-left">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold border ${SKILL_LEVELS[member.level].bg} ${SKILL_LEVELS[member.level].color} ${SKILL_LEVELS[member.level].border}`}>
                                {SKILL_LEVELS[member.level].label}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-1 w-24 shrink-0">
                            <button
                              onClick={() => checkInMember(member)}
                              className="h-10 flex-1 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-medium transition-all"
                            >
                              報到
                            </button>
                            <button
                              onClick={() => removeMember(member.id)}
                              className="h-10 w-10 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                              title="刪除會員"
                            >
                              <X className="w-4 h-4" />
                            </button>
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

      </aside >

      {/* Main Content: Courts Grid */}
      < main className="flex-1 flex flex-col min-w-0 h-full relative z-0" >
        {/* Toolbar */}
        < div className="h-16 border-b border-slate-800 flex items-center px-4 sm:px-8 justify-between bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10 shrink-0" >
          <div className="flex items-center gap-4">
            {/* Sidebar Toggle Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`md:hidden p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ${isSidebarOpen ? 'bg-slate-800/50 text-white' : ''}`}
              title={isSidebarOpen ? "收納側邊欄" : "展開側邊欄"}
            >
              <PanelLeft className="w-5 h-5" />
            </button>

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
            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 h-8">
              <button
                onClick={removeCourt}
                className="w-8 h-full flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-red-400 rounded-l-lg transition-colors"
                title="減少場地"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-700/50"></div>
              <span className="px-2 text-xs font-mono text-slate-400 flex items-center justify-center min-w-[3rem]">
                {courts.length} 面
              </span>
              <div className="w-px h-4 bg-slate-700/50"></div>
              <button
                onClick={addCourt}
                className="w-8 h-full flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-r-lg transition-colors"
                title="新增場地"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={resetSession}
              className="flex items-center justify-center gap-2 px-3 h-8 bg-transparent text-red-400 border border-red-500/50 hover:bg-red-500 hover:text-white hover:border-red-500 text-xs font-medium rounded-lg transition-colors"
              title="將場上及排隊球員全部移回會員列表"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">打球結束</span>
            </button>

          </div>
        </div >

        {/* Grid */}
        < div className="p-4 sm:p-8 overflow-y-auto flex-1" >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-10">
            {courts.map(court => (
              <CourtCard
                key={court.id}
                court={court}
                playersOnCourt={court.playerIds.map(id => players.find(p => p.id === id)!)}
                queueLength={queue.length}
                onStartMatch={startMatch}
                onEndMatch={endMatch}
                onRenameCourt={renameCourt}
                onAnnounce={announceCourtPlayers}
                isAutoAnnounce={isAutoAnnounce}
                canStartMatch={isQueueReady}
              />
            ))}
          </div>
        </div >
      </main >

      {/* Check-in Success Modal */}
      {
        checkInSuccessName && (
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
        )
      }
    </div >
  );
}