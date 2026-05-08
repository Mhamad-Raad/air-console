import { customAlphabet } from 'nanoid';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { RoomRepository } from './room.repository.js';
import type { Player, Room } from './room.types.js';

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

  async addPlayer(code: string, player: Omit<Player, 'joinedAt'>): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');

    const exists = room.players.find((p) => p.id === player.id);
    if (!exists) {
      room.players.push({ ...player, joinedAt: Date.now() });
    }
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

  async get(code: string): Promise<Room> {
    const room = await RoomRepository.get(code);
    if (!room) throw new NotFoundError('Room not found');
    return room;
  },
};
