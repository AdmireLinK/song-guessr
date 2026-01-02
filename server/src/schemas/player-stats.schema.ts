import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlayerStatsDocument = PlayerStats & Document;

@Schema({ timestamps: true })
export class PlayerStats {
  @Prop({ required: true, unique: true })
  playerName: string;

  @Prop({ default: 0 })
  totalGames: number;

  @Prop({ default: 0 })
  totalScore: number;

  @Prop({ default: 0 })
  totalWins: number;

  @Prop({ default: 0 })
  correctGuesses: number;

  @Prop({ default: 0 })
  totalGuesses: number;

  @Prop({ default: 0 })
  songsSubmitted: number;

  @Prop({ default: 0 })
  roomsHosted: number;

  @Prop()
  lastPlayedAt?: Date;

  @Prop({ type: [String], default: [] })
  recentRooms: string[];

  // 成就系统
  @Prop({ type: [String], default: [] })
  achievements: string[];

  // 每日统计
  @Prop({ type: Object, default: {} })
  dailyStats: Record<string, {
    games: number;
    wins: number;
    score: number;
  }>;
}

export const PlayerStatsSchema = SchemaFactory.createForClass(PlayerStats);

// 添加索引
PlayerStatsSchema.index({ totalScore: -1 });
PlayerStatsSchema.index({ totalWins: -1 });
PlayerStatsSchema.index({ lastPlayedAt: -1 });
