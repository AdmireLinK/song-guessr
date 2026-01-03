import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telemetry, TelemetryDocument } from '../schemas/telemetry.schema';
import { GameStats, GameStatsDocument } from '../schemas/game-stats.schema';
import { SongStats, SongStatsDocument } from '../schemas/song-stats.schema';
import { DailyStats, DailyStatsDocument } from '../schemas/daily-stats.schema';
import { Room, PlayerScore } from '../game/game.types';

@Injectable()
export class StatsService {
  constructor(
    @InjectModel(Telemetry.name)
    private telemetryModel: Model<TelemetryDocument>,
    @InjectModel(GameStats.name)
    private gameStatsModel: Model<GameStatsDocument>,
    @InjectModel(SongStats.name)
    private songStatsModel: Model<SongStatsDocument>,
    @InjectModel(DailyStats.name)
    private dailyStatsModel: Model<DailyStatsDocument>,
  ) {}

  private todayKey(date = new Date()): string {
    return date.toISOString().split('T')[0];
  }

  private async incDaily(
    dateKey: string,
    inc: Partial<Record<'games' | 'guesses' | 'errors', number>>,
    max?: Partial<Record<'players', number>>,
  ) {
    const update: any = {
      $setOnInsert: { date: dateKey },
    };
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (max && Object.keys(max).length > 0) update.$max = max;

    await this.dailyStatsModel.updateOne({ date: dateKey }, update, {
      upsert: true,
    });
  }

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
    // 按需求：不保存 action logs，也不保存细粒度的 music request
    void data;
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

    void data;
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
          popularity: data.popularity,
          releaseYear: data.releaseYear,
        },
        $inc: {
          timesGuessed: 1,
          timesGuessedCorrectly: data.correct ? 1 : 0,
        },
      },
      { upsert: true },
    );

    await this.incDaily(this.todayKey(), { guesses: 1 });

    void data;
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
    const saved = await telemetry.save();

    // 仅聚合存储错误计数
    if (data.type === 'error') {
      await this.incDaily(this.todayKey(), { errors: 1 });
    }

    return saved;
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
    await this.incDaily(
      this.todayKey(),
      { games: 1 },
      { players: room.players.size },
    );

    const gameStats = new this.gameStatsModel({
      roomId: room.id,
      roomName: room.name,
      hostName: room.hostName,
      roundCount: 0,
      playerCount: room.players.size,
      // 仍保留游戏级数据（便于排障/基本统计），但不再维护 playerstats/actionlogs
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

    void winner;
    void room;
    void finalScores;
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
  async getLeaderboard(limit = 10): Promise<any[]> {
    // 按需求：不保存 playerstats，因此不提供排行榜数据
    void limit;
    return [];
  }

  // 获取仪表盘数据
  async getDashboardStats(): Promise<{
    totalGames: number;
    totalPlayers: number;
    activeToday: number;
    errorCount24h: number;
    recentGames: GameStats[];
    topPlayers: any[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [totalGames, todayDoc, errorCount24h, recentGames] =
      await Promise.all([
        this.gameStatsModel.countDocuments({ completed: true }),
        this.dailyStatsModel.findOne({ date: this.todayKey(today) }).exec(),
        this.telemetryModel.countDocuments({
          type: 'error',
          timestamp: { $gte: yesterday },
        }),
        this.gameStatsModel
          .find({ completed: true })
          .sort({ startTime: -1 })
          .limit(5)
          .exec(),
      ]);

    const activeToday = todayDoc?.players || 0;
    // 没有 playerstats 时，“总玩家数”仅提供一个粗口径：取最近 30 天内每日玩家数的最大值
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sinceKey = this.todayKey(since30d);
    const maxPlayersAgg = await this.dailyStatsModel
      .aggregate([
        { $match: { date: { $gte: sinceKey } } },
        { $group: { _id: null, maxPlayers: { $max: '$players' } } },
      ])
      .exec();
    const totalPlayers = maxPlayersAgg?.[0]?.maxPlayers || 0;

    return {
      totalGames,
      totalPlayers,
      activeToday,
      errorCount24h,
      recentGames,
      topPlayers: [],
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
    const sinceKey = this.todayKey(since);

    const docs = await this.dailyStatsModel
      .find({ date: { $gte: sinceKey } })
      .sort({ date: 1 })
      .exec();

    const guessCount = docs.reduce((s, d) => s + (d.guesses || 0), 0);
    const errorCount = docs.reduce((s, d) => s + (d.errors || 0), 0);
    const series = docs.map((d) => ({
      date: d.date,
      guesses: d.guesses || 0,
      errors: d.errors || 0,
      // 保持返回字段兼容：activeIps 作为“玩家数”口径
      activeIps: d.players || 0,
    }));

    return {
      rangeDays,
      guessCount,
      errorCount,
      series,
    };
  }

  // 给管理面板用的“近 N 天日统计”
  async getDailyStats(days = 7): Promise<{
    dates: string[];
    players: number[];
    games: number[];
    guesses: number[];
    errors: number[];
  }> {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setDate(start.getDate() - (Math.max(1, days) - 1));

    const startKey = this.todayKey(start);
    const docs = await this.dailyStatsModel
      .find({ date: { $gte: startKey } })
      .sort({ date: 1 })
      .exec();
    const map = new Map(docs.map((d) => [d.date, d]));

    const dates: string[] = [];
    const players: number[] = [];
    const games: number[] = [];
    const guesses: number[] = [];
    const errors: number[] = [];

    const cursor = new Date(start);
    while (cursor <= end) {
      const key = this.todayKey(cursor);
      const d = map.get(key);
      dates.push(key);
      players.push(d?.players || 0);
      games.push(d?.games || 0);
      guesses.push(d?.guesses || 0);
      errors.push(d?.errors || 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    return { dates, players, games, guesses, errors };
  }
}
