import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';

type AdminIdentity = { username: string };

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  private getAdminUser(): { username: string; password: string } {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASS || 'admin123';
    return { username, password };
  }

  private getTokenSecret(): string {
    // 建议设置 ADMIN_TOKEN_SECRET；未设置则退化到 ADMIN_PASS
    return process.env.ADMIN_TOKEN_SECRET || this.getAdminUser().password;
  }

  private signToken(username: string, issuedAtMs: number): string {
    const secret = this.getTokenSecret();
    // 轻量签名（不引入 JWT 依赖）：base64(username:ts:secret)
    return Buffer.from(`${username}:${issuedAtMs}:${secret}`).toString(
      'base64',
    );
  }

  private parseToken(
    token: string,
  ): { username: string; issuedAtMs: number; secret: string } | null {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [username, ts, secret] = decoded.split(':');
      const issuedAtMs = Number(ts);
      if (!username || !Number.isFinite(issuedAtMs) || !secret) return null;
      return { username, issuedAtMs, secret };
    } catch {
      return null;
    }
  }

  async login(username: string, password: string, ip: string) {
    const admin = this.getAdminUser();
    if (username !== admin.username || password !== admin.password) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const issuedAtMs = Date.now();
    const token = this.signToken(username, issuedAtMs);

    this.logger.log(`Admin login: ${username} from ${ip}`);

    return {
      success: true,
      token,
      username: admin.username,
    };
  }

  async changePassword(
    username: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const admin = this.getAdminUser();
    if (username !== admin.username) {
      throw new UnauthorizedException('用户不存在');
    }
    if (oldPassword !== admin.password) {
      throw new UnauthorizedException('原密码错误');
    }
    // 按需求：不保存 adminusers，不支持持久化改密
    void newPassword;
    return false;
  }

  async verifyToken(token: string): Promise<AdminIdentity | null> {
    const parsed = this.parseToken(token);
    if (!parsed) return null;

    const admin = this.getAdminUser();
    if (parsed.username !== admin.username) return null;
    if (parsed.secret !== this.getTokenSecret()) return null;

    // 令牌有效期：7天
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.issuedAtMs > maxAgeMs) return null;

    return { username: admin.username };
  }
}
