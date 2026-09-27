import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeminiService } from './gemini.service';
import { GenerateJsonDto } from './dto/generate-json.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Gemini')
@Controller('gemini')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class GeminiController {
  constructor(private geminiService: GeminiService) {}

  @Post('generate-json')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run Gemini in JSON mode (server-side key)' })
  generateJson(@Body() dto: GenerateJsonDto) {
    return this.geminiService.generateJson(dto);
  }
}
