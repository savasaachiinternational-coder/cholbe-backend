import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { SpecialtiesService } from './specialties.service';

@ApiTags('Specialties')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private service: SpecialtiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active medical specialties' })
  list() {
    return this.service.listActive();
  }
}
