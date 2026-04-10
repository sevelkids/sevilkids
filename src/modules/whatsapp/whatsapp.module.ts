import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DentistModule } from '../integrations/dentist/dentist.module';
import { BitrixModule } from '../integrations/bitrix/bitrix.module';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppSessionService } from './whatsapp.session';
import { WhatsAppMessagesService } from './whatsapp.messages';
import { GeminiNluService } from '../nlu/gemini-nlu.service';
import { WhatsAppAutomationService } from './whatsapp.automation.service';
import { WhatsAppController } from './whatsapp.controller';
import { BookingDraftService } from './booking-draft.service';
import { WhatsAppHistoryFallbackService } from './whatsapp.history-fallback.service';
import { OutboundRouterService } from './outbound-router.service';
import { WhatsAppClientService } from './whatsapp.client.service';
import { WhatsAppScriptCatalog } from './whatsapp.script-catalog';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        DentistModule,
        BitrixModule,
    ],
    controllers: [WhatsAppController],
    providers: [
        WhatsAppService,
        WhatsAppSessionService,
        WhatsAppMessagesService,
        WhatsAppScriptCatalog,
        BookingDraftService,
        WhatsAppHistoryFallbackService,
        OutboundRouterService,
        WhatsAppClientService,
        GeminiNluService,
        WhatsAppAutomationService,
    ],
    exports: [WhatsAppService, OutboundRouterService, WhatsAppSessionService, WhatsAppHistoryFallbackService],
})
export class WhatsAppModule {}
