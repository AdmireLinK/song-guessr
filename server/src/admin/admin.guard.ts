import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    const token = authHeader.substring(7);
    const user = await this.adminAuthService.verifyToken(token);

    if (!user) {
      throw new UnauthorizedException('认证令牌无效或已过期');
    }

    request.admin = user;
    return true;
  }
}
