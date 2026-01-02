import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomService } from './room.service';
import { MusicService } from './music.service';
import { StatsService } from '../admin/stats.service';
import { RoomSettings, GameSong, LyricLine } from './game.types';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);
  private roundTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly roomService: RoomService,
    private readonly musicService: MusicService,
    private readonly statsService: StatsService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const { room, wasHost, dissolved } = this.roomService.handleDisconnect(client.id);

    if (dissolved) {
      this.server.emit('room:list', this.roomService.getPublicRooms());
    } else if (room) {
      client.leave(room.id);
      this.server.to(room.id).emit('room:playerLeft', { playerName: client.data.playerName });

      if (wasHost) {
        this.server.to(room.id).emit('room:hostChanged', { newHostName: room.hostName });
      }

      this.server.to(room.id).emit('room:updated', this.roomService.toRoomInfo(room));
      this.server.emit('room:list', this.roomService.getPublicRooms());
    }
  }

  @SubscribeMessage('room:list')
  handleListRooms(@ConnectedSocket() client: Socket) {
    const rooms = this.roomService.getPublicRooms();
    client.emit('room:list', rooms);
  }

  @SubscribeMessage('room:create')
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomName: string; playerName: string; isPrivate?: boolean; password?: string },
  ) {
    const { roomName, playerName, isPrivate, password } = data;

    if (!roomName || !playerName) {
      client.emit('error', { code: 'INVALID_DATA', message: '房间名和玩家名不能为空' });
      return;
    }

    // 检查是否已在房间中
    const existingRoom = this.roomService.getRoomByPlayerId(client.id);
    if (existingRoom) {
      client.emit('error', { code: 'ALREADY_IN_ROOM', message: '你已经在一个房间中' });
      return;
    }

    const room = this.roomService.createRoom(client.id, playerName, roomName, isPrivate, password);
    client.data.playerName = playerName;
    client.join(room.id);

    client.emit('room:created', this.roomService.toRoomInfo(room));
    client.emit('room:joined', {
      room: this.roomService.toRoomInfo(room),
      players: this.roomService.getPlayerInfo(room),
      settings: room.settings,
    });

    this.server.emit('room:list', this.roomService.getPublicRooms());
    this.logger.log(`Room created: ${room.id} by ${playerName}`);
  }

  @SubscribeMessage('room:join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerName: string; password?: string },
  ) {
    const { roomId, playerName, password } = data;

    if (!roomId || !playerName) {
      client.emit('error', { code: 'INVALID_DATA', message: '房间ID和玩家名不能为空' });
      return;
    }

    // 检查是否已在房间中
    const existingRoom = this.roomService.getRoomByPlayerId(client.id);
    if (existingRoom) {
      client.emit('error', { code: 'ALREADY_IN_ROOM', message: '你已经在一个房间中' });
      return;
    }

    const result = this.roomService.joinRoom(roomId, client.id, playerName, password);

    if (!result.success) {
      const errorMessages: Record<string, string> = {
        ROOM_NOT_FOUND: '房间不存在',
        INVALID_PASSWORD: '密码错误',
        ROOM_FULL: '房间已满',
        NAME_TAKEN: '用户名已被占用',
        GAME_IN_PROGRESS: '游戏进行中，无法加入',
      };
      client.emit('error', {
        code: result.error,
        message: errorMessages[result.error!] || '加入失败',
      });
      return;
    }

    const room = result.room!;
    client.data.playerName = playerName;
    client.join(room.id);

    client.emit('room:joined', {
      room: this.roomService.toRoomInfo(room),
      players: this.roomService.getPlayerInfo(room),
      settings: room.settings,
    });

    client.to(room.id).emit('room:playerJoined', {
      id: client.id,
      name: playerName,
      score: 0,
      isReady: false,
      isHost: false,
      connected: true,
      hasSubmittedSong: false,
    });

    this.server.emit('room:list', this.roomService.getPublicRooms());
    this.logger.log(`Player ${playerName} joined room ${room.id}`);
  }

  @SubscribeMessage('room:leave')
  handleLeaveRoom(@ConnectedSocket() client: Socket) {
    const { room, wasHost, dissolved } = this.roomService.leaveRoom(client.id);

    if (dissolved) {
      client.emit('room:left', { playerName: client.data.playerName });
    } else if (room) {
      client.leave(room.id);
      client.emit('room:left', { playerName: client.data.playerName });
      this.server.to(room.id).emit('room:playerLeft', { playerName: client.data.playerName });

      if (wasHost) {
        this.server.to(room.id).emit('room:hostChanged', { newHostName: room.hostName });
      }

      this.server.to(room.id).emit('room:updated', this.roomService.toRoomInfo(room));
    }

    this.server.emit('room:list', this.roomService.getPublicRooms());
  }

  @SubscribeMessage('room:ready')
  handleReady(@ConnectedSocket() client: Socket, @MessageBody() data: { isReady: boolean }) {
    const { room, player } = this.roomService.setPlayerReady(client.id, data.isReady);

    if (room && player) {
      this.server.to(room.id).emit('room:playerReady', {
        playerName: player.name,
        isReady: player.isReady,
      });
    }
  }

  @SubscribeMessage('room:updateSettings')
  handleUpdateSettings(@ConnectedSocket() client: Socket, @MessageBody() settings: Partial<RoomSettings>) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    const success = this.roomService.updateSettings(room.id, client.id, settings);
    if (success) {
      this.server.to(room.id).emit('room:settingsChanged', room.settings);
    }
  }

  @SubscribeMessage('room:kick')
  handleKickPlayer(@ConnectedSocket() client: Socket, @MessageBody() data: { playerName: string }) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    const result = this.roomService.kickPlayer(room.id, client.id, data.playerName);
    if (result.success && result.targetId) {
      const targetSocket = this.server.sockets.sockets.get(result.targetId);
      if (targetSocket) {
        targetSocket.emit('room:kicked', { reason: '你被房主踢出房间' });
        targetSocket.leave(room.id);
      }

      this.server.to(room.id).emit('room:playerLeft', { playerName: data.playerName });
      this.server.to(room.id).emit('room:updated', this.roomService.toRoomInfo(room));
      this.server.emit('room:list', this.roomService.getPublicRooms());
    }
  }

  @SubscribeMessage('game:start')
  async handleStartGame(@ConnectedSocket() client: Socket) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) {
      client.emit('error', { code: 'NOT_IN_ROOM', message: '你不在任何房间中' });
      return;
    }

    const result = this.roomService.startGame(room.id, client.id);
    if (!result.success) {
      const errorMessages: Record<string, string> = {
        NOT_HOST: '只有房主可以开始游戏',
        NOT_ENOUGH_PLAYERS: '至少需要2名玩家',
        PLAYERS_NOT_READY: '有玩家未准备',
        GAME_ALREADY_STARTED: '游戏已经开始',
      };
      client.emit('error', {
        code: result.error,
        message: errorMessages[result.error!] || '无法开始游戏',
      });
      return;
    }

    this.server.to(room.id).emit('game:started');

    // 通知玩家提交歌曲
    const playersNeeded = this.roomService.getPlayersWithoutSong(room);
    this.server.to(room.id).emit('game:waitingForSongs', { playersNeeded });

    // 记录游戏开始
    await this.statsService.recordGameStart(room);

    this.logger.log(`Game started in room ${room.id}`);
  }

  @SubscribeMessage('game:submitSong')
  async handleSubmitSong(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { songId?: string; name?: string; artist?: string; server: 'netease' | 'qq' },
  ) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) {
      client.emit('error', { code: 'NOT_IN_ROOM', message: '你不在任何房间中' });
      return;
    }

    try {
      let songDetail: any = null;
      let songId: string | undefined = data.songId;
      
      // If name and artist are provided, look up by name/artist
      if (data.name && data.artist) {
        console.log(`[Game] Fetching song detail by name/artist: ${data.name} - ${data.artist}`);
        songDetail = await this.musicService.getSongDetailByNameArtist(data.name, data.artist, data.server);
        
        if (!songDetail) {
          console.log(`[Game] getSongDetailByNameArtist returned null for "${data.name}" - "${data.artist}"`);
          client.emit('error', { code: 'SONG_NOT_FOUND', message: `找不到歌曲: ${data.name} - ${data.artist}` });
          return;
        }
        
        // Update songId with the found ID
        songId = songDetail.id;
        console.log(`[Game] Got song detail:`, { id: songId, title: songDetail.title, artist: songDetail.author });
      } else if (songId) {
        // If songId is provided, fetch using that
        console.log(`[Game] Fetching song detail by ID: ${songId}`);
        songDetail = await this.musicService.getSongDetail(songId, data.server);
        
        if (!songDetail) {
          client.emit('error', { code: 'SONG_NOT_FOUND', message: '找不到歌曲信息' });
          return;
        }
      } else {
        client.emit('error', { code: 'INVALID_REQUEST', message: '缺少歌曲信息' });
        return;
      }

      const song: GameSong = {
        id: songId || '',
        title: songDetail.title,
        artist: songDetail.author,
        audioUrl: songDetail.url,
        pictureUrl: songDetail.pic,
        lyrics: this.roomService.parseLyrics(songDetail.lrc || '') as LyricLine[],
        submittedBy: client.data.playerName,
      };
      
      console.log(`[Game] Created song with ${(song.lyrics || []).length} lyric lines`);

      const result = this.roomService.submitSong(client.id, song);
      if (!result.success) {
        client.emit('error', { code: result.error, message: '提交歌曲失败' });
        return;
      }

      this.server.to(room.id).emit('game:submitSong', { playerName: client.data.playerName });

      // 检查是否所有人都提交了
      const playersNeeded = this.roomService.getPlayersWithoutSong(room);
      if (playersNeeded.length === 0 && this.roomService.canStartRound(room)) {
        // 自动开始第一轮
        this.startNextRound(room.id);
      } else {
        this.server.to(room.id).emit('game:waitingForSongs', { playersNeeded });
      }
    } catch (error) {
      this.logger.error(`Error submitting song: ${error}`);
      client.emit('error', { code: 'SONG_ERROR', message: '获取歌曲信息失败' });
    }
  }

  @SubscribeMessage('game:guess')
  handleGuess(@ConnectedSocket() client: Socket, @MessageBody() data: { guess: string }) {
    const result = this.roomService.processGuess(client.id, data.guess);

    if (!result.success) {
      const errorMessages: Record<string, string> = {
        NOT_IN_ROOM: '你不在任何房间中',
        NO_ACTIVE_ROUND: '当前没有进行中的回合',
        ALREADY_GUESSED_CORRECTLY: '你已经猜对了',
        NO_MORE_GUESSES: '本轮猜测次数已用完',
      };
      client.emit('error', {
        code: result.error,
        message: errorMessages[result.error!] || '猜测失败',
      });
      return;
    }

    const room = result.room!;
    const player = result.player!;

    // 发送猜测结果给玩家
    client.emit('game:guessResult', {
      correct: result.correct,
      playerName: player.name,
      guessText: data.guess,
      timestamp: Date.now(),
      guessNumber: player.guessesThisRound,
      remainingGuesses: result.remainingGuesses,
    });

    // 通知其他玩家有人猜测
    client.to(room.id).emit('game:playerGuessed', {
      playerName: player.name,
      correct: result.correct,
    });

    // 如果回合结束
    if (result.roundEnded) {
      this.endCurrentRound(room.id);
    }
  }

  @SubscribeMessage('game:skipRound')
  handleSkipRound(@ConnectedSocket() client: Socket) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    const player = room.players.get(client.id);
    if (!player?.isHost) {
      client.emit('error', { code: 'NOT_HOST', message: '只有房主可以跳过回合' });
      return;
    }

    if (room.currentRound?.isActive) {
      this.endCurrentRound(room.id);
    }
  }

  @SubscribeMessage('chat:send')
  handleChatMessage(@ConnectedSocket() client: Socket, @MessageBody() data: { message: string }) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    this.server.to(room.id).emit('chat:message', {
      playerName: client.data.playerName,
      message: data.message,
      timestamp: Date.now(),
    });
  }

  private startNextRound(roomId: string) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    const round = this.roomService.startRound(room);
    if (!round) {
      // 没有更多歌曲，结束游戏
      this.endGame(roomId);
      return;
    }

    const endTime = round.startTime + room.settings.roundDuration * 1000;

    this.server.to(roomId).emit('game:roundStart', {
      roundNumber: round.roundNumber,
      audioUrl: round.song!.audioUrl,
      lyricSlice: round.lyricSlice,
      startTime: round.startTime,
      endTime,
      submitterName: round.submitterName,
    });

    // 设置回合超时
    const timer = setTimeout(() => {
      this.endCurrentRound(roomId);
    }, room.settings.roundDuration * 1000);

    this.roundTimers.set(roomId, timer);

    this.logger.log(`Round ${round.roundNumber} started in room ${roomId}`);
  }

  private async endCurrentRound(roomId: string) {
    // 清除计时器
    const timer = this.roundTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(roomId);
    }

    const room = this.roomService.getRoom(roomId);
    if (!room || !room.currentRound) return;

    const { scores, song } = this.roomService.endRound(room);

    this.server.to(roomId).emit('game:roundEnd', {
      song: {
        title: song.title,
        artist: song.artist,
        pictureUrl: song.pictureUrl,
      },
      correctGuessers: room.roundHistory[room.roundHistory.length - 1].correctGuessers,
      scores,
    });

    // 检查是否继续游戏
    if (room.roundHistory.length >= room.settings.maxRounds || room.songQueue.length === 0) {
      // 等待3秒后结束游戏
      setTimeout(() => this.endGame(roomId), 3000);
    } else {
      // 等待5秒后开始下一轮
      setTimeout(() => this.startNextRound(roomId), 5000);
    }
  }

  private async endGame(roomId: string) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    const { finalScores, winner } = this.roomService.endGame(room);

    this.server.to(roomId).emit('game:gameEnd', {
      finalScores,
      winner,
    });

    // 记录游戏结束统计
    await this.statsService.recordGameEnd(room, finalScores, winner);

    // 5秒后重置房间
    setTimeout(() => {
      const currentRoom = this.roomService.getRoom(roomId);
      if (currentRoom) {
        this.roomService.resetToWaiting(currentRoom);
        this.server.to(roomId).emit('room:updated', this.roomService.toRoomInfo(currentRoom));
      }
    }, 5000);

    this.logger.log(`Game ended in room ${roomId}, winner: ${winner}`);
  }

  // 管理员功能：强制解散房间
  dissolveRoom(roomId: string) {
    const playerIds = this.roomService.dissolveRoom(roomId);

    for (const playerId of playerIds) {
      const socket = this.server.sockets.sockets.get(playerId);
      if (socket) {
        socket.emit('room:dissolved');
        socket.leave(roomId);
      }
    }

    this.server.emit('room:list', this.roomService.getPublicRooms());
  }
}
