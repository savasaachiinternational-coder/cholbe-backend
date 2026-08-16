import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PatientHomeService } from './patient-home.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Patient Home')
@Controller('patient/home')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@ApiBearerAuth('access-token')
export class PatientHomeController {
  constructor(private service: PatientHomeService) {}

  @Get()
  @ApiOperation({ summary: 'Customer home dashboard data' })
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.service.getDashboard(user.sub);
  }
}
