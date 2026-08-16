import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MedicinesService } from './medicines.service';
import { CreateMedicineDto, MedicineQueryDto, UpdateMedicineDto } from './dto/medicine.dto';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators';

@ApiTags('Medicines')
@Controller('medicines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MedicinesController {
  constructor(private medicinesService: MedicinesService) {}

  @Post('doctor')
  @Roles(UserRole.DOCTOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Doctor creates a medicine catalog entry',
    description: 'Used when doctors add medicines during consultation or prescription.',
  })
  createByDoctor(@CurrentUser() user: JwtPayload, @Body() dto: CreateMedicineDto) {
    return this.medicinesService.createByDoctor(user.sub, dto);
  }

  @Post('admin')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Admin creates a platform medicine' })
  createByAdmin(@CurrentUser() user: JwtPayload, @Body() dto: CreateMedicineDto) {
    return this.medicinesService.createByAdmin(user.sub, dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List medicines (catalog browse)' })
  findAll(@Query() query: MedicineQueryDto) {
    return this.medicinesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get medicine details with vendor listings' })
  findOne(@Param('id') id: string) {
    return this.medicinesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update medicine (admin or owning doctor)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMedicineDto,
  ) {
    return this.medicinesService.update(id, user.sub, user.role as UserRole, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Admin: delete medicine' })
  delete(@Param('id') id: string) {
    return this.medicinesService.delete(id);
  }
}
