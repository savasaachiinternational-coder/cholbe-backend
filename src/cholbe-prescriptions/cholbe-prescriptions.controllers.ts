import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { createReadStream } from 'fs';
import { memoryStorage } from 'multer';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CholbePrescriptionsService } from './cholbe-prescriptions.service';
import {
  CancelCholbePrescriptionDto,
  CreateCholbePrescriptionDto,
  ListCholbePrescriptionsQuery,
} from './dto/cholbe-prescription.dto';

const pdfUpload = () =>
  FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const signatureUpload = () =>
  FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const fileBody = {
  schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] },
};

function pdfResponse({ path, rxNumber }: { path: string; rxNumber: string }) {
  return new StreamableFile(createReadStream(path), {
    type: 'application/pdf',
    disposition: `attachment; filename="${rxNumber}.pdf"`,
  });
}

@ApiTags('Doctor Prescriptions')
@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
@ApiBearerAuth('access-token')
export class DoctorCholbePrescriptionsController {
  constructor(private service: CholbePrescriptionsService) {}

  @Post('prescriptions')
  @ApiOperation({ summary: "Issue a prescription for one of the doctor's appointments" })
  issue(@CurrentUser() user: JwtPayload, @Body() dto: CreateCholbePrescriptionDto) {
    return this.service.issue(user.sub, dto);
  }

  @Get('prescriptions')
  @ApiOperation({ summary: 'Prescriptions issued by this doctor' })
  list(@CurrentUser() user: JwtPayload, @Query() query: ListCholbePrescriptionsQuery) {
    return this.service.listForDoctor(user.sub, query);
  }

  @Get('prescriptions/:id')
  @ApiOperation({ summary: 'One prescription issued by this doctor' })
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getForDoctor(user.sub, id);
  }

  @Get('prescriptions/:id/pdf')
  @ApiOperation({ summary: 'Download the issued PDF' })
  async pdf(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return pdfResponse(await this.service.doctorPdfPath(user.sub, id));
  }

  @Put('prescriptions/:id/pdf')
  @ApiOperation({ summary: 'Attach the generated PDF (once; it can never be replaced)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(pdfUpload())
  attachPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.attachPdf(user.sub, id, file);
  }

  @Post('prescriptions/:id/cancel')
  @ApiOperation({ summary: 'Cancel an issued prescription (issue a new one to correct it)' })
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCholbePrescriptionDto,
  ) {
    return this.service.cancel(user.sub, id, dto);
  }

  @Get('signature')
  @ApiOperation({ summary: "The doctor's signature as a data URI (null when not set)" })
  signature(@CurrentUser() user: JwtPayload) {
    return this.service.getSignature(user.sub);
  }

  @Put('signature')
  @ApiOperation({ summary: 'Upload or replace the signature (PNG or JPEG, max 2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(signatureUpload())
  setSignature(@CurrentUser() user: JwtPayload, @UploadedFile() file: Express.Multer.File) {
    return this.service.setSignature(user.sub, file);
  }
}

@ApiTags('My Prescriptions')
@Controller('my/prescriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@ApiBearerAuth('access-token')
export class PatientCholbePrescriptionsController {
  constructor(private service: CholbePrescriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Doctor-issued prescriptions for me and the family accounts I manage' })
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listForPatient(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One doctor-issued prescription' })
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getForPatient(user.sub, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download the prescription PDF' })
  async pdf(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return pdfResponse(await this.service.patientPdfPath(user.sub, id));
  }

  @Post(':id/reminders')
  @ApiOperation({ summary: 'Create medication reminders for every Rx line (skips ones already added)' })
  reminders(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.createReminders(user.sub, id);
  }
}
