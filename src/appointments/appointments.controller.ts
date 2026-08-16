import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Appointments')
@Controller('appointments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class AppointmentsController {
  constructor(private service: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List my consultations / video appointments' })
  findMine(@CurrentUser() user: JwtPayload) {
    return this.service.findMine(user.sub, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment detail' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Post()
  @ApiOperation({ summary: 'Book video consultation' })
  book(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      doctorId: string;
      scheduledDate: string;
      timeSlot: string;
      durationMin?: number;
      paymentMethod?: string;
      consultationType?: 'VIDEO' | 'AUDIO' | 'CHAT';
    },
  ) {
    return this.service.book(user.sub, body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update appointment status (join, complete, cancel)' })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.service.updateStatus(user.sub, id, status);
  }

  @Post(':id/agora-token')
  @ApiOperation({ summary: 'Get Agora RTC token to join video call' })
  agoraToken(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getAgoraToken(user.sub, id);
  }
}
