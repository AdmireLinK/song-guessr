import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  Delete,
  Param,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { StatsService } from './stats.service';
import { AdminGuard } from './admin.guard';
import { RoomService } from '../game/room.service';
import { GameGateway } from '../game/game.gateway';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly statsService: StatsService,
    private readonly roomService: RoomService,
    private readonly gameGateway: GameGateway,
  ) {}

  // 登录
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { username: string; password: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const res = await this.adminAuthService.login(
      body.username,
      body.password,
      ip,
    );
    return {
      ...res,
      admin: { username: res.username },
    };
  }

  // 修改密码
  @Post('change-password')
  @UseGuards(AdminGuard)
  async changePassword(
    @Body() body: { oldPassword: string; newPassword: string },
    @Req() req: Request,
  ) {
    const username = (req as any).admin?.username;
    const success = await this.adminAuthService.changePassword(
      username,
      body.oldPassword,
      body.newPassword,
    );
    return { success };
  }

  // 仪表盘数据
  @Get('dashboard')
  @UseGuards(AdminGuard)
  async getDashboard() {
    return this.statsService.getDashboardStats();
  }

  // 获取游戏统计
  @Get('stats/games')
  @UseGuards(AdminGuard)
  async getGameStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.statsService.getGameStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
    });
  }

  // 获取排行榜
  @Get('stats/leaderboard')
  @UseGuards(AdminGuard)
  async getLeaderboard(@Query('limit') limit?: string) {
    return this.statsService.getLeaderboard(limit ? parseInt(limit, 10) : 10);
  }

  // 获取遥测数据
  @Get('telemetry')
  @UseGuards(AdminGuard)
  async getTelemetry(
    @Query('type') type?: string,
    @Query('source') source?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.statsService.getTelemetry({
      type,
      source,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
    });
  }

  // 获取错误统计
  @Get('errors')
  @UseGuards(AdminGuard)
  async getErrorStats() {
    return this.statsService.getErrorStats();
  }

  // 获取当前活跃房间
  @Get('rooms')
  @UseGuards(AdminGuard)
  async getRooms() {
    const rooms = this.roomService.getAllRoomsDetailed();
    return rooms.map((room) => ({
      id: room.id,
      name: room.name,
      hostName: room.hostName,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      status: room.status,
      isPrivate: room.isPrivate,
      createdAt: room.createdAt,
      currentRound: room.currentRound?.roundNumber || null,
      players: this.roomService.getPlayerInfo(room),
    }));
  }

  // 解散房间
  @Delete('rooms/:roomId')
  @UseGuards(AdminGuard)
  async dissolveRoom(@Param('roomId') roomId: string) {
    this.gameGateway.dissolveRoom(roomId);
    return { success: true };
  }

  // 接收前端错误报告
  @Post('report-error')
  async reportError(
    @Body()
    body: {
      message: string;
      stack?: string;
      url?: string;
      userAgent?: string;
      platform?: string;
      appVersion?: string;
      userId?: string;
      sessionId?: string;
      additionalData?: Record<string, any>;
    },
    @Req() req: Request,
  ) {
    await this.statsService.recordClientError({
      ...body,
      ip: req.ip || req.socket.remoteAddress,
    });
    return { success: true };
  }

  // 记录前端事件
  @Post('telemetry')
  async recordTelemetry(
    @Body()
    body: {
      type: string;
      data?: Record<string, any>;
      userId?: string;
      sessionId?: string;
      platform?: string;
      appVersion?: string;
    },
  ) {
    // 仅保留错误类遥测
    if (body.type === 'error') {
      await this.statsService.recordTelemetry({
        ...body,
        source: 'client',
      });
    }
    return { success: true };
  }

  // 活跃与错误/猜测统计
  @Get('activity')
  @UseGuards(AdminGuard)
  async getActivity(@Query('range') range?: string) {
    const days = range ? parseInt(range, 10) : 7;
    return this.statsService.getActivity(isNaN(days) ? 7 : days);
  }

  // 管理员踢人
  @Post('rooms/:roomId/kick')
  @UseGuards(AdminGuard)
  async adminKick(
    @Param('roomId') roomId: string,
    @Body() body: { playerName: string },
  ) {
    const success = this.gameGateway.adminKickPlayer(roomId, body.playerName);
    return { success };
  }

  // 管理员转移房主
  @Post('rooms/:roomId/transfer-host')
  @UseGuards(AdminGuard)
  async adminTransferHost(
    @Param('roomId') roomId: string,
    @Body() body: { playerName: string },
  ) {
    const success = this.gameGateway.adminTransferHost(roomId, body.playerName);
    return { success };
  }

  // 置顶出题人提交曲目（下一轮优先）
  @Post('rooms/:roomId/assign-submitter')
  @UseGuards(AdminGuard)
  async adminAssignSubmitter(
    @Param('roomId') roomId: string,
    @Body() body: { playerName: string },
  ) {
    const success = this.gameGateway.adminPrioritizeSubmitter(
      roomId,
      body.playerName,
    );
    return { success };
  }
}
