import { Module, forwardRef } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomService } from './room.service';
import { MusicService } from './music.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [forwardRef(() => AdminModule)],
  providers: [GameGateway, RoomService, MusicService],
  exports: [GameGateway, RoomService, MusicService],
})
export class GameModule {}
