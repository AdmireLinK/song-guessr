import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telemetry, TelemetryDocument } from '../schemas/telemetry.schema';
import { GameStats, GameStatsDocument } from '../schemas/game-stats.schema';
import {
  PlayerStats,
  PlayerStatsDocument,
} from '../schemas/player-stats.schema';
import { SongStats, SongStatsDocument } from '../schemas/song-stats.schema';
import { ActionLog, ActionLogDocument } from '../schemas/action-log.schema';
import { Room, PlayerScore } from '../game/game.types';

@Injectable()
export class StatsService {
  constructor(
    @InjectModel(Telemetry.name)
    private telemetryModel: Model<TelemetryDocument>,
    @InjectModel(GameStats.name)
    private gameStatsModel: Model<GameStatsDocument>,
    @InjectModel(PlayerStats.name)
    private playerStatsModel: Model<PlayerStatsDocument>,
    @InjectModel(SongStats.name)
    private songStatsModel: Model<SongStatsDocument>,
    @InjectModel(ActionLog.name)
    private actionLogModel: Model<ActionLogDocument>,
  ) {}

  // 记录音乐请求详情
  async recordMusicRequest(data: {
    songId?: string;
    title?: string;
    artist?: string;
    server?: 'netease' | 'qq';
    language?: string;
    detail?: Record<string, any>;
    playerName?: string;
    ip?: string;
  }) {
    const log = new this.actionLogModel({
      type: 'music_request',
      ...data,
      timestamp: new Date(),
    });
    await log.save();
  }

  // 记录提交歌曲
  async recordSongSubmit(data: {
    songId?: string;
    title: string;
    artist: string;
    server: 'netease' | 'qq';
    pictureUrl?: string;
    language?: string;
    playerName: string;
    ip?: string;
  }) {
    await this.songStatsModel.updateOne(
      { songId: data.songId || data.title, server: data.server },
      {
        $setOnInsert: {
          pictureUrl: data.pictureUrl,
        },
        $set: {
          title: data.title,
          artist: data.artist,
          language: data.language,
        },
        $inc: { timesAsQuestion: 1 },
      },
      { upsert: true },
    );

    await this.actionLogModel.create({
      type: 'submit',
      songId: data.songId,
      title: data.title,
      artist: data.artist,
      server: data.server,
      language: data.language,
      playerName: data.playerName,
      ip: data.ip,
      timestamp: new Date(),
    });
  }

  // 记录猜歌
  async recordSongGuess(data: {
    songId?: string;
    title: string;
    artist: string;
    server: 'netease' | 'qq';
    language?: string;
    correct: boolean;
    playerName: string;
    ip?: string;
    popularity?: number;
    releaseYear?: number;
  }) {
    await this.songStatsModel.updateOne(
      { songId: data.songId || data.title, server: data.server },
      {
        $set: {
          title: data.title,
          artist: data.artist,
          language: data.language,
        },
        $inc: {
          timesGuessed: 1,
          timesGuessedCorrectly: data.correct ? 1 : 0,
        },
      },
      { upsert: true },
    );

    await this.actionLogModel.create({
      type: 'guess',
      songId: data.songId,
      title: data.title,
      artist: data.artist,
      server: data.server,
      language: data.language,
      playerName: data.playerName,
      ip: data.ip,
      correct: data.correct,
      timestamp: new Date(),
      detail: {
        popularity: data.popularity,
        releaseYear: data.releaseYear,
      },
    });
  }

  // 记录遥测数据
  async recordTelemetry(data: {
    type: string;
    source: string;
    userId?: string;
    sessionId?: string;
    data?: Record<string, any>;
    message?: string;
    stack?: string;
    url?: string;
    userAgent?: string;
    platform?: string;
    appVersion?: string;
    ip?: string;
  }): Promise<Telemetry> {
    const telemetry = new this.telemetryModel({
      ...data,
      timestamp: new Date(),
    });
    return telemetry.save();
  }

  // 记录前端错误
  async recordClientError(data: {
    message: string;
    stack?: string;
    url?: string;
    userAgent?: string;
    platform?: string;
    appVersion?: string;
    userId?: string;
    sessionId?: string;
    additionalData?: Record<string, any>;
    ip?: string;
  }): Promise<Telemetry> {
    return this.recordTelemetry({
      type: 'error',
      source: 'client',
      ...data,
      data: data.additionalData,
    });
  }

