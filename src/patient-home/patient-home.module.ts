import { Module } from '@nestjs/common';
import { PatientHomeController } from './patient-home.controller';
import { PatientHomeService } from './patient-home.service';

@Module({
  controllers: [PatientHomeController],
  providers: [PatientHomeService],
})
export class PatientHomeModule {}
