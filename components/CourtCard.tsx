import React, { useEffect, useState } from 'react';
import { Court, Player, MAX_PLAYERS_PER_COURT } from '../types';
import { PlayerAvatar } from './PlayerAvatar';
import { Clock, Play, LogOut, Users, Zap, Coffee, Edit2, Check, X } from 'lucide-react';

interface CourtCardProps {
    court: Court;
    playersOnCourt: Player[];
    queueLength: number;
    onStartMatch: (courtId: number) => void;
    onEndMatch: (courtId: number) => void;
    onRenameCourt?: (courtId: number, newName: string) => void;
    canStartMatch?: boolean; // New prop
}

export const CourtCard: React.FC<CourtCardProps> = ({
    court,
    playersOnCourt,
    queueLength,
    onStartMatch,
    onEndMatch,
    onRenameCourt,
    canStartMatch = true
}) => {
    const [elapsed, setElapsed] = useState<string>('00:00');
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(court.name);

    const isActive = playersOnCourt.length > 0;

    // Logic: Can start if queue has valid match group and court is empty
    const canStart = !isActive && queueLength > 0 && canStartMatch;

    // Logic for Match Type Labels
    const advancedCount = playersOnCourt.filter(p => p?.level === 'advanced').length;
    const beginnerCount = playersOnCourt.filter(p => p?.level === 'beginner').length;

    let matchTag = null;
    if (isActive) {
        if (advancedCount >= 3) {
            matchTag = (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold animate-pulse">
                    <Zap className="w-3 h-3 fill-current" />
                    激鬥場
                </div>
            );
        } else if (beginnerCount >= 3) {
            matchTag = (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                    <Coffee className="w-3 h-3" />
                    休閒場
                </div>
            );
        }
    }

    const handleSaveRename = () => {
        if (onRenameCourt && editName.trim()) {
            onRenameCourt(court.id, editName);
            setIsEditing(false);
        }
    };

    const handleCancelRename = () => {
        setEditName(court.name);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveRename();
        } else if (e.key === 'Escape') {
            handleCancelRename();
        }
    };

    useEffect(() => {
        let interval: number;
        if (isActive && court.startTime) {
            interval = window.setInterval(() => {
                const now = Date.now();
                const diff = Math.floor((now - court.startTime!) / 1000);
                const m = Math.floor(diff / 60).toString().padStart(2, '0');
                const s = (diff % 60).toString().padStart(2, '0');
                setElapsed(`${m}:${s}`);
            }, 1000);
        } else {
            setElapsed('00:00');
        }
        return () => clearInterval(interval);
    }, [isActive, court.startTime]);

    return (
        <div className={`relative flex flex-col rounded-xl border transition-all duration-300 shadow-lg overflow-hidden
      ${isActive
                ? 'bg-slate-800 border-indigo-500/50 shadow-indigo-500/10'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }
    `}>
            {/* Header */}
            <div className={`px-4 py-3 flex items-center justify-between border-b ${isActive ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-700'}`}>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
                        {isEditing ? (
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-sm font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 w-32"
                                    autoFocus
                                />
                                <button
                                    onClick={handleSaveRename}
                                    className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 transition-colors"
                                    title="儲存"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={handleCancelRename}
                                    className="p-1 hover:bg-red-500/20 rounded text-red-400 transition-colors"
                                    title="取消"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 group">
                                <h3 className="font-semibold text-slate-200">{court.name}</h3>
                                {onRenameCourt && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-indigo-400 transition-all"
                                        title="重新命名"
                                    >
                                        <Edit2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    {matchTag}
                </div>
                {isActive && (
                    <div className="flex items-center gap-1.5 text-xs font-mono text-indigo-300 bg-indigo-950/50 px-2 py-1 rounded">
                        <Clock className="w-3 h-3" />
                        {elapsed}
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 p-4 flex flex-col gap-4">

                {/* Players Grid */}
                <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: MAX_PLAYERS_PER_COURT }).map((_, idx) => {
                        const player = playersOnCourt[idx];
                        return (
                            <div
                                key={`slot-${idx}`}
                                className={`h-10 flex items-center gap-2 px-2 rounded-lg border text-sm
                            ${player
                                        ? 'bg-slate-700/50 border-slate-600 text-slate-200'
                                        : 'bg-slate-800/30 border-slate-700/50 border-dashed text-slate-500'
                                    }`}
                            >
                                {player ? (
                                    <>
                                        <PlayerAvatar name={player.name} size="sm" />
                                        <span className="truncate font-medium">{player.name}</span>
                                    </>
                                ) : (
                                    <span className="text-xs w-full text-center opacity-50">空位</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="mt-auto">
                    {isActive ? (
                        <button
                            onClick={() => onEndMatch(court.id)}
                            className="w-full py-2.5 flex items-center justify-center gap-2 rounded-lg font-medium text-sm
                             bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            結束比賽 (下場)
                        </button>
                    ) : (
                        <button
                            onClick={() => onStartMatch(court.id)}
                            disabled={!canStart}
                            className={`w-full py-2.5 flex items-center justify-center gap-2 rounded-lg font-medium text-sm transition-all
                        ${canStart
                                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                                    : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
                                }`}
                        >
                            <Play className="w-4 h-4 fill-current" />
                            {queueLength === 0
                                ? '空場'
                                : !canStartMatch
                                    ? '空場'
                                    : '打球囉'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};