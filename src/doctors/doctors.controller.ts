import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { DoctorAvailabilityService } from './doctor-availability.service';
import { Public } from '../common/decorators';

@ApiTags('Doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(
    private doctorsService: DoctorsService,
    private availability: DoctorAvailabilityService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active doctors with ratings' })
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('specialtyId') specialtyId?: string,
  ) {
    return this.doctorsService.findAll(search, category, specialtyId);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: 'Doctor reviews with average rating' })
  getReviews(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.doctorsService.getReviews(id, limit ? Number(limit) : 20);
  }

  @Public()
  @Get(':id/availability/dates')
  @ApiOperation({ summary: 'Available booking dates for doctor' })
  availableDates(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('days') days?: string,
  ) {
    const fromDate = from ?? new Date().toISOString().slice(0, 10);
    return this.availability.getAvailableDates(id, fromDate, days ? Number(days) : 14);
  }

  @Public()
  @Get(':id/availability')
  @ApiOperation({ summary: 'Available time slots for a date' })
  availableSlots(@Param('id') id: string, @Query('date') date: string) {
    return this.availability.getSlotsForDate(id, date);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Doctor detail with qualifications, experience, reviews' })
  findOne(@Param('id') id: string) {
    return this.doctorsService.findOne(id);
  }
}
