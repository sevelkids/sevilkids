import { Module } from '@nestjs/common';
import { BitrixService } from './bitrix.service';
import { BitrixOpenLinesService } from './bitrix-openlines.service';

@Module({
    providers: [BitrixService, BitrixOpenLinesService],
    exports: [BitrixService, BitrixOpenLinesService],
})
export class BitrixModule {}
