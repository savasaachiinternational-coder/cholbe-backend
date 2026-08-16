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
import {
  DoctorProfileStatus,
  OrderStatus,
  UserRole,
  UserStatus,
  VendorApprovalStatus,
} from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminDoctorsService } from './admin-doctors.service';
import { SpecialtiesService } from '../specialties/specialties.service';
import { Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('access-token')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private adminDoctors: AdminDoctorsService,
    private specialties: SpecialtiesService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Admin home metrics' })
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('orders')
  @ApiOperation({ summary: 'All platform orders' })
  orders(@Query('status') status?: OrderStatus) {
    return this.adminService.listOrders(status);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Order detail with items and timeline' })
  getOrder(@Param('id') id: string) {
    return this.adminService.getOrder(id);
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Admin update order status' })
  updateOrderStatus(@Param('id') id: string, @Body('status') status: OrderStatus) {
    return this.adminService.updateOrderStatus(id, status);
  }

  @Get('chart/orders-monthly')
  @ApiOperation({ summary: 'Monthly order counts for dashboard chart' })
  ordersMonthly() {
    return this.adminService.ordersMonthly();
  }

  @Get('vendors')
  @ApiOperation({ summary: 'Vendor list' })
  vendors(@Query('status') status?: VendorApprovalStatus) {
    return this.adminService.listVendors(status);
  }

  @Patch('vendors/:id/status')
  @ApiOperation({ summary: 'Approve or reject vendor' })
  vendorStatus(
    @Param('id') id: string,
    @Body('approvalStatus') approvalStatus: VendorApprovalStatus,
  ) {
    return this.adminService.updateVendorStatus(id, approvalStatus);
  }

  @Get('users')
  @ApiOperation({ summary: 'User directory' })
  users(@Query('role') role?: UserRole, @Query('status') status?: UserStatus) {
    return this.adminService.listUsers(role, status);
  }

  @Get('reports/sales')
  @ApiOperation({ summary: 'Sales report & top medicines' })
  salesReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminService.salesReport(from, to);
  }

  @Get('inventory/overview')
  @ApiOperation({ summary: 'Inventory analytics' })
  inventory() {
    return this.adminService.inventoryOverview();
  }

  @Get('payments')
  @ApiOperation({ summary: 'Payment transactions' })
  payments() {
    return this.adminService.listPayments();
  }

  // ─── Specialties ─────────────────────────────────────────────────────────────

  @Get('specialties')
  @ApiOperation({ summary: 'List all specialties' })
  listSpecialties() {
    return this.specialties.listAll();
  }

  @Post('specialties')
  @ApiOperation({ summary: 'Create specialty' })
  createSpecialty(@Body() body: { name: string; icon?: string; isActive?: boolean }) {
    return this.specialties.create(body);
  }

  @Patch('specialties/:id')
  @ApiOperation({ summary: 'Update specialty' })
  updateSpecialty(
    @Param('id') id: string,
    @Body() body: { name?: string; icon?: string; isActive?: boolean },
  ) {
    return this.specialties.update(id, body);
  }

  @Delete('specialties/:id')
  @ApiOperation({ summary: 'Delete specialty' })
  deleteSpecialty(@Param('id') id: string) {
    return this.specialties.remove(id);
  }

  // ─── Doctors ─────────────────────────────────────────────────────────────────

  @Get('doctors')
  @ApiOperation({ summary: 'List doctors (pending/active/inactive)' })
  listDoctors(@Query('status') status?: DoctorProfileStatus) {
    return this.adminDoctors.list(status);
  }

  @Post('doctors')
  @ApiOperation({ summary: 'Create doctor account + profile' })
  createDoctor(@Body() body: Record<string, unknown>) {
    return this.adminDoctors.create(body as Parameters<AdminDoctorsService['create']>[0]);
  }

  @Get('doctors/:id')
  @ApiOperation({ summary: 'Doctor detail with availability, qualifications, experiences, instructions' })
  getDoctor(@Param('id') id: string) {
    return this.adminDoctors.findOne(id);
  }

  @Patch('doctors/:id')
  @ApiOperation({ summary: 'Update doctor profile' })
  updateDoctor(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminDoctors.update(id, body as Parameters<AdminDoctorsService['update']>[1]);
  }

  @Delete('doctors/:id')
  @ApiOperation({ summary: 'Delete doctor' })
  deleteDoctor(@Param('id') id: string) {
    return this.adminDoctors.remove(id);
  }

  // ─── Qualifications ──────────────────────────────────────────────────────────

  @Post('doctors/:id/qualifications')
  @ApiOperation({ summary: 'Add qualification to doctor' })
  addQualification(
    @Param('id') id: string,
    @Body() body: { degree: string; institution: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    return this.adminDoctors.addQualification(id, body);
  }

  @Patch('doctors/:id/qualifications/:qualId')
  @ApiOperation({ summary: 'Update qualification' })
  updateQualification(
    @Param('id') id: string,
    @Param('qualId') qualId: string,
    @Body() body: { degree?: string; institution?: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    return this.adminDoctors.updateQualification(id, qualId, body);
  }

  @Delete('doctors/:id/qualifications/:qualId')
  @ApiOperation({ summary: 'Delete qualification' })
  removeQualification(@Param('id') id: string, @Param('qualId') qualId: string) {
    return this.adminDoctors.removeQualification(id, qualId);
  }

  // ─── Experiences ─────────────────────────────────────────────────────────────

  @Post('doctors/:id/experiences')
  @ApiOperation({ summary: 'Add experience to doctor' })
  addExperience(
    @Param('id') id: string,
    @Body() body: { title: string; institution: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.adminDoctors.addExperience(id, body);
  }

  @Patch('doctors/:id/experiences/:expId')
  @ApiOperation({ summary: 'Update experience' })
  updateExperience(
    @Param('id') id: string,
    @Param('expId') expId: string,
    @Body() body: { title?: string; institution?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.adminDoctors.updateExperience(id, expId, body);
  }

  @Delete('doctors/:id/experiences/:expId')
  @ApiOperation({ summary: 'Delete experience' })
  removeExperience(@Param('id') id: string, @Param('expId') expId: string) {
    return this.adminDoctors.removeExperience(id, expId);
  }

  // ─── Instructions ────────────────────────────────────────────────────────────

  @Post('doctors/:id/instructions')
  @ApiOperation({ summary: 'Add instruction/training to doctor' })
  addInstruction(
    @Param('id') id: string,
    @Body() body: { name: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.adminDoctors.addInstruction(id, body);
  }

  @Patch('doctors/:id/instructions/:instrId')
  @ApiOperation({ summary: 'Update instruction' })
  updateInstruction(
    @Param('id') id: string,
    @Param('instrId') instrId: string,
    @Body() body: { name?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    return this.adminDoctors.updateInstruction(id, instrId, body);
  }

  @Delete('doctors/:id/instructions/:instrId')
  @ApiOperation({ summary: 'Delete instruction' })
  removeInstruction(@Param('id') id: string, @Param('instrId') instrId: string) {
    return this.adminDoctors.removeInstruction(id, instrId);
  }

  // ─── Availability ────────────────────────────────────────────────────────────

  @Post('doctors/:id/availability/weekly')
  @ApiOperation({ summary: 'Replace all doctor weekly availability slots' })
  setWeeklyAvailability(
    @Param('id') id: string,
    @Body() body: { slots: Array<{ dayOfWeek: number; startTime: string; endTime: string; slotMinutes?: number; isActive?: boolean }> },
  ) {
    return this.adminDoctors.setWeeklyAvailability(id, body.slots);
  }

  @Post('doctors/:id/availability/slots')
  @ApiOperation({ summary: 'Add a weekly schedule time block' })
  createWeeklySlot(
    @Param('id') id: string,
    @Body() body: { dayOfWeek: number; startTime: string; endTime: string; slotMinutes?: number; isActive?: boolean },
  ) {
    return this.adminDoctors.createWeeklySlot(id, body);
  }

  @Patch('doctors/:id/availability/slots/:slotId')
  @ApiOperation({ summary: 'Update a weekly schedule time block' })
  updateWeeklySlot(
    @Param('id') id: string,
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
    return this.adminDoctors.updateWeeklySlot(id, slotId, body);
  }

  @Delete('doctors/:id/availability/slots/:slotId')
  @ApiOperation({ summary: 'Delete a weekly schedule time block' })
  deleteWeeklySlot(@Param('id') id: string, @Param('slotId') slotId: string) {
    return this.adminDoctors.deleteWeeklySlot(id, slotId);
  }

  @Post('doctors/:id/availability/override')
  @ApiOperation({ summary: 'Block or enable a specific date' })
  setDateOverride(
    @Param('id') id: string,
    @Body() body: { date: string; isAvailable: boolean },
  ) {
    return this.adminDoctors.setDateOverride(id, body.date, body.isAvailable);
  }

  // ─── Appointments ────────────────────────────────────────────────────────────

  @Get('appointments')
  @ApiOperation({ summary: 'List all appointments' })
  listAppointments(@Query('status') status?: string) {
    return this.adminService.listAppointments(status);
  }

  @Patch('appointments/:id/status')
  @ApiOperation({ summary: 'Update appointment status' })
  updateAppointmentStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateAppointmentStatus(id, status);
  }

  // ─── Reviews ─────────────────────────────────────────────────────────────────

  @Get('reviews')
  @ApiOperation({ summary: 'List all consultation reviews' })
  listReviews(@Query('doctorId') doctorId?: string) {
    return this.adminService.listReviews(doctorId);
  }

  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Delete a review' })
  deleteReview(@Param('id') id: string) {
    return this.adminService.deleteReview(id);
  }
}
