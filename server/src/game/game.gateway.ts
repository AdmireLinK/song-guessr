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
import { MusicDetail, MusicService } from './music.service';
import { StatsService } from '../admin/stats.service';
import { RoomSettings, GameSong } from './game.types';
import { ServerType, SongDetailInfo, SongLikes } from '../utils/music';
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

  private getPlayerName(client: Socket): string {
    const raw = (client.data as { playerName?: unknown } | undefined)?.playerName;
    return typeof raw === 'string' ? raw : '';
  }

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
    const { room, wasHost, dissolved } = this.roomService.handleDisconnect(
      client.id,
    );

    if (dissolved) {
      this.server.emit('room:list', this.roomService.getPublicRooms());
    } else if (room) {
      client.leave(room.id);
      this.server
        .to(room.id)
        .emit('room:playerLeft', { playerName: this.getPlayerName(client) });

      if (wasHost) {
        this.server
          .to(room.id)
          .emit('room:hostChanged', { newHostName: room.hostName });
      }

      this.server
        .to(room.id)
        .emit('room:updated', this.roomService.toRoomInfo(room));
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
    @MessageBody()
    data: {
      roomName: string;
      playerName: string;
      isPrivate?: boolean;
      password?: string;
    },
  ) {
    const { roomName, playerName, isPrivate, password } = data;

    if (!roomName || !playerName) {
      client.emit('error', {
        code: 'INVALID_DATA',
        message: '房间名和玩家名不能为空',
      });
      return;
    }

    // 检查是否已在房间中
    const existingRoom = this.roomService.getRoomByPlayerId(client.id);
    if (existingRoom) {
      client.emit('error', {
        code: 'ALREADY_IN_ROOM',
        message: '你已经在一个房间中',
      });
      return;
    }

    const room = this.roomService.createRoom(
      client.id,
      playerName,
      roomName,
      isPrivate,
      password,
    );
    (client.data as { playerName?: string }).playerName = playerName;
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
    @MessageBody()
    data: { roomId: string; playerName: string; password?: string },
  ) {
    const { roomId, playerName, password } = data;

    if (!roomId || !playerName) {
      client.emit('error', {
        code: 'INVALID_DATA',
        message: '房间ID和玩家名不能为空',
      });
      return;
    }

    // 检查是否已在房间中
    const existingRoom = this.roomService.getRoomByPlayerId(client.id);
    if (existingRoom) {
      client.emit('error', {
        code: 'ALREADY_IN_ROOM',
        message: '你已经在一个房间中',
      });
      return;
    }

    const result = this.roomService.joinRoom(
      roomId,
      client.id,
      playerName,
      password,
    );

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
    (client.data as { playerName?: string }).playerName = playerName;
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
      client.emit('room:left', { playerName: this.getPlayerName(client) });
    } else if (room) {
      client.leave(room.id);
      client.emit('room:left', { playerName: this.getPlayerName(client) });
      this.server
        .to(room.id)
        .emit('room:playerLeft', { playerName: this.getPlayerName(client) });

      if (wasHost) {
        this.server
          .to(room.id)
          .emit('room:hostChanged', { newHostName: room.hostName });
      }

      this.server
        .to(room.id)
        .emit('room:updated', this.roomService.toRoomInfo(room));
    }

    this.server.emit('room:list', this.roomService.getPublicRooms());
  }

  @SubscribeMessage('room:ready')
  handleReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { isReady: boolean },
  ) {
    const { room, player } = this.roomService.setPlayerReady(
      client.id,
      data.isReady,
    );

    if (room && player) {
      this.server.to(room.id).emit('room:playerReady', {
        playerName: player.name,
        isReady: player.isReady,
      });
    }
  }

  @SubscribeMessage('room:updateSettings')
  handleUpdateSettings(
    @ConnectedSocket() client: Socket,
    @MessageBody() settings: Partial<RoomSettings>,
  ) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    const success = this.roomService.updateSettings(
      room.id,
      client.id,
      settings,
    );
    if (success) {
      this.server.to(room.id).emit('room:settingsChanged', room.settings);
    }
  }

  @SubscribeMessage('room:kick')
  handleKickPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerName: string },
  ) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    const result = this.roomService.kickPlayer(
      room.id,
      client.id,
      data.playerName,
    );
    if (result.success && result.targetId) {
      const targetSocket = this.server.sockets.sockets.get(result.targetId);
      if (targetSocket) {
        targetSocket.emit('room:kicked', { reason: '你被房主踢出房间' });
        targetSocket.leave(room.id);
      }

      this.server
        .to(room.id)
        .emit('room:playerLeft', { playerName: data.playerName });
      this.server
        .to(room.id)
        .emit('room:updated', this.roomService.toRoomInfo(room));
      this.server.emit('room:list', this.roomService.getPublicRooms());
    }
  }

  @SubscribeMessage('game:start')
  async handleStartGame(@ConnectedSocket() client: Socket) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) {
      client.emit('error', {
        code: 'NOT_IN_ROOM',
        message: '你不在任何房间中',
      });
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

    // 新主玩法：进入“房主选择出题人”阶段
    this.server.to(room.id).emit('game:needSubmitter', { roundNumber: 1 });

    // 记录游戏开始
    await this.statsService.recordGameStart(room);

    this.logger.log(`Game started in room ${room.id}`);
  }

  @SubscribeMessage('game:chooseSubmitter')
  handleChooseSubmitter(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerName: string },
  ) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) {
      client.emit('error', {
        code: 'NOT_IN_ROOM',
        message: '你不在任何房间中',
      });
      return;
    }

    const result = this.roomService.chooseSubmitter(
      room.id,
      client.id,
      data.playerName,
    );
    if (!result.success) {
      const errorMessages: Record<string, string> = {
        NOT_HOST: '只有房主可以选择出题人',
        PLAYER_NOT_FOUND: '玩家不存在',
        PLAYER_NOT_CONNECTED: '玩家未连接',
        INVALID_STATE: '当前阶段无法选择出题人',
      };
      client.emit('error', {
        code: result.error || 'CHOOSE_SUBMITTER_FAILED',
        message: errorMessages[result.error || ''] || '选择出题人失败',
      });
      return;
    }

    this.server
      .to(room.id)
      .emit('game:submitterSelected', { submitterName: data.playerName });
  }

  @SubscribeMessage('game:submitSong')
  async handleSubmitSong(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      songId?: string;
      name?: string;
      artist?: string;
      server: 'netease' | 'qq';
    },
  ) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) {
      client.emit('error', {
        code: 'NOT_IN_ROOM',
        message: '你不在任何房间中',
      });
      return;
    }

    try {
      let songDetail: MusicDetail | null = null;
      let songId: string | undefined = data.songId;

      // If name and artist are provided, look up by name/artist
      if (data.name && data.artist) {
        console.log(
          `[Game] Fetching song detail by name/artist: ${data.name} - ${data.artist}`,
        );
        songDetail = await this.musicService.getSongDetailByNameArtist(
          data.name,
          data.artist,
          data.server,
        );

        if (!songDetail) {
          console.log(
            `[Game] getSongDetailByNameArtist returned null for "${data.name}" - "${data.artist}"`,
          );
          client.emit('error', {
            code: 'SONG_NOT_FOUND',
            message: `找不到歌曲: ${data.name} - ${data.artist}`,
          });
          return;
        }

        // Update songId with the found ID
        songId = songDetail.id;
        console.log(`[Game] Got song detail:`, {
          id: songId,
          title: songDetail.title,
          artist: songDetail.author,
        });
      } else if (songId) {
        // If songId is provided, fetch using that
        console.log(`[Game] Fetching song detail by ID: ${songId}`);
        songDetail = await this.musicService.getSongDetail(songId, data.server);

        if (!songDetail) {
          client.emit('error', {
            code: 'SONG_NOT_FOUND',
            message: '找不到歌曲信息',
          });
          return;
        }
      } else {
        client.emit('error', {
          code: 'INVALID_REQUEST',
          message: '缺少歌曲信息',
        });
        return;
      }

      const [detailInfo, likes] = (await Promise.all([
        songId
          ? this.musicService.getSongDetailInfo(data.server, songId)
          : Promise.resolve(null),
        songId
          ? this.musicService.getSongLikes(data.server, songId)
          : Promise.resolve(null),
      ])) as [SongDetailInfo | null, SongLikes | null];

      const song: GameSong = {
        id: songId || '',
        title: songDetail.title,
        artist: songDetail.author,
        audioUrl: songDetail.url,
        pictureUrl: songDetail.pic,
        lyrics: this.roomService.parseLyrics(songDetail.lrc || ''),
        submittedBy: this.getPlayerName(client),
        releaseYear:
          detailInfo && detailInfo.date
            ? parseInt(detailInfo.date.split('-')[0])
            : undefined,
        popularity: likes?.count,
        language: detailInfo?.language,
        album: undefined,
        tags: detailInfo?.tags,
      };

      console.log(
        `[Game] Created song with ${(song.lyrics || []).length} lyric lines`,
      );

      const result = this.roomService.submitSong(client.id, song);
      if (!result.success) {
        const errorMessages: Record<string, string> = {
          NOT_WAITING_SONG: '当前不在等待出题阶段',
          NOT_SUBMITTER: '只有本轮出题人可以提交歌曲',
        };
        client.emit('error', {
          code: result.error || 'SUBMIT_FAILED',
          message: errorMessages[result.error || ''] || '提交歌曲失败',
        });
        return;
      }

      // 记录提交与请求明细
      const ip = client.handshake.address;
      await this.statsService.recordSongSubmit({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        server: data.server,
        pictureUrl: song.pictureUrl,
        language: song.language,
        playerName: this.getPlayerName(client),
        ip,
      });
      await this.statsService.recordMusicRequest({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        server: data.server,
        language: song.language,
        playerName: this.getPlayerName(client),
        ip,
        detail: detailInfo || undefined,
      });

      this.server
        .to(room.id)
        .emit('game:submitSong', { playerName: this.getPlayerName(client) });

      // 出题人提交后立即开始回合
      const started = this.roomService.startRound(room, song);
      if (!started) {
        client.emit('error', {
          code: 'ROUND_START_FAILED',
          message: '无法开始回合（歌词不足或数据异常）',
        });
        return;
      }

      const endTime = started.startTime + room.settings.roundDuration * 1000;
      this.server.to(room.id).emit('game:roundStart', {
        roundNumber: started.roundNumber,
        audioUrl: started.song!.audioUrl,
        lyricSlice: started.lyricSlice!,
        startTime: started.startTime,
        endTime,
        submitterName: started.submitterName,
      });

      // 答案详情：仅出题人立即可见
      client.emit('game:answerReveal', {
        song: {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          pictureUrl: song.pictureUrl,
          releaseYear: song.releaseYear,
          popularity: song.popularity,
          language: song.language,
          tags: song.tags,
        },
      });

      // 设置回合超时
      const timer = setTimeout(() => {
        this.endCurrentRound(room.id);
      }, room.settings.roundDuration * 1000);
      this.roundTimers.set(room.id, timer);

      this.logger.log(
        `Round ${started.roundNumber} started in room ${room.id}`,
      );
    } catch (error) {
      this.logger.error(`Error submitting song: ${error}`);
      client.emit('error', { code: 'SONG_ERROR', message: '获取歌曲信息失败' });
    }
  }

  @SubscribeMessage('game:guess')
  async handleGuess(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      songId: string;
      server: ServerType;
      title?: string;
      artist?: string;
    },
  ) {
    try {
      // 获取猜测歌曲详情及补充信息
      const guessedDetail = data.songId
        ? await this.musicService.getSongDetail(data.songId, data.server)
        : null;

      const [detailInfo, likes] = (await Promise.all([
        data.songId
          ? this.musicService.getSongDetailInfo(data.server, data.songId)
          : Promise.resolve(null),
        data.songId
          ? this.musicService.getSongLikes(data.server, data.songId)
          : Promise.resolve(null),
      ])) as [SongDetailInfo | null, SongLikes | null];

      const guessedSong: GameSong = {
        id: guessedDetail?.id || data.songId || '',
        title: guessedDetail?.title || data.title || '',
        artist: guessedDetail?.author || data.artist || '',
        audioUrl: guessedDetail?.url || '',
        pictureUrl: guessedDetail?.pic || '',
        lyrics: [],
        submittedBy: '',
        releaseYear:
          detailInfo && detailInfo.date
            ? parseInt(detailInfo.date.split('-')[0])
            : undefined,
        popularity: likes?.count,
        language: detailInfo?.language,
        album: undefined,
        tags: detailInfo?.tags,
      };

      const result = this.roomService.processGuess(client.id, guessedSong);

      if (!result.success) {
        const errorMessages: Record<string, string> = {
          NOT_IN_ROOM: '你不在任何房间中',
          NO_ACTIVE_ROUND: '当前没有进行中的回合',
          ALREADY_GUESSED_CORRECTLY: '你已经猜对了',
          NO_MORE_GUESSES: '本轮猜测次数已用完',
          SUBMITTER_CANNOT_GUESS: '出题人不能参与猜测',
        };
        client.emit('error', {
          code: result.error,
          message: errorMessages[result.error!] || '猜测失败',
        });
        return;
      }

      const room = result.room!;
      const player = result.player!;

      const ip = client.handshake.address;
      await this.statsService.recordSongGuess({
        songId: guessedSong.id,
        title: guessedSong.title,
        artist: guessedSong.artist,
        server: data.server,
        language: guessedSong.language,
        correct: !!result.correct,
        playerName: player.name,
        ip,
        popularity: guessedSong.popularity,
        releaseYear: guessedSong.releaseYear,
      });
      await this.statsService.recordMusicRequest({
        songId: guessedSong.id,
        title: guessedSong.title,
        artist: guessedSong.artist,
        server: data.server,
        language: guessedSong.language,
        playerName: player.name,
        ip,
        detail: detailInfo || undefined,
      });

      // 发送猜测结果给玩家（包含反馈数据）
      client.emit('game:guessResult', {
        correct: !!result.correct,
        playerName: player.name,
        guessText: `${guessedSong.title} - ${guessedSong.artist}`,
        timestamp: Date.now(),
        guessNumber: player.guessesThisRound,
        remainingGuesses: result.remainingGuesses,
        feedback: result.feedback,
        guessedSong: {
          id: guessedSong.id,
          title: guessedSong.title,
          artist: guessedSong.artist,
          pictureUrl: guessedSong.pictureUrl,
          releaseYear: guessedSong.releaseYear,
          popularity: guessedSong.popularity,
          language: guessedSong.language,
        },
      });

      // 猜对后给本人揭示答案详情（用于进入旁观模式展示答案卡片）
      if (result.correct && room.currentRound?.song) {
        const ans = room.currentRound.song;
        client.emit('game:answerReveal', {
          song: {
            id: ans.id,
            title: ans.title,
            artist: ans.artist,
            album: ans.album,
            pictureUrl: ans.pictureUrl,
            releaseYear: ans.releaseYear,
            popularity: ans.popularity,
            language: ans.language,
            tags: ans.tags,
          },
        });
      }

      // 通知其他玩家有人猜测
      client.to(room.id).emit('game:playerGuessed', {
        playerName: player.name,
        correct: result.correct,
      });

      // 旁观猜测流：出题人 + 已猜对玩家可以看到其他人的每次猜测详情
      const spectators = Array.from(room.players.values()).filter(
        (p) =>
          p.name === room.currentRound?.submitterName || p.hasGuessedCorrectly,
      );
      const guessForSpectators = result.guessResult;
      if (guessForSpectators) {
        for (const sp of spectators) {
          if (sp.id === client.id) continue;
          this.server.to(sp.id).emit('game:spectatorGuess', {
            playerName: player.name,
            guess: guessForSpectators,
          });
        }
      }

      // 如果回合结束
      if (result.roundEnded) {
        this.endCurrentRound(room.id);
      }
    } catch (error) {
      this.logger.error(`Error during guess: ${error}`);
      client.emit('error', { code: 'SONG_ERROR', message: '获取歌曲信息失败' });
    }
  }

  @SubscribeMessage('game:skipRound')
  handleSkipRound(@ConnectedSocket() client: Socket) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    const player = room.players.get(client.id);
    if (!player?.isHost) {
      client.emit('error', {
        code: 'NOT_HOST',
        message: '只有房主可以跳过回合',
      });
      return;
    }

    if (room.currentRound?.isActive) {
      this.endCurrentRound(room.id);
    }
  }

  @SubscribeMessage('chat:send')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { message: string },
  ) {
    const room = this.roomService.getRoomByPlayerId(client.id);
    if (!room) return;

    this.server.to(room.id).emit('chat:message', {
      playerName: this.getPlayerName(client),
      message: data.message,
      timestamp: Date.now(),
    });
  }

  private startNextRound(roomId: string) {
    // 旧玩法（songQueue）遗留方法：新主玩法不再自动 startNextRound
    this.beginNextRoundSelection(roomId);
  }

  private beginNextRoundSelection(roomId: string) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    // 如果达到最大轮数，结束游戏
    if (room.roundHistory.length >= room.settings.maxRounds) {
      void this.endGame(roomId);
      return;
    }

    room.status = 'waiting_submitter';
    room.pendingSubmitterName = undefined;
    this.server.to(roomId).emit('game:needSubmitter', {
      roundNumber: room.roundHistory.length + 1,
    });
  }

  private endCurrentRound(roomId: string) {
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
      correctGuessers:
        room.roundHistory[room.roundHistory.length - 1].correctGuessers,
      scores,
    });

    // 检查是否继续游戏
    if (room.roundHistory.length >= room.settings.maxRounds) {
      setTimeout(() => {
        void this.endGame(roomId);
      }, 3000);
    } else {
      // 等待 3 秒展示答案后，回到“选择出题人”阶段
      setTimeout(() => this.beginNextRoundSelection(roomId), 3000);
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
        this.server
          .to(roomId)
          .emit('room:updated', this.roomService.toRoomInfo(currentRoom));
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

  // 管理/后端调用的工具方法
  adminKickPlayer(roomId: string, playerName: string) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return false;
    const targetEntry = Array.from(room.players.entries()).find(
      ([, p]) => p.name === playerName,
    );
    if (!targetEntry) return false;
    const [targetId] = targetEntry;
    room.players.delete(targetId);
    this.server.to(roomId).emit('room:playerLeft', { playerName });
    this.server
      .to(roomId)
      .emit('room:updated', this.roomService.toRoomInfo(room));
    const targetSocket = this.server.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('room:kicked', { reason: '你被管理员移出房间' });
      targetSocket.leave(roomId);
    }
    return true;
  }

  adminTransferHost(roomId: string, targetName: string) {
    const result = this.roomService.transferHost(roomId, '', targetName, true);
    if (result.success) {
      this.server
        .to(roomId)
        .emit('room:hostChanged', { newHostName: result.newHost });
      this.server
        .to(roomId)
        .emit(
          'room:updated',
          this.roomService.toRoomInfo(this.roomService.getRoom(roomId)!),
        );
    }
    return result.success;
  }

  adminPrioritizeSubmitter(roomId: string, targetName: string) {
    const ok = this.roomService.prioritizeSubmitter(
      roomId,
      '',
      targetName,
      true,
    ).success;
    if (ok) {
      const room = this.roomService.getRoom(roomId);
      if (room) {
        this.server
          .to(roomId)
          .emit('room:updated', this.roomService.toRoomInfo(room));
      }
    }
    return ok;
  }
}
