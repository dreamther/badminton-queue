
export type PlayerStatus = 'idle' | 'queued' | 'playing';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export const SKILL_LEVELS: Record<SkillLevel, { label: string; color: string; bg: string; border: string }> = {
  beginner: { label: '初階', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  intermediate: { label: '一般', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  advanced: { label: '高階', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
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
