import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import {
  Room,
  RoomInfo,
  Player,
  RoomSettings,
  DEFAULT_ROOM_SETTINGS,
  GameSong,
  RoundState,
  LyricSlice,
  LyricLine,
  SCORING,
  PlayerScore,
} from './game.types';

@Injectable()
export class RoomService {
  private rooms = new Map<string, Room>();
  private playerRoomMap = new Map<string, string>(); // socketId -> roomId

  getAllRooms(): RoomInfo[] {
    const roomList: RoomInfo[] = [];
    this.rooms.forEach((room) => {
      roomList.push(this.toRoomInfo(room));
    });
    return roomList;
  }

  getPublicRooms(): RoomInfo[] {
    return this.getAllRooms().filter((r) => !r.isPrivate);
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByPlayerId(playerId: string): Room | undefined {
    const roomId = this.playerRoomMap.get(playerId);
    if (roomId) {
      return this.rooms.get(roomId);
    }
    return undefined;
  }

  createRoom(
    hostSocketId: string,
    hostName: string,
    roomName: string,
    isPrivate = false,
    password?: string,
  ): Room {
    const roomId = nanoid(8);

    const host: Player = {
      id: hostSocketId,
      name: hostName,
      score: 0,
      isReady: true,
      isHost: true,
      guessesThisRound: 0,
      correctGuessesTotal: 0,
      totalGuessesTotal: 0,
      songsSubmitted: 0,
      hasGuessedCorrectly: false,
      connected: true,
    };

    const room: Room = {
      id: roomId,
      name: roomName,
      hostId: hostSocketId,
      hostName: hostName,
      players: new Map([[hostSocketId, host]]),
      settings: { ...DEFAULT_ROOM_SETTINGS },
      status: 'waiting',
      currentRound: null,
      roundHistory: [],
      songQueue: [],
      createdAt: new Date(),
      maxPlayers: 8,
      isPrivate,
      password,
    };

    this.rooms.set(roomId, room);
    this.playerRoomMap.set(hostSocketId, roomId);

    return room;
  }

  joinRoom(
    roomId: string,
    playerId: string,
    playerName: string,
    password?: string,
  ): { success: boolean; error?: string; room?: Room } {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.isPrivate && room.password && room.password !== password) {
      return { success: false, error: 'INVALID_PASSWORD' };
    }

    if (room.players.size >= room.maxPlayers) {
      return { success: false, error: 'ROOM_FULL' };
    }

    // 检查用户名是否已存在
    for (const player of room.players.values()) {
      if (player.name === playerName) {
        return { success: false, error: 'NAME_TAKEN' };
      }
    }

    if (room.status !== 'waiting') {
      return { success: false, error: 'GAME_IN_PROGRESS' };
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      score: 0,
      isReady: false,
      isHost: false,
      guessesThisRound: 0,
      correctGuessesTotal: 0,
      totalGuessesTotal: 0,
      songsSubmitted: 0,
      hasGuessedCorrectly: false,
      connected: true,
    };

    room.players.set(playerId, player);
    this.playerRoomMap.set(playerId, roomId);

    return { success: true, room };
  }

  leaveRoom(playerId: string): { room?: Room; wasHost: boolean; dissolved: boolean } {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) {
      return { wasHost: false, dissolved: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRoomMap.delete(playerId);
      return { wasHost: false, dissolved: false };
    }

    const player = room.players.get(playerId);
    const wasHost = player?.isHost || false;

    room.players.delete(playerId);
    this.playerRoomMap.delete(playerId);

    // 如果房间空了，解散房间
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return { room: undefined, wasHost, dissolved: true };
    }

    // 如果房主离开，转移房主
    if (wasHost) {
      const newHost = room.players.values().next().value;
      if (newHost) {
        newHost.isHost = true;
        newHost.isReady = true;
        room.hostId = newHost.id;
        room.hostName = newHost.name;
      }
    }

