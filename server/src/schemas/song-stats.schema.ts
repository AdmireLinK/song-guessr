import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SongStatsDocument = SongStats & Document;

@Schema({ timestamps: false })
export class SongStats {
  @Prop({ required: true })
  songId: string; // 音乐平台的歌曲ID

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  artist: string;

  @Prop({ required: true, enum: ['netease', 'qq'] })
  server: string;

  @Prop()
  pictureUrl?: string;

  @Prop()
  album?: string;

  @Prop()
  language?: string;

  @Prop()
  releaseYear?: number;

  @Prop()
  popularity?: number;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop({ default: 0 })
  timesAsQuestion: number; // 作为出题歌曲的次数

  @Prop({ default: 0 })
  timesGuessed: number; // 被猜测的次数

  @Prop({ default: 0 })
  timesGuessedCorrectly: number; // 被猜对的次数
}

export const SongStatsSchema = SchemaFactory.createForClass(SongStats);

// 创建复合索引确保唯一性
SongStatsSchema.index({ songId: 1, server: 1 }, { unique: true });
