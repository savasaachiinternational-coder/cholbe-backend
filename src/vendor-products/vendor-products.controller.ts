import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { VendorProductsService } from './vendor-products.service';
import {
  CreateVendorProductDto,
  UpdateVendorProductDto,
  VendorProductQueryDto,
} from './dto/vendor-product.dto';
import { CurrentUser, JwtPayload, Public, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Vendor Products')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorProductsController {
  constructor(private vendorProductsService: VendorProductsService) {}

  @Post('vendor/products')
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Vendor uploads medicine to inventory',
    description:
      'Creates sellable vendor product. Optionally links to existing doctor/admin medicine via medicineId, or creates a new VENDOR-sourced medicine.',
  })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVendorProductDto) {
    return this.vendorProductsService.create(user.sub, dto);
  }

  @Get('vendor/products')
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List vendor own products' })
  findMine(@CurrentUser() user: JwtPayload, @Query() query: VendorProductQueryDto) {
    return this.vendorProductsService.findMine(user.sub, query);
  }

  @Patch('vendor/products/:id')
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update vendor product' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateVendorProductDto,
  ) {
    return this.vendorProductsService.update(user.sub, id, dto);
  }

  @Patch('vendor/products/:id/status')
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Toggle product active/inactive' })
  toggle(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.vendorProductsService.toggleActive(user.sub, id, isActive);
  }

  @Delete('vendor/products/:id')
  @Roles(UserRole.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete vendor product' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vendorProductsService.remove(user.sub, id);
  }

  @Public()
  @Get('pharmacy/products')
  @ApiOperation({ summary: 'Customer pharmacy shop — browse vendor products' })
  shop(@Query() query: VendorProductQueryDto) {
    return this.vendorProductsService.findShop(query);
  }

  @Public()
  @Get('pharmacy/products/:id')
  @ApiOperation({ summary: 'Product detail for pharmacy shop' })
  shopDetail(@Param('id') id: string) {
    return this.vendorProductsService.findOne(id);
  }
}
