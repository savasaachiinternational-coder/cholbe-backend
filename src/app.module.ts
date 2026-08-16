import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MedicinesModule } from './medicines/medicines.module';
import { VendorProductsModule } from './vendor-products/vendor-products.module';
import { ReportsModule } from './reports/reports.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { AddressesModule } from './addresses/addresses.module';
import { VendorsModule } from './vendors/vendors.module';
import { DoctorsModule } from './doctors/doctors.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { PatientProfileModule } from './patient-profile/patient-profile.module';
import { AgoraModule } from './agora/agora.module';
import { AdminModule } from './admin/admin.module';
import { UploadsModule } from './uploads/uploads.module';
import { MedicationSchedulesModule } from './medication-schedules/medication-schedules.module';
import { PatientHomeModule } from './patient-home/patient-home.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { MapsModule } from './maps/maps.module';
import { DoctorPortalModule } from './doctor-portal/doctor-portal.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MedicinesModule,
    VendorProductsModule,
    ReportsModule,
    PrescriptionsModule,
    CartModule,
    OrdersModule,
    AddressesModule,
    VendorsModule,
    DoctorsModule,
    AppointmentsModule,
    PatientProfileModule,
    AgoraModule,
    AdminModule,
    UploadsModule,
    MedicationSchedulesModule,
    PatientHomeModule,
    NotificationsModule,
    SpecialtiesModule,
    ConsultationsModule,
    DoctorPortalModule,
    MapsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
