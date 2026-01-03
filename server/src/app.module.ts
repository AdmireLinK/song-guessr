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
    // 静态文件服务（仅托管前端构建产物；管理面板改为前端 /admin 路由 + 调用 /api/admin）
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'client', 'dist'),
      // path-to-regexp v8 不支持 "/api/*"（缺少参数名），这里用“带名字的通配符”写法。
      // 语法：/api/*path 代表 /api/ 后的任意段。
      exclude: [
        '/api',
        '/api/*path',
        '/game',
        '/game/*path',
      ],
    }),
    GameModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, MusicService],
})
export class AppModule {}
