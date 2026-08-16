import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { DoctorPortalService } from './doctor-portal.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Doctor Portal')
@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
@ApiBearerAuth('access-token')
export class DoctorPortalController {
  constructor(private service: DoctorPortalService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Doctor home dashboard' })
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.service.getDashboard(user.sub);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Full doctor profile for editing' })
  profile(@CurrentUser() user: JwtPayload) {
    return this.service.getProfile(user.sub);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'List doctor appointments' })
  appointments(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.service.listAppointments(user.sub, status);
  }

  @Get('patients')
  @ApiOperation({ summary: 'List doctor patients' })
  patients(@CurrentUser() user: JwtPayload) {
    return this.service.listPatients(user.sub);
  }

  @Get('consultations')
  @ApiOperation({ summary: 'List doctor consultations' })
  consultations(@CurrentUser() user: JwtPayload) {
    return this.service.listConsultations(user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update doctor basic profile' })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      fullName?: string;
      phone?: string;
      specialty?: string;
      specialtyId?: string;
      degree?: string;
      fee?: number;
      bio?: string;
      imageUrl?: string;
      registrationNumber?: string;
      chamberAddress?: string;
      languages?: string[];
      categories?: string[];
      isOnline?: boolean;
    },
  ) {
    return this.service.updateProfile(user.sub, body);
  }

  @Post('qualifications')
  addQualification(
    @CurrentUser() user: JwtPayload,
    @Body() body: { degree: string; institution: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    return this.service.addQualification(user.sub, body);
  }

  @Patch('qualifications/:id')
  updateQualification(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { degree?: string; institution?: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    return this.service.updateQualification(user.sub, id, body);
  }

  @Delete('qualifications/:id')
  removeQualification(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removeQualification(user.sub, id);
  }

  @Post('experiences')
  addExperience(
    @CurrentUser() user: JwtPayload,
    @Body() body: { title: string; institution: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.service.addExperience(user.sub, body);
  }

  @Patch('experiences/:id')
  updateExperience(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { title?: string; institution?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.service.updateExperience(user.sub, id, body);
  }

  @Delete('experiences/:id')
  removeExperience(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removeExperience(user.sub, id);
  }

  @Post('instructions')
  addInstruction(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.service.addInstruction(user.sub, body);
  }

  @Patch('instructions/:id')
  updateInstruction(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.service.updateInstruction(user.sub, id, body);
  }

  @Delete('instructions/:id')
  removeInstruction(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removeInstruction(user.sub, id);
  }

  @Post('availability/slots')
  createSlot(
    @CurrentUser() user: JwtPayload,
    @Body() body: { dayOfWeek: number; startTime: string; endTime: string; slotMinutes?: number; isActive?: boolean },
  ) {
    return this.service.createWeeklySlot(user.sub, body);
  }

  @Patch('availability/slots/:slotId')
  updateSlot(
    @CurrentUser() user: JwtPayload,
    @Param('slotId') slotId: string,
    @Body()
    body: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      slotMinutes?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.updateWeeklySlot(user.sub, slotId, body);
  }

  @Delete('availability/slots/:slotId')
  deleteSlot(@CurrentUser() user: JwtPayload, @Param('slotId') slotId: string) {
    return this.service.deleteWeeklySlot(user.sub, slotId);
  }

  @Post('availability/override')
  setOverride(
    @CurrentUser() user: JwtPayload,
    @Body() body: { date: string; isAvailable: boolean },
  ) {
    return this.service.setDateOverride(user.sub, body.date, body.isAvailable);
  }

  @Post('payout-methods')
  upsertPayoutMethod(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      id?: string;
      label: string;
      methodType: 'BANK' | 'BKASH' | 'NAGAD';
      accountMasked: string;
      isPrimary?: boolean;
    },
  ) {
    return this.service.upsertPayoutMethod(user.sub, body);
  }

  @Delete('payout-methods/:id')
  removePayoutMethod(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removePayoutMethod(user.sub, id);
  }

  @Get('finance')
  @ApiOperation({ summary: 'Doctor earnings and wallet' })
  finance(@CurrentUser() user: JwtPayload) {
    return this.service.getFinance(user.sub);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'List doctor withdrawal requests' })
  withdrawals(@CurrentUser() user: JwtPayload) {
    return this.service.listWithdrawals(user.sub);
  }

  @Post('withdrawals')
  @ApiOperation({ summary: 'Request withdrawal' })
  requestWithdrawal(
    @CurrentUser() user: JwtPayload,
    @Body() body: { amount: number; payoutMethodId?: string },
  ) {
    return this.service.requestWithdrawal(user.sub, body);
  }

  @Patch('appointments/:id/status')
  @ApiOperation({ summary: 'Update appointment status' })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.service.updateAppointmentStatus(user.sub, id, body.status);
  }
}
