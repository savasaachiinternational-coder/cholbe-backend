import { Module } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { DoctorsController } from './doctors.controller';
import { DoctorAvailabilityService } from './doctor-availability.service';
import { DoctorsBootstrapService } from './doctors-bootstrap.service';

@Module({
  controllers: [DoctorsController],
  providers: [DoctorsService, DoctorAvailabilityService, DoctorsBootstrapService],
  exports: [DoctorsService, DoctorAvailabilityService],
})
export class DoctorsModule {}
