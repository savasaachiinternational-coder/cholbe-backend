import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors({ origin: true, credentials: true });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const config = app.get(ConfigService);
  const appName = config.get<string>('APP_NAME', 'Cholbe Pharmacy API');

  const swaggerConfig = new DocumentBuilder()
    .setTitle(appName)
    .setDescription(
      'REST API for Cholbe Pharmacy mobile app.\n\n' +
        '**Medicine upload (2 paths):**\n' +
        '- Doctor → `POST /api/v1/medicines/doctor`\n' +
        '- Vendor → `POST /api/v1/vendor/products` (creates sellable inventory)\n' +
        '- Admin → `POST /api/v1/medicines/admin`\n\n' +
        '**Checkout flow:** cart → addresses → `POST /orders/checkout` → payment confirm',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('Auth')
    .addTag('Users')
    .addTag('Medicines')
    .addTag('Vendor Products')
    .addTag('Reports')
    .addTag('Prescriptions')
    .addTag('Cart')
    .addTag('Orders')
    .addTag('Addresses')
    .addTag('Vendors')
    .addTag('Doctors')
    .addTag('Admin')
    .addTag('Uploads')
    .addTag('Medication Schedules')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Cholbe API: http://localhost:${port}/api/v1`);
  console.log(`Swagger:    http://localhost:${port}/docs`);
}

bootstrap();
