import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import {
  Room,
  RoomInfo,
  Player,
  RoomSettings,
  DEFAULT_ROOM_SETTINGS,
  GameSong,
  GuessFeedback,
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
    forcedRoomId?: string,
  ): Room {
    const roomId = forcedRoomId || nanoid(8);
    if (this.rooms.has(roomId)) {
      throw new Error('ROOM_ID_ALREADY_EXISTS');
    }

    const host: Player = {
      id: hostSocketId,
      name: hostName,
      score: 0,
      isReady: true,
      isHost: true,
      isSpectator: false,
      audioReadyThisRound: false,
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
  ): {
    success: boolean;
    error?: string;
    room?: Room;
    mode?: 'player' | 'spectator' | 'reconnect';
    replacedPlayerId?: string;
  } {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.isPrivate && room.password && room.password !== password) {
      return { success: false, error: 'INVALID_PASSWORD' };
    }

    const connectedCount = Array.from(room.players.values()).filter(
      (p) => p.connected,
    ).length;
    if (connectedCount >= room.maxPlayers) {
      return { success: false, error: 'ROOM_FULL' };
    }

    // 允许断线重连：同名且 disconnected -> 复用玩家状态并替换 socketId
    for (const [existingId, existing] of room.players.entries()) {
      if (existing.name !== playerName) continue;
      if (!existing.connected) {
        room.players.delete(existingId);
        existing.id = playerId;
        existing.connected = true;
        room.players.set(playerId, existing);

        this.playerRoomMap.delete(existingId);
        this.playerRoomMap.set(playerId, roomId);

        if (existing.isHost) {
          room.hostId = playerId;
        }

        return {
          success: true,
          room,
          mode: 'reconnect',
          replacedPlayerId: existingId,
        };
      }
      return { success: false, error: 'NAME_TAKEN' };
    }

    const isSpectator = room.status !== 'waiting';
    const player: Player = {
      id: playerId,
      name: playerName,
      score: 0,
      isReady: false,
      isHost: false,
      isSpectator,
      audioReadyThisRound: false,
      guessesThisRound: 0,
      correctGuessesTotal: 0,
      totalGuessesTotal: 0,
      songsSubmitted: 0,
      hasGuessedCorrectly: false,
      connected: true,
    };

    room.players.set(playerId, player);
    this.playerRoomMap.set(playerId, roomId);

    return { success: true, room, mode: isSpectator ? 'spectator' : 'player' };
  }

  leaveRoom(playerId: string): {
    room?: Room;
    wasHost: boolean;
    dissolved: boolean;
  } {
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
      const iter = room.players.values().next();
      const newHost = iter.done ? undefined : iter.value;
      if (newHost) {
        newHost.isHost = true;
        newHost.isReady = true;
        room.hostId = newHost.id;
        room.hostName = newHost.name;
      }
    }

    return { room, wasHost, dissolved: false };
  }

  updateSettings(
    roomId: string,
    playerId: string,
    settings: Partial<RoomSettings>,
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.get(playerId);
    if (!player?.isHost) return false;

    if (room.status !== 'waiting') return false;

    // 验证设置值
    if (settings.lyricsLineCount !== undefined) {
      settings.lyricsLineCount = Math.max(
        1,
        Math.min(10, settings.lyricsLineCount),
      );
    }
    if (settings.maxGuessesPerRound !== undefined) {
      settings.maxGuessesPerRound = Math.max(
        1,
        Math.min(10, settings.maxGuessesPerRound),
      );
    }
    if (settings.roundDuration !== undefined) {
      settings.roundDuration = Math.max(
        30,
        Math.min(180, settings.roundDuration),
      );
    }

    room.settings = { ...room.settings, ...settings };
    return true;
  }

  setPlayerReady(
    playerId: string,
    isReady: boolean,
  ): { room?: Room; player?: Player } {
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

  startGame(
    roomId: string,
    playerId: string,
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };

    const player = room.players.get(playerId);
    if (!player?.isHost) return { success: false, error: 'NOT_HOST' };

    const { canStart, reason } = this.canStartGame(room);
    if (!canStart) return { success: false, error: reason };

    room.status = 'waiting_submitter';
    room.roundHistory = [];
    room.songQueue = [];
    room.pendingSubmitterName = undefined;

    // 重置所有玩家状态
    for (const p of room.players.values()) {
      p.score = 0;
      p.correctGuessesTotal = 0;
      p.totalGuessesTotal = 0;
      p.hasGuessedCorrectly = false;
      p.guessesThisRound = 0;
      p.submittedSong = undefined;
      p.audioReadyThisRound = false;
    }

    return { success: true };
  }

  chooseSubmitter(
    roomId: string,
    hostId: string,
    submitterName: string,
  ): { success: boolean; error?: string; room?: Room } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };

    const host = room.players.get(hostId);
    if (!host?.isHost) return { success: false, error: 'NOT_HOST' };

    if (room.status !== 'waiting_submitter' && room.status !== 'round_end') {
      return { success: false, error: 'INVALID_STATE' };
    }

    const submitter = this.findPlayerByName(room, submitterName);
    if (!submitter) return { success: false, error: 'PLAYER_NOT_FOUND' };
    if (!submitter.connected)
      return { success: false, error: 'PLAYER_NOT_CONNECTED' };

    room.pendingSubmitterName = submitter.name;
    room.status = 'waiting_song';

    // 仅用于 UI 标记“已提交”旧逻辑；新主玩法每轮只需出题人提交
    for (const p of room.players.values()) {
      p.submittedSong = undefined;
    }

    return { success: true, room };
  }

  submitSong(
    playerId: string,
    song: GameSong,
  ): { success: boolean; error?: string; room?: Room } {
    const room = this.getRoomByPlayerId(playerId);
    if (!room) return { success: false, error: 'NOT_IN_ROOM' };

    // 新主玩法：等待出题人提交歌曲
    if (room.status !== 'waiting_song')
      return { success: false, error: 'NOT_WAITING_SONG' };

    const player = room.players.get(playerId);
    if (!player) return { success: false, error: 'PLAYER_NOT_FOUND' };

    if (player.isSpectator) {
      return { success: false, error: 'SPECTATOR_CANNOT_GUESS' };
    }

    if (
      !room.pendingSubmitterName ||
      room.pendingSubmitterName !== player.name
    ) {
      return { success: false, error: 'NOT_SUBMITTER' };
    }

    song.submittedBy = player.name;
    player.submittedSong = song;
    player.songsSubmitted++;

    // 不再使用 songQueue 驱动回合；由房主选出题人 -> 出题人提交 -> 立即开局

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
    const startIndex =
      Math.floor(Math.random() * (maxStart - minStart + 1)) + minStart;

    const sliceLines = lyrics.slice(startIndex, startIndex + lineCount);

    // 经验性 buffer：避免播放器 pause/seek 的延迟导致“多播放到下一句”
    const END_BUFFER_MS = 250;
    const rawEnd =
      sliceLines[sliceLines.length - 1].endTime ||
      sliceLines[sliceLines.length - 1].time + 5000;
    const endTime = Math.max(sliceLines[0].time, rawEnd - END_BUFFER_MS);

    return {
      startTime: sliceLines[0].time,
      endTime,
      lines: sliceLines,
    };
  }

  startRound(room: Room, song?: GameSong): RoundState | null {
    const chosenSong = song ?? room.songQueue.shift();
    if (!chosenSong) return null;

    const rawLyrics: unknown = (chosenSong as unknown as { lyrics?: unknown })
      .lyrics;
    const lyrics: LyricLine[] = Array.isArray(rawLyrics)
      ? (rawLyrics as LyricLine[])
      : this.parseLyrics(typeof rawLyrics === 'string' ? rawLyrics : '');

    const lyricSlice = this.sliceLyrics(lyrics, room.settings.lyricsLineCount);

    if (!lyricSlice) return null;

    // 标准化歌词格式
    chosenSong.lyrics = lyrics;

    const round: RoundState = {
      roundNumber: room.roundHistory.length + 1,
      song: chosenSong,
      lyricSlice,
      startTime: Date.now(),
      startScores: Object.fromEntries(
        Array.from(room.players.values()).map((p) => [p.name, p.score]),
      ),
      guesses: [],
      correctGuessers: [],
      isActive: true,
      submitterName: chosenSong.submittedBy,
    };

    room.currentRound = round;
    room.status = 'playing';
    room.pendingSubmitterName = undefined;

    // 重置玩家本轮状态
    for (const player of room.players.values()) {
      player.guessesThisRound = 0;
      player.hasGuessedCorrectly = false;
      player.audioReadyThisRound = false;
    }

    return round;
  }

  processGuess(
    playerId: string,
    guessedSong: GameSong,
  ): {
    success: boolean;
    correct?: boolean;
    error?: string;
    room?: Room;
    player?: Player;
    roundEnded?: boolean;
    remainingGuesses?: number;
    feedback?: GuessFeedback;
    guessedSong?: GameSong;
    guessResult?: any;
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
    const answerSong = round.song!;

    if (player.name === round.submitterName) {
      return { success: false, error: 'SUBMITTER_CANNOT_GUESS' };
    }

    if (!player.audioReadyThisRound) {
      return { success: false, error: 'AUDIO_NOT_READY' };
    }

    player.guessesThisRound++;
    player.totalGuessesTotal++;

    const normalizedGuessTitle = this.normalizeString(guessedSong.title);
    const normalizedGuessArtist = this.normalizeString(guessedSong.artist);
    const normalizedAnswerTitle = this.normalizeString(answerSong.title);
    const normalizedAnswerArtist = this.normalizeString(answerSong.artist);

    // 判断是否猜对（优先 ID 绝对匹配，其次标题/歌手组合匹配）
    const correct =
      (!!guessedSong.id &&
        !!answerSong.id &&
        guessedSong.id === answerSong.id) ||
      (normalizedGuessTitle === normalizedAnswerTitle &&
        normalizedGuessArtist === normalizedAnswerArtist) ||
      (normalizedGuessTitle.includes(normalizedAnswerTitle) &&
        normalizedGuessArtist.includes(normalizedAnswerArtist));

    const feedback: GuessFeedback = {
      releaseYear: guessedSong.releaseYear,
      popularity: guessedSong.popularity,
    };

    // ↑↓ 的语义：指示“要接近答案应该往哪个方向调整”
    if (
      guessedSong.releaseYear !== undefined &&
      answerSong.releaseYear !== undefined
    ) {
      if (guessedSong.releaseYear === answerSong.releaseYear)
        feedback.releaseYearFeedback = '=';
      else
        feedback.releaseYearFeedback =
          guessedSong.releaseYear > answerSong.releaseYear ? '↓' : '↑';
    } else {
      feedback.releaseYearFeedback = '?';
    }

    if (
      guessedSong.popularity !== undefined &&
      answerSong.popularity !== undefined
    ) {
      if (guessedSong.popularity === answerSong.popularity)
        feedback.popularityFeedback = '=';
      else
        feedback.popularityFeedback =
          guessedSong.popularity > answerSong.popularity ? '↓' : '↑';
    } else {
      feedback.popularityFeedback = '?';
    }

    if (guessedSong.language && answerSong.language) {
      feedback.languageMatch = guessedSong.language === answerSong.language;
    }

    const guessTags = this.buildMetaTags(guessedSong);
    const answerTags = this.buildMetaTags(answerSong);
    const shared = this.intersectTags(guessTags, answerTags);
    feedback.metaTags = { guess: guessTags, shared };

    const guessResult = {
      correct,
      playerName: player.name,
      guessText: `${guessedSong.title} - ${guessedSong.artist}`,
      timestamp: Date.now(),
      guessNumber: player.guessesThisRound,
      feedback,
      guessedSong: {
        id: guessedSong.id,
        title: guessedSong.title,
        artist: guessedSong.artist,
        pictureUrl: guessedSong.pictureUrl,
        releaseYear: guessedSong.releaseYear,
        popularity: guessedSong.popularity,
        language: guessedSong.language,
      },
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

    const remainingGuesses =
      room.settings.maxGuessesPerRound - player.guessesThisRound;

    // 检查是否结束回合
    let roundEnded = false;
    if (room.settings.endOnFirstCorrect && correct) {
      roundEnded = true;
    } else if (this.allPlayersFinished(room)) {
      roundEnded = true;
    }

    return {
      success: true,
      correct,
      room,
      player,
      roundEnded,
      remainingGuesses,
      feedback,
      guessedSong,
      guessResult,
    };
  }

  processGuessTimeout(playerId: string): {
    success: boolean;
    error?: string;
    room?: Room;
    player?: Player;
    roundEnded?: boolean;
    remainingGuesses?: number;
    guessResult?: any;
  } {
    const room = this.getRoomByPlayerId(playerId);
    if (!room) return { success: false, error: 'NOT_IN_ROOM' };

    if (room.status !== 'playing' || !room.currentRound?.isActive) {
      return { success: false, error: 'NO_ACTIVE_ROUND' };
    }

    const player = room.players.get(playerId);
    if (!player) return { success: false, error: 'PLAYER_NOT_FOUND' };

    if (player.isSpectator) {
      return { success: false, error: 'SPECTATOR_CANNOT_GUESS' };
    }

    if (player.hasGuessedCorrectly) {
      return { success: false, error: 'ALREADY_GUESSED_CORRECTLY' };
    }

    if (player.name === room.currentRound?.submitterName) {
      return { success: false, error: 'SUBMITTER_CANNOT_GUESS' };
    }

    if (!player.audioReadyThisRound) {
      return { success: false, error: 'AUDIO_NOT_READY' };
    }

    if (player.guessesThisRound >= room.settings.maxGuessesPerRound) {
      return { success: false, error: 'NO_MORE_GUESSES' };
    }

    player.guessesThisRound++;
    player.totalGuessesTotal++;

    const guessResult = {
      correct: false,
      playerName: player.name,
      guessText: '⏰ 超时',
      timestamp: Date.now(),
      guessNumber: player.guessesThisRound,
    };

    room.currentRound.guesses.push(guessResult);

    const remainingGuesses =
      room.settings.maxGuessesPerRound - player.guessesThisRound;

    // 超时永远不触发 endOnFirstCorrect，仅检查是否所有人完成
    const roundEnded = this.allPlayersFinished(room);

    return {
      success: true,
      room,
      player,
      roundEnded,
      remainingGuesses,
      guessResult,
    };
  }

  private buildMetaTags(song: GameSong): string[] {
    const raw: string[] = [];
    if (song.artist) {
      raw.push(...this.splitPeople(song.artist));
    }
    if (song.album) {
      raw.push(String(song.album));
    }
    if (Array.isArray(song.tags)) {
      raw.push(...song.tags);
    }

    // 去重 + 保序
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of raw) {
      const s = String(t || '').trim();
      if (!s) continue;
      const key = this.normalizeString(s);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out.slice(0, 30);
  }

  private splitPeople(input: string): string[] {
    return input
      .split(/[,，/、&]|\s+&\s+/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private intersectTags(a: string[], b: string[]): string[] {
    const bSet = new Set(b.map((x) => this.normalizeString(x)));
    const shared: string[] = [];
    for (const x of a) {
      if (bSet.has(this.normalizeString(x))) shared.push(x);
    }
    return shared;
  }

  private allPlayersFinished(room: Room): boolean {
    for (const player of room.players.values()) {
      // 观战者/离线玩家不参与本轮结束判定
      if (player.isSpectator) continue;
      if (!player.connected) continue;

      // 尚未加载完成音频的玩家不阻塞本轮结束
      if (!player.audioReadyThisRound) continue;

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
      const correctCount = round.correctGuessers.filter(
        (n) => n !== round.submitterName,
      ).length;
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

    const before = round.startScores || {};
    const scores = this.getScores(room).map((s) => ({
      ...s,
      delta: s.score - (before[s.name] ?? s.score),
    }));

    // 供 round_end 重连同步
    room.lastRoundEnd = {
      song: {
        title: round.song!.title,
        artist: round.song!.artist,
        album: round.song!.album,
        pictureUrl: round.song!.pictureUrl,
      },
      correctGuessers: round.correctGuessers,
      scores,
      isFinalRound: room.roundHistory.length >= room.settings.maxRounds,
    };

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
    room.pendingSubmitterName = undefined;

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

  kickPlayer(
    roomId: string,
    hostId: string,
    targetName: string,
  ): { success: boolean; targetId?: string } {
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

  transferHost(
    roomId: string,
    requesterId: string,
    targetName: string,
    force = false,
  ): { success: boolean; newHost?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false };

    if (!force) {
      const requester = room.players.get(requesterId);
      if (!requester?.isHost) return { success: false };
    }

    const targetEntry = Array.from(room.players.entries()).find(
      ([, p]) => p.name === targetName,
    );
    if (!targetEntry) return { success: false };
    const [targetId, target] = targetEntry;

    // 清除现有房主标记
    for (const player of room.players.values()) {
      player.isHost = false;
    }

    target.isHost = true;
    target.isReady = true;
    room.hostId = targetId;
    room.hostName = target.name;

    return { success: true, newHost: target.name };
  }

  prioritizeSubmitter(
    roomId: string,
    requesterId: string,
    targetName: string,
    force = false,
  ): { success: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false };

    if (!force) {
      const requester = room.players.get(requesterId);
      if (!requester?.isHost) return { success: false };
    }

    const idx = room.songQueue.findIndex((s) => s.submittedBy === targetName);
    if (idx <= 0) return { success: idx === 0 }; // already first or not found

    const [song] = room.songQueue.splice(idx, 1);
    room.songQueue.unshift(song);
    return { success: true };
  }

  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[\s\-_.。，,！!？?]/g, '')
      .replace(/[（(][^）)]*[）)]/g, ''); // 移除括号内容
  }

  toRoomInfo(room: Room): RoomInfo {
    const connectedCount = Array.from(room.players.values()).filter(
      (p) => p.connected,
    ).length;
    return {
      id: room.id,
      name: room.name,
      hostName: room.hostName,
      playerCount: connectedCount,
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
    isSpectator?: boolean;
    connected: boolean;
    hasSubmittedSong: boolean;
  }> {
    const players: Array<{
      id: string;
      name: string;
      score: number;
      isReady: boolean;
      isHost: boolean;
      isSpectator?: boolean;
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
        isSpectator: player.isSpectator,
        connected: player.connected,
        hasSubmittedSong: !!player.submittedSong,
      });
    }
    return players;
  }

  markDisconnected(playerId: string): {
    room?: Room;
    wasHost: boolean;
    dissolved: boolean;
  } {
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
    if (!player) {
      this.playerRoomMap.delete(playerId);
      return { room, wasHost: false, dissolved: false };
    }

    const wasHost = !!player.isHost;
    player.connected = false;

    // 允许新 socket 以同名重连
    this.playerRoomMap.delete(playerId);

    // 房主断线则转移房主，避免卡住
    if (wasHost) {
      const nextHost = Array.from(room.players.values()).find(
        (p) => p.connected && p.id !== playerId,
      );
      if (nextHost) {
        for (const p of room.players.values()) p.isHost = false;
        nextHost.isHost = true;
        nextHost.isReady = true;
        room.hostId = nextHost.id;
        room.hostName = nextHost.name;
      }
    }

    // 若房间内已无任何在线玩家，则直接解散（即使游戏已开始）
    const hasAnyConnected = Array.from(room.players.values()).some(
      (p) => p.connected,
    );
    if (!hasAnyConnected) {
      for (const pid of room.players.keys()) {
        this.playerRoomMap.delete(pid);
      }
      this.rooms.delete(roomId);
      return { room: undefined, wasHost, dissolved: true };
    }

    return { room, wasHost, dissolved: false };
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

  handleDisconnect(playerId: string): {
    room?: Room;
    wasHost: boolean;
    dissolved: boolean;
  } {
    return this.markDisconnected(playerId);
  }
}
