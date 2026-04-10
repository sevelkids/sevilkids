"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const child_process_1 = require("child_process");
const express_1 = require("express");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.use((0, express_1.json)({ limit: '1mb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '1mb' }));
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
    }));
    const port = Number(process.env.PORT || 3000);
    await app.listen(port);
    console.log(`Server running on http://localhost:${port}/api`);
    const chatConsoleUrl = `http://localhost:${port}/api/whatsapp/console`;
    console.log(`Chat console available at ${chatConsoleUrl}`);
    const shouldAutoOpen = String(process.env.WHATSAPP_CHAT_CONSOLE_AUTO_OPEN || 'true').toLowerCase() === 'true' &&
        String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';
    if (shouldAutoOpen) {
        setTimeout(() => {
            const command = process.platform === 'win32'
                ? `start "" "${chatConsoleUrl}"`
                : process.platform === 'darwin'
                    ? `open "${chatConsoleUrl}"`
                    : `xdg-open "${chatConsoleUrl}"`;
            (0, child_process_1.exec)(command, (error) => {
                if (error) {
                    console.warn(`Could not auto-open chat console: ${error.message}`);
                }
            });
        }, 1200);
    }
}
bootstrap();
//# sourceMappingURL=main.js.map