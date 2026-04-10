import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ChatMode } from '../whatsapp.types';

export class UpdateChatModeDto {
    @IsString()
    currentMode!: ChatMode;

    @IsOptional()
    @IsBoolean()
    allowBotReplies?: boolean;

    @IsOptional()
    @IsString()
    assignedOperatorId?: string;

    @IsOptional()
    @IsString()
    handoffReason?: string;
}
