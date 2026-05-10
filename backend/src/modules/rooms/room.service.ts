import { customAlphabet } from 'nanoid';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { GameService } from '../games/game.service.js';
import { ROOM, PLAYER } from '../../config/constants.js';
import { RoomRepository } from './room.repository.js';
import type { Player, PlayerPatch, Room } from './room.types.js';

const generateCode = customAlphabet(ROOM.CODE_ALPHABET, ROOM.CODE_LENGTH);

export const RoomService = {
  async create(input: { gameSlug: string; hostSocketId: string }): Promise<Room> {
    let code = generateCode();
    let attempts = 0;
    while (await RoomRepository.exists(code)) {
      code = generateCode();
      if (++attempts > ROOM.CODE_COLLISION_RETRIES) {
        throw new ConflictError('Could not allocate a room code');
      }
    }

    const now = Date.now();
    const room: Room = {
      code,
      gameSlug: input.gameSlug,
      hostSocketId: input.hostSocketId,
      phase: 'lobby',
      players: [],
      createdAt: now,
      updatedAt: now,
    };
    await RoomRepository.save(room);
    return room;
  },

  async setHost(code: string, hostSocketId: string): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');
    room.hostSocketId = hostSocketId;
    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  async addPlayer(
    code: string,
    player: Pick<Player, 'id' | 'name'> & {
      socketId?: string;
      team?: Player['team'];
      isReady?: boolean;
      locale?: Player['locale'];
    },
  ): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');

    const exists = room.players.find((p) => p.id === player.id);
    if (exists) {
      // Re-joining: keep existing flags so reconnect doesn't reset state.
      exists.socketId = player.socketId;
      exists.name = player.name;
      delete exists.disconnectedAt;
    } else {
      room.players.push({
        team: null,
        isReady: false,
        locale: 'en',
        ...player,
        joinedAt: Date.now(),
      });
    }
    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  async updatePlayer(code: string, playerId: string, patch: PlayerPatch): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');

    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new NotFoundError('Player not in room');

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed.length < PLAYER.NAME_MIN_LENGTH || trimmed.length > PLAYER.NAME_MAX_LENGTH) {
        throw new ValidationError('Invalid name');
      }
      player.name = trimmed;
    }
    if (patch.team !== undefined) player.team = patch.team;
    if (patch.isReady !== undefined) player.isReady = patch.isReady;
    if (patch.locale !== undefined) player.locale = patch.locale;

    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  /**
   * Mark a player as disconnected without removing their seat. The sweeper
   * removes them once `disconnectedAt` is older than the grace period.
   * Reconnect via addPlayer with the same playerId clears the flag.
   */
  async markDisconnected(code: string, playerId: string): Promise<Room | null> {
    const room = await RoomRepository.get(code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.disconnectedAt = Date.now();
    // Stale socketId — until they reconnect we can't reach them.
    delete player.socketId;
    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  async removePlayer(code: string, playerId: string): Promise<Room | null> {
    const room = await RoomRepository.get(code);
    if (!room) return null;
    room.players = room.players.filter((p) => p.id !== playerId);
    // If the last player drops while a game is running, revert to lobby so the
    // host isn't stuck on the in-game view.
    if (room.players.length === 0 && room.phase === 'in_game') {
      room.phase = 'lobby';
    }
    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  async startGame(code: string): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');
    if (room.phase !== 'lobby') throw new ValidationError('Game already started');

    const game = GameService.get(room.gameSlug);
    if (room.players.length < game.minPlayers) {
      throw new ValidationError(`Need at least ${game.minPlayers} players`);
    }
    if (game.requireReady && room.players.some((p) => !p.isReady)) {
      throw new ValidationError('All players must be ready');
    }

    room.phase = 'in_game';
    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  async endGame(code: string): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');
    room.phase = 'lobby';
    // Players need to re-confirm before the next game.
    for (const p of room.players) p.isReady = false;
    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  async get(code: string): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');
    return room;
  },

  async deleteRoom(code: string): Promise<void> {
    await RoomRepository.delete(code);
  },
};
