import { Module } from '@nestjs/common';
import { VendorProductsModule } from '../vendor-products/vendor-products.module';
import { UsersModule } from '../users/users.module';
import { SpecialtiesModule } from '../specialties/specialties.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { DoctorAvailabilityService } from '../doctors/doctor-availability.service';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminDoctorsService } from './admin-doctors.service';

@Module({
  imports: [VendorProductsModule, UsersModule, SpecialtiesModule, NotificationsModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminDoctorsService, DoctorAvailabilityService],
})
export class AdminModule {}
