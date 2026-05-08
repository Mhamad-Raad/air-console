import { customAlphabet } from 'nanoid';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { GameService } from '../games/game.service.js';
import { RoomRepository } from './room.repository.js';
import type { Player, PlayerPatch, Room } from './room.types.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const generateCode = customAlphabet(ROOM_CODE_ALPHABET, 4);

export const RoomService = {
  async create(input: { gameSlug: string; hostSocketId: string }): Promise<Room> {
    let code = generateCode();
    let attempts = 0;
    while (await RoomRepository.exists(code)) {
      code = generateCode();
      if (++attempts > 10) throw new ConflictError('Could not allocate a room code');
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
    player: Omit<Player, 'joinedAt' | 'isReady' | 'locale'> & {
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
      if (!trimmed || trimmed.length > 24) throw new ValidationError('Invalid name');
      player.name = trimmed;
    }
    if (patch.team !== undefined) player.team = patch.team;
    if (patch.isReady !== undefined) player.isReady = patch.isReady;
    if (patch.locale !== undefined) player.locale = patch.locale;

    room.updatedAt = Date.now();
    await RoomRepository.save(room);
    return room;
  },

  async removePlayer(code: string, playerId: string): Promise<Room | null> {
    const room = await RoomRepository.get(code);
    if (!room) return null;
    room.players = room.players.filter((p) => p.id !== playerId);
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

  async get(code: string): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');
    return room;
  },
};
