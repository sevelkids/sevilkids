import { IsBoolean } from 'class-validator';

export class ChatConsoleToggleDto {
    @IsBoolean()
    enabled!: boolean;
}
