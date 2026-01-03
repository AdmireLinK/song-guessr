import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminUser } from '../schemas/admin-user.schema';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUser>,
  ) {}

  async onModuleInit() {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASS || 'admin123';

    const exists = await this.adminUserModel.findOne({ username });
    if (!exists) {
      const passwordHash = bcrypt.hashSync(password, 10);
      await this.adminUserModel.create({ username, passwordHash });
      this.logger.warn(
        `Super admin created. Username: ${username}, Password: ${password}`,
      );
    } else {
      this.logger.log(`Super admin ready. Username: ${username}`);
    }
  }

  async login(username: string, password: string, ip: string) {
    const user = await this.adminUserModel.findOne({ username });

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // Use bcryptjs for password comparison
    const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // Generate a simple token (in production, use proper JWT)
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');

    // Update last login
    await this.adminUserModel.updateOne(
      { _id: user._id },
      {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    );

    return {
      success: true,
      token,
      username: user.username,
    };
  }

  async changePassword(
    username: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.adminUserModel.findOne({ username });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    // Verify old password
    const isPasswordValid = bcrypt.compareSync(oldPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('原密码错误');
    }

    // Hash new password with bcryptjs
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    await this.adminUserModel.updateOne(
      { _id: user._id },
      { passwordHash: hashedPassword },
    );

    return true;
  }

  async verifyToken(token: string): Promise<AdminUser | null> {
    try {
      // Simple token verification
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [username] = decoded.split(':');

      const user = await this.adminUserModel.findOne({ username });
      return user || null;
    } catch (error) {
      return null;
    }
  }
}
