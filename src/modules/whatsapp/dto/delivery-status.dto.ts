import { IsOptional, IsString } from 'class-validator';

export class DeliveryStatusDto {
    @IsString()
    messageLogId!: string;

    @IsString()
    status!: 'sent' | 'delivered' | 'failed';

    @IsOptional()
    @IsString()
    whatsappMessageId?: string;

    @IsOptional()
    @IsString()
    errorMessage?: string;
}
