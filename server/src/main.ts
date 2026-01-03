import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 启用CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 设置全局前缀（可选，用于反向代理）
  const globalPrefix = process.env.API_PREFIX || '';
  if (globalPrefix) {
    app.setGlobalPrefix(globalPrefix);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🎵 Song Guessr Server running on port ${port}`);
}

bootstrap();
