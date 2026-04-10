import { IsObject, IsOptional, IsString } from 'class-validator';

export class IncomingWhatsAppDto {
    @IsString()
    messageId!: string;

    @IsString()
    from!: string;

    @IsString()
    phoneNumber!: string;

    @IsString()
    text!: string;

    @IsOptional()
    @IsString()
    whatsappChatId?: string;

    @IsOptional()
    @IsString()
    externalChatId?: string;

    @IsOptional()
    @IsObject()
    payload?: Record<string, unknown>;
}
