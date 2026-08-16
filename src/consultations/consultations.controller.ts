import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Consultations')
@Controller('consultations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class ConsultationsController {
  constructor(private service: ConsultationsService) {}

  @Get('doctors/:doctorId/active-appointment')
  @ApiOperation({ summary: 'Latest active appointment for patient–doctor chat' })
  activeAppointment(
    @CurrentUser() user: JwtPayload,
    @Param('doctorId') doctorId: string,
  ) {
    return this.service.findActiveAppointment(doctorId, user.sub);
  }

  @Get('appointments/:appointmentId/context')
  @ApiOperation({ summary: 'Chat header + shared report context' })
  context(@CurrentUser() user: JwtPayload, @Param('appointmentId') appointmentId: string) {
    return this.service.getContext(appointmentId, user.sub);
  }

  @Get('appointments/:appointmentId/messages')
  @ApiOperation({ summary: 'List consultation chat messages' })
  messages(@CurrentUser() user: JwtPayload, @Param('appointmentId') appointmentId: string) {
    return this.service.listMessages(appointmentId, user.sub);
  }

  @Post('appointments/:appointmentId/messages')
  @ApiOperation({ summary: 'Send chat message' })
  send(
    @CurrentUser() user: JwtPayload,
    @Param('appointmentId') appointmentId: string,
    @Body()
    body: { content: string; attachmentUrl?: string; attachmentType?: string },
  ) {
    return this.service.sendMessage(appointmentId, user.sub, body);
  }

  @Post('appointments/:appointmentId/feedback')
  @ApiOperation({ summary: 'Submit consultation feedback' })
  feedback(
    @CurrentUser() user: JwtPayload,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { rating: number; comment?: string },
  ) {
    return this.service.submitFeedback(appointmentId, user.sub, body);
  }

  @Get('appointments/:appointmentId/feedback')
  feedbackGet(@CurrentUser() user: JwtPayload, @Param('appointmentId') appointmentId: string) {
    return this.service.getFeedback(appointmentId, user.sub);
  }
}
