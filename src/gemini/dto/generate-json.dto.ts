import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class GenerateJsonDto {
  @ApiProperty({ example: 'You extract data from medical documents.' })
  @IsString()
  @IsNotEmpty()
  systemInstruction!: string;

  @ApiProperty({
    description:
      'Gemini user parts: `{ text }` or `{ inline_data: { mime_type, data } }` (base64 image).',
    example: [{ text: 'I have had a headache for two days.' }],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  // Without this, implicit conversion turns each part object into an empty array.
  @Type(() => Object)
  parts!: Record<string, unknown>[];

  @ApiProperty({
    description: 'Gemini responseSchema (OpenAPI subset, e.g. `{ type: "OBJECT", properties: {...} }`).',
  })
  @IsObject()
  responseSchema!: Record<string, unknown>;
}
