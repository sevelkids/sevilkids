import { Module } from '@nestjs/common';
import { DoctorsDirectoryService } from './doctors-directory.service';

@Module({
    providers: [DoctorsDirectoryService],
    exports: [DoctorsDirectoryService],
})
export class DoctorsModule {}