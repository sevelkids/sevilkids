import { IsOptional, IsString } from 'class-validator';

export class ManualPaymentConfirmDto {
    @IsOptional()
    @IsString()
    confirmedBy?: string;

    @IsOptional()
    @IsString()
    paymentProvider?: string;

    @IsOptional()
    @IsString()
    note?: string;
}
