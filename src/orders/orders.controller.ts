import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus, UserRole, VendorApprovalStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post('checkout')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Checkout cart → create order' })
  checkout(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.checkout(user.sub, dto);
  }

  @Get('vendor/list')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Vendor order list' })
  vendorOrders(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findVendorOrders(user.sub, status);
  }

  @Patch('vendor/:id/status')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Vendor updates order status' })
  vendorUpdateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.changeStatus(
      id,
      dto.status,
      { role: UserRole.VENDOR, userId: user.sub },
      dto.note,
    );
  }

  @Get('vendor/:id')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Vendor single order detail' })
  findVendorOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.findVendorOrder(user.sub, id);
  }

  @Get()
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Customer order history' })
  findMine(@CurrentUser() user: JwtPayload) {
    return this.ordersService.findMine(user.sub);
  }

  @Get(':id')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Order detail with tracking timeline' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.findOne(user.sub, id);
  }

  // No customer "confirm payment" endpoint: a customer must not be able to mark
  // their own order paid. Online payments are confirmed by an admin
  // (PATCH /admin/orders/:id/payment) until a payment gateway is connected.
}
