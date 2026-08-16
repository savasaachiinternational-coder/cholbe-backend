import { Body, Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() body: { fullName?: string; phone?: string; avatarUrl?: string },
  ) {
    return this.usersService.updateProfile(user.sub, body);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change current user password' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changePassword(user.sub, body.currentPassword, body.newPassword);
  }

  // Declared before ':id' so the literal path is not captured as an id.
  @Delete('me')
  @ApiOperation({
    summary: 'Delete current user account (Play Store account deletion)',
  })
  deleteMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.deleteOwnAccount(user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Admin: update user status' })
  updateStatus(@Param('id') id: string, @Body('status') status: UserStatus) {
    return this.usersService.updateStatus(id, status);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN' as any)
  @Delete(':id')
  @ApiOperation({ summary: 'Admin: delete user' })
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