  // 记录后端错误
  async recordServerError(data: {
    message: string;
    stack?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    additionalData?: Record<string, any>;
    ip?: string;
  }): Promise<Telemetry> {
    return this.recordTelemetry({
      type: 'error',
      source: 'server',
      message: data.message,
      stack: data.stack,
      data: {
        endpoint: data.endpoint,
        method: data.method,
        statusCode: data.statusCode,
        ...data.additionalData,
      },
    });
  }

  // 记录游戏开始
  async recordGameStart(room: Room): Promise<GameStats> {
    const gameStats = new this.gameStatsModel({
      roomId: room.id,
      roomName: room.name,
      hostName: room.hostName,
      roundCount: 0,
      playerCount: room.players.size,
      players: Array.from(room.players.values()).map((p) => ({
        name: p.name,
        score: 0,
        correctGuesses: 0,
        totalGuesses: 0,
        songsSubmitted: 0,
      })),
      rounds: [],
      startTime: new Date(),
      completed: false,
      settings: {
        lyricsLineCount: room.settings.lyricsLineCount,
        endOnFirstCorrect: room.settings.endOnFirstCorrect,
        maxGuessesPerRound: room.settings.maxGuessesPerRound,
      },
    });
    return gameStats.save();
  }

  // 记录游戏结束
  async recordGameEnd(
    room: Room,
    finalScores: PlayerScore[],
    winner: string,
  ): Promise<void> {
    const endTime = new Date();

    // 更新游戏统计
    await this.gameStatsModel.updateOne(
      { roomId: room.id, completed: false },
      {
        $set: {
          endTime,
          duration:
            room.roundHistory.length > 0
              ? Math.floor(
                  (endTime.getTime() - room.roundHistory[0].startTime) / 1000,
                )
              : 0,
          roundCount: room.roundHistory.length,
          completed: true,
          players: finalScores.map((s) => ({
            name: s.name,
            score: s.score,
            correctGuesses: s.correctGuesses,
            totalGuesses: s.totalGuesses,
            songsSubmitted:
              room.players.get(
                Array.from(room.players.entries()).find(
                  ([_, p]) => p.name === s.name,
                )?.[0] || '',
              )?.songsSubmitted || 0,
          })),
          rounds: room.roundHistory.map((r, i) => ({
            roundNumber: i + 1,
            songTitle: r.song?.title || '',
            songArtist: r.song?.artist || '',
            submittedBy: r.submitterName,
            correctGuessers: r.correctGuessers,
            duration: r.endTime
              ? Math.floor((r.endTime - r.startTime) / 1000)
              : 0,
          })),
        },
      },
    );

    // 更新玩家统计
    const today = new Date().toISOString().split('T')[0];
    for (const score of finalScores) {
      const isWinner = score.name === winner;
      const player = Array.from(room.players.values()).find(
        (p) => p.name === score.name,
      );

      await this.playerStatsModel.updateOne(
        { playerName: score.name },
        {
          $inc: {
            totalGames: 1,
            totalScore: score.score,
            totalWins: isWinner ? 1 : 0,
            correctGuesses: score.correctGuesses,
            totalGuesses: score.totalGuesses,
            songsSubmitted: player?.songsSubmitted || 0,
          },
          $set: {
            lastPlayedAt: endTime,
          },
          $push: {
            recentRooms: {
              $each: [room.id],
              $slice: -10, // 只保留最近10个房间
            },
          },
          $setOnInsert: {
            playerName: score.name,
            roomsHosted: 0,
            achievements: [],
            dailyStats: {},
          },
        },
        { upsert: true },
      );

      // 更新每日统计
      await this.playerStatsModel.updateOne(
        { playerName: score.name },
        {
          $inc: {
            [`dailyStats.${today}.games`]: 1,
            [`dailyStats.${today}.wins`]: isWinner ? 1 : 0,
            [`dailyStats.${today}.score`]: score.score,
          },
        },
      );
    }
  }

