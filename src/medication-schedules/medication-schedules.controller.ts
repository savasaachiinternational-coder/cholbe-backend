import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MedicationSchedulesService } from './medication-schedules.service';
import { CreateMedicationScheduleDto } from './dto/medication-schedule.dto';
import { UpdateMedicationScheduleDto } from './dto/update-medication-schedule.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Medication Schedules')
@Controller('medication-schedules')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class MedicationSchedulesController {
  constructor(private service: MedicationSchedulesService) {}

  @Post()
  @ApiOperation({ summary: 'Add patient medication schedule (manual entry)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMedicationScheduleDto) {
    return this.service.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List patient medication schedules' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.sub);
  }

  @Post(':id/log')
  @ApiOperation({ summary: 'Log medication dose (taken, missed, snoozed)' })
  logDose(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('status') status: 'taken' | 'missed' | 'snoozed',
    @Body('snoozeMinutes') snoozeMinutes?: number,
    @Body('scheduledTime') scheduledTime?: string,
  ) {
    if (!['taken', 'missed', 'snoozed'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    return this.service.logDose(user.sub, id, status, snoozeMinutes ?? 10, scheduledTime);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update medication schedule (e.g. enable/disable reminders)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMedicationScheduleDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }
}
