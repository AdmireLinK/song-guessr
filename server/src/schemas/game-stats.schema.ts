import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 说明：该 schema 当前未在 AdminModule 中注册（不再写入 GameStats 明细）。
// 保留文件仅为兼容旧代码参考；避免使用 collection: 'tests' 这类临时集合名。
export type GameStatsDocument = GameStats & Document;

@Schema({ timestamps: true })
export class GameStats {
  @Prop({ required: true })
  roomId: string;

  @Prop({ required: true })
  roomName: string;

  @Prop({ required: true })
  hostName: string;

  @Prop({ required: true })
  roundCount: number;

  @Prop({ required: true })
  playerCount: number;

  @Prop({ type: [Object], default: [] })
  players: Array<{
    name: string;
    score: number;
    correctGuesses: number;
    totalGuesses: number;
    songsSubmitted: number;
  }>;

  @Prop({ type: [Object], default: [] })
  rounds: Array<{
    roundNumber: number;
    songTitle: string;
    songArtist: string;
    submittedBy: string;
    correctGuessers: string[];
    duration: number; // 回合时长（秒）
  }>;

  @Prop({ required: true })
  startTime: Date;

  @Prop()
  endTime?: Date;

  @Prop()
  duration?: number; // 游戏总时长（秒）

  @Prop({ default: false })
  completed: boolean;

  @Prop({ type: Object })
  settings: {
    lyricsLineCount: number;
    endOnFirstCorrect: boolean;
    maxGuessesPerRound: number;
  };
}

export const GameStatsSchema = SchemaFactory.createForClass(GameStats);

// 添加索引
GameStatsSchema.index({ startTime: -1 });
GameStatsSchema.index({ hostName: 1 });
GameStatsSchema.index({ completed: 1 });
