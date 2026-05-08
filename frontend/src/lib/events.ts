// Mirror of backend/src/realtime/events.ts. Keep in sync until we extract a
// shared package. Renames here that don't match the backend will fail at runtime,
// but at least we get one central place to grep for event usage.

export const ClientEvents = {
  HostClaim: 'host:claim',
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  RoomKick: 'room:kick',
  RoomClose: 'room:close',
  PlayerUpdate: 'player:update',
  PlayerSet: 'player:set',
  GameStart: 'game:start',
  GameEnd: 'game:end',
  GameAction: 'game:action',
} as const;

export const ServerEvents = {
  RoomState: 'room:state',
  RoomError: 'room:error',
  RoomClosed: 'room:closed',
  PlayerJoined: 'player:joined',
  PlayerLeft: 'player:left',
  PlayerKicked: 'player:kicked',
  GameState: 'game:state',
  GameEnded: 'game:ended',
} as const;

export type ClientEvent = (typeof ClientEvents)[keyof typeof ClientEvents];
export type ServerEvent = (typeof ServerEvents)[keyof typeof ServerEvents];
