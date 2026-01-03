import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { AdminModule } from './admin/admin.module';
import { MusicService } from './game/music.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/song-guessr',
    ),
    ScheduleModule.forRoot(),
    // 静态文件服务（用于管理面板和前端）
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/admin',
      // Use simple path and wildcard patterns that path-to-regexp understands
      exclude: ['/api', '/api/*', '/game', '/game/*'],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'client', 'dist'),
      exclude: ['/api', '/api/*', '/game', '/game/*', '/admin', '/admin/*'],
    }),
    GameModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, MusicService],
})
export class AppModule {}
