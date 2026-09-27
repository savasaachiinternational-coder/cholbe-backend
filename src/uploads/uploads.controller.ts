import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024;

const fileInterceptor = () =>
  FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

const fileBody = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  },
};

@ApiTags('Uploads')
@Controller('uploads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiConsumes('multipart/form-data')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post('report')
  @ApiOperation({ summary: 'Upload a health report file (image or PDF)' })
  @ApiBody(fileBody)
  @UseInterceptors(fileInterceptor())
  report(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.save('reports', file);
  }

  @Post('prescription')
  @ApiOperation({ summary: 'Upload a prescription file (image, PDF or text)' })
  @ApiBody(fileBody)
  @UseInterceptors(fileInterceptor())
  prescription(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.save('prescriptions', file);
  }

  @Post('product-image')
  @ApiOperation({ summary: 'Upload a product image' })
  @ApiBody(fileBody)
  @UseInterceptors(fileInterceptor())
  productImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.save('products', file);
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload a profile photo' })
  @ApiBody(fileBody)
  @UseInterceptors(fileInterceptor())
  avatar(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.save('avatars', file);
  }

  @Post('chat-attachment')
  @ApiOperation({ summary: 'Upload a consultation chat attachment' })
  @ApiBody(fileBody)
  @UseInterceptors(fileInterceptor())
  chatAttachment(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.save('chat', file);
  }

  @Post('vendor-document')
  @ApiOperation({ summary: 'Upload a vendor verification document' })
  @ApiBody(fileBody)
  @UseInterceptors(fileInterceptor())
  vendorDocument(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.save('vendor-docs', file);
  }
}
