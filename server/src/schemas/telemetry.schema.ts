import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TelemetryDocument = Telemetry & Document;

@Schema({ timestamps: true })
export class Telemetry {
  @Prop({ required: true })
  type: string; // 'error' | 'event' | 'performance'

  @Prop({ required: true })
  source: string; // 'client' | 'server'

  @Prop()
  userId?: string;

  @Prop()
  sessionId?: string;

  @Prop({ type: Object })
  data: Record<string, any>;

  @Prop()
  message?: string;

  @Prop()
  stack?: string;

  @Prop()
  url?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  platform?: string; // 'web' | 'android' | 'windows'

  @Prop()
  appVersion?: string;

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const TelemetrySchema = SchemaFactory.createForClass(Telemetry);

// 添加索引以提高查询性能
TelemetrySchema.index({ type: 1, timestamp: -1 });
TelemetrySchema.index({ source: 1, timestamp: -1 });
TelemetrySchema.index({ userId: 1 });
