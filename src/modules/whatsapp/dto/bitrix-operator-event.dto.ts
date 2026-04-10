import { IsObject, IsOptional, IsString } from 'class-validator';

export class BitrixOperatorEventDto {
    @IsString()
    sessionId!: string;

    @IsString()
    eventType!: string;

    @IsOptional()
    @IsString()
    operatorId?: string;

    @IsOptional()
    @IsString()
    lineId?: string;

    @IsOptional()
    @IsString()
    chatId?: string;

    @IsOptional()
    @IsString()
    dialogId?: string;

    @IsOptional()
    @IsObject()
    payload?: Record<string, unknown>;
}
