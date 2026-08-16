import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PatientProfileService } from './patient-profile.service';
import {
  EmergencyContactDto,
  FamilyMemberDto,
  UpdateHealthVitalsDto,
  UpdatePatientProfileDto,
} from './dto/patient-profile.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Patient Profile')
@Controller('profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class PatientProfileController {
  constructor(private service: PatientProfileService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Profile dashboard — user, family, emergency, health summary' })
  overview(@CurrentUser() user: JwtPayload) {
    return this.service.getOverview(user.sub);
  }

  @Patch('patient')
  @ApiOperation({ summary: 'Update patient health profile fields' })
  updatePatient(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePatientProfileDto) {
    return this.service.updateProfile(user.sub, dto);
  }

  @Patch('vitals')
  @ApiOperation({ summary: 'Record blood pressure and/or oxygen readings' })
  updateVitals(@CurrentUser() user: JwtPayload, @Body() dto: UpdateHealthVitalsDto) {
    return this.service.updateVitals(user.sub, dto);
  }

  @Get('family-members')
  listFamily(@CurrentUser() user: JwtPayload) {
    return this.service.listFamily(user.sub);
  }

  @Post('family-members')
  addFamily(@CurrentUser() user: JwtPayload, @Body() dto: FamilyMemberDto) {
    return this.service.addFamily(user.sub, dto);
  }

  @Patch('family-members/:id')
  updateFamily(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: FamilyMemberDto,
  ) {
    return this.service.updateFamily(user.sub, id, dto);
  }

  @Delete('family-members/:id')
  removeFamily(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removeFamily(user.sub, id);
  }

  @Get('family-members/:id/details')
  @ApiOperation({ summary: 'Parent view — full details for a linked family member account' })
  familyMemberDetails(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getFamilyMemberDetails(user.sub, id);
  }

  @Get('emergency-contacts')
  listEmergency(@CurrentUser() user: JwtPayload) {
    return this.service.listEmergency(user.sub);
  }

  @Post('emergency-contacts')
  addEmergency(@CurrentUser() user: JwtPayload, @Body() dto: EmergencyContactDto) {
    return this.service.addEmergency(user.sub, dto);
  }

  @Delete('emergency-contacts/:id')
  removeEmergency(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removeEmergency(user.sub, id);
  }
}
