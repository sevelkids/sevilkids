import { IsString, MinLength } from 'class-validator';

export class ChatConsoleSendDto {
    @IsString()
    @MinLength(1)
    text!: string;
}
