import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateMedicationScheduleDto } from './medication-schedule.dto';

/**
 * Everything the add-medication form can set, all optional, plus the active
 * toggle — the edit form PATCHes the whole schedule. The link to a prescription
 * is set when the reminder is created and can't be changed by an edit.
 */
export class UpdateMedicationScheduleDto extends PartialType(
  OmitType(CreateMedicationScheduleDto, ['prescriptionId'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
