import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DailyStatsDocument = DailyStats & Document;

// 按天/时间段聚合统计（避免保存过细粒度的玩家/动作日志）
@Schema({ timestamps: true })
export class DailyStats {
  // YYYY-MM-DD
  @Prop({ required: true, unique: true })
  date: string;

  @Prop({ default: 0 })
  games: number;

  @Prop({ default: 0 })
  guesses: number;

  @Prop({ default: 0 })
  errors: number;

  // 当天观测到的玩家数（简单口径：游戏开始时玩家数取 max）
  @Prop({ default: 0 })
  players: number;
}

export const DailyStatsSchema = SchemaFactory.createForClass(DailyStats);
DailyStatsSchema.index({ date: 1 }, { unique: true });
