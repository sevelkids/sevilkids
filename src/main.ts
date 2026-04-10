import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { exec } from 'child_process';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.setGlobalPrefix('api');
    app.use(json({ limit: '1mb' }));
    app.use(urlencoded({ extended: true, limit: '1mb' }));

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: false,
        }),
    );

    const port = Number(process.env.PORT || 3000);
    await app.listen(port);

    console.log(`Server running on http://localhost:${port}/api`);
    const chatConsoleUrl = `http://localhost:${port}/api/whatsapp/console`;
    console.log(`Chat console available at ${chatConsoleUrl}`);

    const shouldAutoOpen =
        String(process.env.WHATSAPP_CHAT_CONSOLE_AUTO_OPEN || 'true').toLowerCase() === 'true' &&
        String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';

    if (shouldAutoOpen) {
        setTimeout(() => {
            const command =
                process.platform === 'win32'
                    ? `start "" "${chatConsoleUrl}"`
                    : process.platform === 'darwin'
                        ? `open "${chatConsoleUrl}"`
                        : `xdg-open "${chatConsoleUrl}"`;

            exec(command, (error) => {
                if (error) {
                    console.warn(`Could not auto-open chat console: ${error.message}`);
                }
            });
        }, 1200);
    }
}

bootstrap();
