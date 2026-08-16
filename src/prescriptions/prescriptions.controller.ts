import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto, ScanPrescriptionDto } from './dto/prescription.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Prescriptions')
@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class PrescriptionsController {
  constructor(private prescriptionsService: PrescriptionsService) {}

  @Post('scan')
  @ApiOperation({ summary: 'Scan uploaded prescription image and extract medicines' })
  scan(@CurrentUser() user: JwtPayload, @Body() dto: ScanPrescriptionDto) {
    return this.prescriptionsService.scan(user.sub, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Upload prescription with optional extracted medicines' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List saved prescriptions' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.prescriptionsService.findAll(user.sub);
  }

  @Get(':id/draft')
  @ApiOperation({ summary: 'Get medication draft from saved prescription' })
  getDraft(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.prescriptionsService.getDraft(user.sub, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get prescription with medicines' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.prescriptionsService.findOne(user.sub, id);
  }
}
