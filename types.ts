
export type PlayerStatus = 'idle' | 'queued' | 'playing';

export type SkillLevel = 'beginner' | 'intermediate';

export const SKILL_LEVELS: Record<SkillLevel, { label: string; color: string; bg: string; border: string }> = {
  beginner: { label: '季打', color: 'text-emerald-400', bg: 'bg-transparent', border: 'border-emerald-500/20' },
  intermediate: { label: '零打', color: 'text-blue-400', bg: 'bg-transparent', border: 'border-blue-500/20' },
};

export interface Player {
  id: string;
  name: string;
  status: PlayerStatus;
  level: SkillLevel; // Added level
  joinedAt: number;
  groupId?: string;
}

export interface Court {
  id: number;
  name: string;
  playerIds: string[];
  startTime: number | null;
}

export interface Member {
  id: string;
  name: string;
  level: SkillLevel; // Added level
  createdAt: number;
}

export const MAX_PLAYERS_PER_COURT = 4;
export const INITIAL_COURT_COUNT = 6;
