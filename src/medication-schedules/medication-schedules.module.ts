import { Module } from '@nestjs/common';
import { MedicationSchedulesService } from './medication-schedules.service';
import { MedicationSchedulesController } from './medication-schedules.controller';
import { MissedDoseService } from './missed-dose.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [NotificationsModule, PushModule],
  controllers: [MedicationSchedulesController],
  providers: [MedicationSchedulesService, MissedDoseService],
  exports: [MissedDoseService],
})
export class MedicationSchedulesModule {}
