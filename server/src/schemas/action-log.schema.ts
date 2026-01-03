import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActionLogDocument = ActionLog & Document;

export type ActionType = 'submit' | 'guess' | 'music_request';

@Schema({ timestamps: true })
export class ActionLog {
  @Prop({ required: true, enum: ['submit', 'guess', 'music_request'] })
  type: ActionType;

  @Prop()
  playerName?: string;

  @Prop()
  ip?: string;

  @Prop()
  songId?: string;

  @Prop()
  title?: string;

  @Prop()
  artist?: string;

  @Prop()
  server?: 'netease' | 'qq';

  @Prop()
  language?: string;

  @Prop({ type: Object })
  detail?: Record<string, any>;

  @Prop()
  correct?: boolean;

  @Prop()
  timestamp?: Date;
}

export const ActionLogSchema = SchemaFactory.createForClass(ActionLog);
ActionLogSchema.index({ type: 1, timestamp: -1 });
ActionLogSchema.index({ songId: 1, server: 1 });
ActionLogSchema.index({ ip: 1, timestamp: -1 });
