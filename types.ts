export type PlayerStatus = 'idle' | 'queued' | 'playing';

export type MemberIdentity = 'admin' | 'beginner' | 'intermediate';

export const IDENTITIES: Record<MemberIdentity, { label: string; color: string; bg: string; dotBg: string; iconColor: string }> = {
  admin: { label: '管理員', color: 'text-rose-400', bg: 'bg-rose-500/10', dotBg: 'bg-rose-400', iconColor: 'text-rose-400' },
  beginner: { label: '社員', color: 'text-blue-400', bg: 'bg-blue-500/10', dotBg: 'bg-blue-400', iconColor: 'text-blue-400' },
  intermediate: { label: '零打', color: 'text-violet-400', bg: 'bg-violet-500/10', dotBg: 'bg-violet-400', iconColor: 'text-violet-400' },
};

export interface Player {
  id: string;
  name: string;
  status: PlayerStatus;
  identity: MemberIdentity; // Renamed from level
  joinedAt: number;
}

export type UserRole = 'admin' | 'player';

export interface CurrentUser {
  role: UserRole;
  memberId?: string;
}

export interface Court {
  id: number;
  name: string;
  playerIds: (string | null)[];
  startTime: number | null;
}

export interface Member {
  id: string;
  name: string;
  identity: MemberIdentity; // Renamed from level
  createdAt: number;
}

export const MAX_PLAYERS_PER_COURT = 4;
export const INITIAL_COURT_COUNT = 6;
