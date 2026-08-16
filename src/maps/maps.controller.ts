import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MapsService } from './maps.service';
import { ReverseGeocodeQueryDto, StaticMapQueryDto } from './dto/maps.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Maps')
@Controller('maps')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class MapsController {
  constructor(private mapsService: MapsService) {}

  @Get('reverse-geocode')
  @ApiOperation({ summary: 'Resolve coordinates to an address (server-side key)' })
  reverseGeocode(@Query() query: ReverseGeocodeQueryDto) {
    return this.mapsService.reverseGeocode(query.lat, query.lng);
  }

  @Get('static')
  @ApiOperation({ summary: 'Static map preview image (server-side key)' })
  async staticMap(@Query() query: StaticMapQueryDto, @Res() res: Response) {
    const { body, contentType } = await this.mapsService.staticMap({
      lat: query.lat,
      lng: query.lng,
      zoom: query.zoom ?? 14,
      width: query.width ?? 600,
      height: query.height ?? 240,
      scale: query.scale ?? 2,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(body);
  }
}
