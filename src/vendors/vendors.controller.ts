import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { VendorsService } from './vendors.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Vendors')
@Controller('vendor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@ApiBearerAuth('access-token')
export class VendorsController {
  constructor(private vendorsService: VendorsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Vendor home dashboard stats' })
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.vendorsService.getDashboard(user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update vendor pharmacy profile' })
  updateProfile(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.vendorsService.updateProfile(user.sub, body);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Vendor payment transactions' })
  payments(@CurrentUser() user: JwtPayload) {
    return this.vendorsService.listPayments(user.sub);
  }

  @Get('chart/revenue-monthly')
  @ApiOperation({ summary: 'Vendor monthly revenue for chart' })
  revenueMonthly(@CurrentUser() user: JwtPayload) {
    return this.vendorsService.revenueMonthly(user.sub);
  }

  @Get('chart/orders-monthly')
  @ApiOperation({ summary: 'Vendor monthly order count for chart' })
  ordersMonthly(@CurrentUser() user: JwtPayload) {
    return this.vendorsService.ordersMonthly(user.sub);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Register uploaded vendor document' })
  addDocument(
    @CurrentUser() user: JwtPayload,
    @Body() body: { fileName: string; fileUrl: string; mimeType?: string },
  ) {
    return this.vendorsService.addDocument(user.sub, body);
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Remove vendor document' })
  removeDocument(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vendorsService.removeDocument(user.sub, id);
  }

  @Post('payout-methods')
  @ApiOperation({ summary: 'Add or update vendor payout method' })
  upsertPayoutMethod(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      id?: string;
      label: string;
      methodType: 'BANK' | 'BKASH' | 'NAGAD';
      accountMasked: string;
      isPrimary?: boolean;
    },
  ) {
    return this.vendorsService.upsertPayoutMethod(user.sub, body);
  }
}
