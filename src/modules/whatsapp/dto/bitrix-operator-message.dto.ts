import { IsObject, IsOptional, IsString } from 'class-validator';

export class BitrixOperatorMessageDto {
    @IsString()
    sessionId!: string;

    @IsString()
    text!: string;

    @IsOptional()
    @IsString()
    operatorId?: string;

    @IsOptional()
    @IsString()
    bitrixMessageId?: string;

    @IsOptional()
    @IsObject()
    payload?: Record<string, unknown>;
}
