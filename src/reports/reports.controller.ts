import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload health report metadata (file via /uploads/report first)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List patient health reports' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.reportsService.findAll(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report details' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reportsService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update report details' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.reportsService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a report' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reportsService.remove(user.sub, id);
  }
}
