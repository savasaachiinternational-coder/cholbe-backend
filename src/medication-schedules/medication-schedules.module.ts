import { Module } from '@nestjs/common';
import { MedicationSchedulesService } from './medication-schedules.service';
import { MedicationSchedulesController } from './medication-schedules.controller';

@Module({
  controllers: [MedicationSchedulesController],
  providers: [MedicationSchedulesService],
})
export class MedicationSchedulesModule {}
