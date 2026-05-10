// WebSocket event names — single source of truth shared by server and clients.
// Naming: <namespace>:<action> for emits, <namespace>:<state> for broadcasts.

export const ClientEvents = {
  HostClaim: 'host:claim',
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  RoomKick: 'room:kick',
  RoomClose: 'room:close',
  PlayerUpdate: 'player:update',
  PlayerSet: 'player:set', // host changes another player (e.g. team assignment)
  GameStart: 'game:start',
  GameEnd: 'game:end',
  GameAction: 'game:action',
} as const;

export const ServerEvents = {
  RoomState: 'room:state',
  RoomError: 'room:error',
  PlayerJoined: 'player:joined',
  PlayerLeft: 'player:left',
  PlayerKicked: 'player:kicked',
  RoomClosed: 'room:closed',
  /** Per-player projection of the current game state. Sent on start + after each action. */
  GameState: 'game:state',
  /** Match finished — payload carries the result and the host transitions UI. */
  GameEnded: 'game:ended',
  /** Action rejected by the engine; sent only to the offending player. */
  GameActionError: 'game:actionError',
} as const;

export type ClientEvent = (typeof ClientEvents)[keyof typeof ClientEvents];
export type ServerEvent = (typeof ServerEvents)[keyof typeof ServerEvents];

export interface HostClaimPayload {
  code: string;
}

export interface JoinRoomPayload {
  code: string;
  name: string;
  playerId?: string;
}

export interface KickPayload {
  playerId: string;
}

export type Team = 'A' | 'B';
export type Locale = 'en' | 'ar' | 'ckb';

export interface PlayerUpdatePayload {
  name?: string;
  team?: Team | null;
  isReady?: boolean;
  locale?: Locale;
}

export interface PlayerSetPayload {
  playerId: string;
  patch: PlayerUpdatePayload;
}

export interface GameStartPayload {
  // intentionally empty for now — host's socket.data.code identifies the room
}

export interface GameActionPayload {
  type: string;
  data: unknown;
}
