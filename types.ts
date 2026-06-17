export type PlayerStatus = 'idle' | 'queued' | 'playing';

export type MemberIdentity = 'beginner' | 'intermediate';

export const IDENTITIES: Record<MemberIdentity, { label: string; color: string; bg: string; border: string }> = {
  beginner: { label: '社員', color: 'text-emerald-400', bg: 'bg-transparent', border: 'border-emerald-500/20' },
  intermediate: { label: '零打', color: 'text-blue-400', bg: 'bg-transparent', border: 'border-blue-500/20' },
};

export interface Player {
  id: string;
  name: string;
  status: PlayerStatus;
  identity: MemberIdentity; // Renamed from level
  level?: MemberIdentity; // Keep level for backward compatibility
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
  level?: MemberIdentity; // Keep level for backward compatibility
  createdAt: number;
}

export const MAX_PLAYERS_PER_COURT = 4;
export const INITIAL_COURT_COUNT = 6;
