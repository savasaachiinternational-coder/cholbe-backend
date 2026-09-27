import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RegisterDeviceTokenDto } from './dto/device-token.dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List user notifications' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.sub);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count' })
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.service.unreadCount(user.sub).then((count) => ({ count }));
  }

  @Post('emergency-help')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Send an emergency help request notification to all admins' })
  emergencyHelp(@CurrentUser() user: JwtPayload) {
    return this.service.requestEmergencyHelp(user.sub);
  }

  @Post('device-token')
  @ApiOperation({ summary: 'Register (or refresh) this device\'s push token' })
  registerDeviceToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.service.registerDeviceToken(user.sub, dto.token, dto.platform);
  }

  @Delete('device-token')
  @ApiOperation({ summary: 'Unregister this device\'s push token (e.g. on logout)' })
  unregisterDeviceToken(
    @CurrentUser() user: JwtPayload,
    @Query('token') token: string,
  ) {
    return this.service.unregisterDeviceToken(user.sub, token);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.service.markAllRead(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.markRead(user.sub, id);
  }
}