  // 获取遥测数据
  async getTelemetry(options: {
    type?: string;
    source?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
  }): Promise<{ data: Telemetry[]; total: number }> {
    const query: any = {};

    if (options.type) query.type = options.type;
    if (options.source) query.source = options.source;
    if (options.startDate || options.endDate) {
      query.timestamp = {};
      if (options.startDate) query.timestamp.$gte = options.startDate;
      if (options.endDate) query.timestamp.$lte = options.endDate;
    }

    const total = await this.telemetryModel.countDocuments(query);
    const data = await this.telemetryModel
      .find(query)
      .sort({ timestamp: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .exec();

    return { data, total };
  }

  // 获取游戏统计
  async getGameStats(options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
  }): Promise<{ data: GameStats[]; total: number }> {
    const query: any = {};

    if (options.startDate || options.endDate) {
      query.startTime = {};
      if (options.startDate) query.startTime.$gte = options.startDate;
      if (options.endDate) query.startTime.$lte = options.endDate;
    }

    const total = await this.gameStatsModel.countDocuments(query);
    const data = await this.gameStatsModel
      .find(query)
      .sort({ startTime: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .exec();

    return { data, total };
  }

  // 获取排行榜
  async getLeaderboard(limit = 10): Promise<PlayerStats[]> {
    return this.playerStatsModel
      .find()
      .sort({ totalScore: -1 })
      .limit(limit)
      .exec();
  }

  // 获取仪表盘数据
  async getDashboardStats(): Promise<{
    totalGames: number;
    totalPlayers: number;
    activeToday: number;
    errorCount24h: number;
    recentGames: GameStats[];
    topPlayers: PlayerStats[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [
      totalGames,
      totalPlayers,
      activeToday,
      errorCount24h,
      recentGames,
      topPlayers,
    ] = await Promise.all([
      this.gameStatsModel.countDocuments({ completed: true }),
      this.playerStatsModel.countDocuments(),
      this.playerStatsModel.countDocuments({ lastPlayedAt: { $gte: today } }),
      this.telemetryModel.countDocuments({
        type: 'error',
        timestamp: { $gte: yesterday },
      }),
      this.gameStatsModel
        .find({ completed: true })
        .sort({ startTime: -1 })
        .limit(5)
        .exec(),
      this.playerStatsModel.find().sort({ totalScore: -1 }).limit(5).exec(),
    ]);

    return {
      totalGames,
      totalPlayers,
      activeToday,
      errorCount24h,
      recentGames,
      topPlayers,
    };
  }

  // 获取错误统计
  async getErrorStats(): Promise<{
    clientErrors: number;
    serverErrors: number;
    recentErrors: Telemetry[];
  }> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const [clientErrors, serverErrors, recentErrors] = await Promise.all([
      this.telemetryModel.countDocuments({
        type: 'error',
        source: 'client',
        timestamp: { $gte: yesterday },
      }),
      this.telemetryModel.countDocuments({
        type: 'error',
        source: 'server',
        timestamp: { $gte: yesterday },
      }),
      this.telemetryModel
        .find({ type: 'error' })
        .sort({ timestamp: -1 })
        .limit(20)
        .exec(),
    ]);

    return {
      clientErrors,
      serverErrors,
      recentErrors,
    };
  }

  async getActivity(rangeDays = 7): Promise<{
    rangeDays: number;
    activeIpCount: number;
    guessCount: number;
    errorCount: number;
    series: Array<{
      date: string;
      guesses: number;
      errors: number;
      activeIps: number;
    }>;
  }> {
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const [activeIpsRaw, guessCount, errorCount, guessSeries, errorSeries] =
      await Promise.all([
        this.actionLogModel.distinct('ip', { timestamp: { $gte: since } }),
        this.actionLogModel.countDocuments({
          type: 'guess',
          timestamp: { $gte: since },
        }),
        this.telemetryModel.countDocuments({
          type: 'error',
          timestamp: { $gte: since },
        }),
        this.actionLogModel.aggregate([
          { $match: { type: 'guess', timestamp: { $gte: since } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
              },
              count: { $sum: 1 },
              ips: { $addToSet: '$ip' },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.telemetryModel.aggregate([
          { $match: { type: 'error', timestamp: { $gte: since } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    const map = new Map<
      string,
      { guesses: number; errors: number; activeIps: Set<string> }
    >();
    for (const g of guessSeries) {
      map.set(g._id, {
        guesses: g.count,
        errors: 0,
        activeIps: new Set(g.ips.filter(Boolean)),
      });
    }
    for (const e of errorSeries) {
      const entry = map.get(e._id) || {
        guesses: 0,
        errors: 0,
        activeIps: new Set<string>(),
      };
      entry.errors = e.count;
      map.set(e._id, entry);
    }

    const series = Array.from(map.entries()).map(([date, value]) => ({
      date,
      guesses: value.guesses,
      errors: value.errors,
      activeIps: value.activeIps.size,
    }));

    return {
      rangeDays,
      activeIpCount: activeIpsRaw.filter(Boolean).length,
      guessCount,
      errorCount,
      series,
    };
  }
}
