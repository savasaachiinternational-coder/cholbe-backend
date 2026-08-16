import { Module } from '@nestjs/common';
import { DoctorPortalController } from './doctor-portal.controller';
import { DoctorPortalService } from './doctor-portal.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DoctorsModule } from '../doctors/doctors.module';

@Module({
  imports: [NotificationsModule, DoctorsModule],
  controllers: [DoctorPortalController],
  providers: [DoctorPortalService],
})
export class DoctorPortalModule {}
