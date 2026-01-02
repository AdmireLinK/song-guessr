import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { MusicService } from './game/music.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly musicService: MusicService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/health')
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('api/music/search')
  async searchMusic(
    @Query('keyword') keyword: string,
    @Query('server') server: 'netease' | 'qq' = 'netease',
  ) {
    if (!keyword) {
      return [];
    }
    return this.musicService.searchSongs(keyword, server);
  }
}