    return { room, wasHost, dissolved: false };
  }

  updateSettings(roomId: string, playerId: string, settings: Partial<RoomSettings>): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.get(playerId);
    if (!player?.isHost) return false;

    if (room.status !== 'waiting') return false;

    // 验证设置值
    if (settings.lyricsLineCount !== undefined) {
      settings.lyricsLineCount = Math.max(1, Math.min(10, settings.lyricsLineCount));
    }
    if (settings.maxGuessesPerRound !== undefined) {
      settings.maxGuessesPerRound = Math.max(1, Math.min(10, settings.maxGuessesPerRound));
    }
    if (settings.roundDuration !== undefined) {
      settings.roundDuration = Math.max(30, Math.min(180, settings.roundDuration));
    }

    room.settings = { ...room.settings, ...settings };
    return true;
  }

  setPlayerReady(playerId: string, isReady: boolean): { room?: Room; player?: Player } {
    const room = this.getRoomByPlayerId(playerId);
    if (!room) return {};

    const player = room.players.get(playerId);
    if (!player) return {};

    // 房主始终准备
    if (!player.isHost) {
      player.isReady = isReady;
    }

    return { room, player };
  }

  canStartGame(room: Room): { canStart: boolean; reason?: string } {
    if (room.status !== 'waiting') {
      return { canStart: false, reason: 'GAME_ALREADY_STARTED' };
    }

    if (room.players.size < 2) {
      return { canStart: false, reason: 'NOT_ENOUGH_PLAYERS' };
    }

    for (const player of room.players.values()) {
      if (!player.isReady) {
        return { canStart: false, reason: 'PLAYERS_NOT_READY' };
      }
    }

    return { canStart: true };
  }

  startGame(roomId: string, playerId: string): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };

    const player = room.players.get(playerId);
    if (!player?.isHost) return { success: false, error: 'NOT_HOST' };

    const { canStart, reason } = this.canStartGame(room);
    if (!canStart) return { success: false, error: reason };

    room.status = 'playing';
    room.roundHistory = [];
    room.songQueue = [];

    // 重置所有玩家状态
    for (const p of room.players.values()) {
      p.score = 0;
      p.correctGuessesTotal = 0;
      p.totalGuessesTotal = 0;
      p.hasGuessedCorrectly = false;
      p.guessesThisRound = 0;
      p.submittedSong = undefined;
    }

    return { success: true };
  }

  submitSong(playerId: string, song: GameSong): { success: boolean; error?: string; room?: Room } {
    const room = this.getRoomByPlayerId(playerId);
    if (!room) return { success: false, error: 'NOT_IN_ROOM' };

    if (room.status !== 'playing') return { success: false, error: 'GAME_NOT_STARTED' };

    const player = room.players.get(playerId);
    if (!player) return { success: false, error: 'PLAYER_NOT_FOUND' };

    song.submittedBy = player.name;
    player.submittedSong = song;
    player.songsSubmitted++;

    room.songQueue.push(song);

    return { success: true, room };
  }

  getPlayersWithoutSong(room: Room): string[] {
    const playersNeeded: string[] = [];
    for (const player of room.players.values()) {
      if (!player.submittedSong) {
        playersNeeded.push(player.name);
      }
    }
    return playersNeeded;
  }

  canStartRound(room: Room): boolean {
    // 检查是否有歌曲可用
    return room.songQueue.length > 0;
  }

  // 解析LRC歌词
  parseLyrics(lrcContent: string): LyricLine[] {
    // Handle null, undefined, or non-string input
    if (!lrcContent || typeof lrcContent !== 'string') {
      console.warn('[Room] Invalid lyrics content:', typeof lrcContent);
      return [];
    }

    const lines: LyricLine[] = [];
    const lrcLines = lrcContent.split('\n');

    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

    for (const line of lrcLines) {
      const matches = [...line.matchAll(timeRegex)];
      if (matches.length === 0) continue;

      const textPart = line.replace(timeRegex, '').trim();
      if (!textPart) continue;

      for (const match of matches) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const ms = parseInt(match[3].padEnd(3, '0'), 10);
        const time = minutes * 60 * 1000 + seconds * 1000 + ms;

        lines.push({ time, text: textPart });
      }
    }

    // 按时间排序
    lines.sort((a, b) => a.time - b.time);

    // 计算每行的结束时间
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].endTime = lines[i + 1].time;
    }
    if (lines.length > 0) {
      lines[lines.length - 1].endTime = lines[lines.length - 1].time + 5000;
    }

    return lines;
  }

  // 切片歌词
  sliceLyrics(lyrics: LyricLine[], lineCount: number): LyricSlice | null {
    if (lyrics.length < lineCount) {
      return null;
    }

    // 随机选择起始位置（避免选到开头和结尾）
    const minStart = Math.min(2, Math.floor(lyrics.length * 0.1));
    const maxStart = Math.max(minStart, lyrics.length - lineCount - 2);
    const startIndex = Math.floor(Math.random() * (maxStart - minStart + 1)) + minStart;

    const sliceLines = lyrics.slice(startIndex, startIndex + lineCount);

    return {
      startTime: sliceLines[0].time,
      endTime: sliceLines[sliceLines.length - 1].endTime || sliceLines[sliceLines.length - 1].time + 5000,
      lines: sliceLines,
    };
  }

  startRound(room: Room): RoundState | null {
    if (room.songQueue.length === 0) return null;

    const song = room.songQueue.shift()!;
    const lyrics = this.parseLyrics(song.lyrics as unknown as string);
    const lyricSlice = this.sliceLyrics(lyrics, room.settings.lyricsLineCount);

    if (!lyricSlice) return null;

    // 转换歌词格式
    song.lyrics = lyrics;

    const round: RoundState = {
      roundNumber: room.roundHistory.length + 1,
      song,
      lyricSlice,
      startTime: Date.now(),
      guesses: [],
      correctGuessers: [],
      isActive: true,
      submitterName: song.submittedBy,
    };

    room.currentRound = round;
    room.status = 'playing';

    // 重置玩家本轮状态
    for (const player of room.players.values()) {
      player.guessesThisRound = 0;
      player.hasGuessedCorrectly = false;
    }

    return round;
  }

  processGuess(
    playerId: string,
    guess: string,
  ): {
    success: boolean;
    correct?: boolean;
    error?: string;
    room?: Room;
    player?: Player;
    roundEnded?: boolean;
    remainingGuesses?: number;
  } {
    const room = this.getRoomByPlayerId(playerId);
    if (!room) return { success: false, error: 'NOT_IN_ROOM' };

    if (room.status !== 'playing' || !room.currentRound?.isActive) {
      return { success: false, error: 'NO_ACTIVE_ROUND' };
    }

    const player = room.players.get(playerId);
    if (!player) return { success: false, error: 'PLAYER_NOT_FOUND' };

    if (player.hasGuessedCorrectly) {
      return { success: false, error: 'ALREADY_GUESSED_CORRECTLY' };
    }

    if (player.guessesThisRound >= room.settings.maxGuessesPerRound) {
      return { success: false, error: 'NO_MORE_GUESSES' };
    }

    const round = room.currentRound;
    const song = round.song!;

    player.guessesThisRound++;
    player.totalGuessesTotal++;

    const normalizedGuess = this.normalizeString(guess);
    const normalizedTitle = this.normalizeString(song.title);
    const normalizedArtist = this.normalizeString(song.artist);

    // 判断是否猜对（匹配歌曲名或歌手名+歌曲名）
    const correct =
      normalizedGuess === normalizedTitle ||
      normalizedGuess.includes(normalizedTitle) ||
      (normalizedGuess.includes(normalizedArtist) && normalizedGuess.includes(normalizedTitle));

    const guessResult = {
      correct,
      playerName: player.name,
      guessText: guess,
      timestamp: Date.now(),
      guessNumber: player.guessesThisRound,
    };

    round.guesses.push(guessResult);

    if (correct) {
      player.hasGuessedCorrectly = true;
      player.correctGuessesTotal++;
      round.correctGuessers.push(player.name);

      // 计算得分
      const isFirst = round.correctGuessers.length === 1;
      const isSelfGuess = player.name === round.submitterName;

      if (isSelfGuess) {
        player.score += SCORING.SUBMITTER_SELF_GUESS;
      } else {
        player.score += SCORING.CORRECT_GUESS_BASE;
        if (isFirst) {
          player.score += SCORING.CORRECT_GUESS_SPEED_BONUS;
        }
      }
    }

    const remainingGuesses = room.settings.maxGuessesPerRound - player.guessesThisRound;

    // 检查是否结束回合
    let roundEnded = false;
    if (room.settings.endOnFirstCorrect && correct) {
      roundEnded = true;
    } else if (this.allPlayersFinished(room)) {
      roundEnded = true;
    }

    return { success: true, correct, room, player, roundEnded, remainingGuesses };
  }

  private allPlayersFinished(room: Room): boolean {
    for (const player of room.players.values()) {
      if (
        !player.hasGuessedCorrectly &&
        player.guessesThisRound < room.settings.maxGuessesPerRound &&
        player.name !== room.currentRound?.submitterName
      ) {
        return false;
      }
    }
    return true;
  }

  endRound(room: Room): { scores: PlayerScore[]; song: GameSong } {
    const round = room.currentRound!;
    round.isActive = false;
    round.endTime = Date.now();

    // 计算出题者得分
    const submitter = this.findPlayerByName(room, round.submitterName);
    if (submitter) {
      const correctCount = round.correctGuessers.filter((n) => n !== round.submitterName).length;
      const totalPlayers = room.players.size - 1; // 不包括出题者自己

      if (correctCount === 0) {
        // 没人猜对
        submitter.score += SCORING.SUBMITTER_NONE_CORRECT;
      } else if (correctCount === totalPlayers) {
        // 所有人都猜对
        submitter.score += SCORING.SUBMITTER_ALL_CORRECT;
      } else {
        // 部分人猜对
        submitter.score += correctCount * SCORING.SUBMITTER_PER_CORRECT;
      }
    }

    room.roundHistory.push(round);
    room.currentRound = null;
    room.status = 'round_end';

    const scores = this.getScores(room);

    return { scores, song: round.song! };
  }

  endGame(room: Room): { finalScores: PlayerScore[]; winner: string } {
    room.status = 'game_end';
    room.currentRound = null;

    const finalScores = this.getScores(room);
    const winner = finalScores[0]?.name || '';

    if (finalScores.length > 0) {
      finalScores[0].isWinner = true;
    }

    return { finalScores, winner };
  }

  resetToWaiting(room: Room): void {
    room.status = 'waiting';
    room.currentRound = null;
    room.roundHistory = [];
    room.songQueue = [];

    for (const player of room.players.values()) {
      player.isReady = player.isHost;
      player.score = 0;
      player.submittedSong = undefined;
      player.hasGuessedCorrectly = false;
      player.guessesThisRound = 0;
    }
  }

  private findPlayerByName(room: Room, name: string): Player | undefined {
    for (const player of room.players.values()) {
      if (player.name === name) {
        return player;
      }
    }
    return undefined;
  }

  getScores(room: Room): PlayerScore[] {
    const scores: PlayerScore[] = [];
    for (const player of room.players.values()) {
      scores.push({
        name: player.name,
        score: player.score,
        correctGuesses: player.correctGuessesTotal,
        totalGuesses: player.totalGuessesTotal,
      });
    }
    return scores.sort((a, b) => b.score - a.score);
  }

  kickPlayer(roomId: string, hostId: string, targetName: string): { success: boolean; targetId?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false };

    const host = room.players.get(hostId);
    if (!host?.isHost) return { success: false };

    let targetId: string | undefined;
    for (const [id, player] of room.players.entries()) {
      if (player.name === targetName && !player.isHost) {
        targetId = id;
        break;
      }
    }

    if (!targetId) return { success: false };

    room.players.delete(targetId);
    this.playerRoomMap.delete(targetId);

    return { success: true, targetId };
  }

  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[\s\-_\.。，,！!？?]/g, '')
      .replace(/[（(][^）)]*[）)]/g, ''); // 移除括号内容
  }

  toRoomInfo(room: Room): RoomInfo {
    return {
      id: room.id,
      name: room.name,
      hostName: room.hostName,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      status: room.status,
      isPrivate: room.isPrivate,
    };
  }

  getPlayerInfo(room: Room): Array<{
    id: string;
    name: string;
    score: number;
    isReady: boolean;
    isHost: boolean;
    connected: boolean;
    hasSubmittedSong: boolean;
  }> {
    const players: Array<{
      id: string;
      name: string;
      score: number;
      isReady: boolean;
      isHost: boolean;
      connected: boolean;
      hasSubmittedSong: boolean;
    }> = [];
    for (const player of room.players.values()) {
      players.push({
        id: player.id,
        name: player.name,
        score: player.score,
        isReady: player.isReady,
        isHost: player.isHost,
        connected: player.connected,
        hasSubmittedSong: !!player.submittedSong,
      });
    }
    return players;
  }

  // 获取所有活跃房间的详细信息（用于管理面板）
  getAllRoomsDetailed(): Room[] {
    return Array.from(this.rooms.values());
  }

  // 强制解散房间（管理员功能）
  dissolveRoom(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const playerIds: string[] = [];
    for (const playerId of room.players.keys()) {
      playerIds.push(playerId);
      this.playerRoomMap.delete(playerId);
    }

    this.rooms.delete(roomId);
    return playerIds;
  }

  handleDisconnect(playerId: string): { room?: Room; wasHost: boolean; dissolved: boolean } {
    return this.leaveRoom(playerId);
  }
}
