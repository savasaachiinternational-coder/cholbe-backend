import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import {
  DoctorCholbePrescriptionsController,
  PatientCholbePrescriptionsController,
} from './cholbe-prescriptions.controllers';
import { CholbePrescriptionsService } from './cholbe-prescriptions.service';
import { PrescriptionFilesService } from './prescription-files.service';

/** Doctor-issued prescriptions. The upload-your-own-prescription flow stays in PrescriptionsModule. */
@Module({
  imports: [NotificationsModule, PushModule],
  controllers: [DoctorCholbePrescriptionsController, PatientCholbePrescriptionsController],
  providers: [CholbePrescriptionsService, PrescriptionFilesService],
})
export class CholbePrescriptionsModule {}
