import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin-auth.service';
import { StatsService } from './stats.service';
import { AdminGuard } from './admin.guard';
import {
  Telemetry,
  TelemetrySchema,
  GameStats,
  GameStatsSchema,
  SongStats,
  SongStatsSchema,
  DailyStats,
  DailyStatsSchema,
} from '../schemas';
import { GameModule } from '../game/game.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Telemetry.name, schema: TelemetrySchema },
      { name: GameStats.name, schema: GameStatsSchema },
      { name: SongStats.name, schema: SongStatsSchema },
      { name: DailyStats.name, schema: DailyStatsSchema },
    ]),
    forwardRef(() => GameModule),
  ],
  controllers: [AdminController],
  providers: [AdminAuthService, StatsService, AdminGuard],
  exports: [StatsService, AdminAuthService],
})
export class AdminModule {}
