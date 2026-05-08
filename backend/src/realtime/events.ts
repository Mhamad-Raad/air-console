// WebSocket event names — single source of truth shared by server and clients.
// Naming: <namespace>:<action> for emits, <namespace>:<state> for broadcasts.

export const ClientEvents = {
  HostClaim: 'host:claim',
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  RoomKick: 'room:kick',
  PlayerUpdate: 'player:update',
  TeamUpdate: 'team:update',
  GameStart: 'game:start',
  GameAction: 'game:action',
} as const;

export const ServerEvents = {
  RoomState: 'room:state',
  RoomError: 'room:error',
  PlayerJoined: 'player:joined',
  PlayerLeft: 'player:left',
  PlayerKicked: 'player:kicked',
  GameState: 'game:state',
  GameEnded: 'game:ended',
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

export interface PlayerUpdatePayload {
  name?: string;
  avatar?: string;
}

export interface GameActionPayload {
  type: string;
  data: unknown;
}
