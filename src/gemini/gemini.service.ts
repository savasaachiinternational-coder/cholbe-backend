import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateJsonDto } from './dto/generate-json.dto';

const DEFAULT_MODEL = 'gemini-3.6-flash';
const REQUEST_TIMEOUT_MS = 45_000;
// Google answers 429/500/503 when the model is overloaded; these usually clear in seconds.
const RETRYABLE_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1_000, 3_000];

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private config: ConfigService) {}

  /**
   * Server-side Gemini key. Kept out of the mobile bundle so it cannot be
   * extracted from the app.
   */
  private apiKey() {
    const key = this.config.get<string>('GEMINI_API_KEY');
    if (!key) {
      throw new ServiceUnavailableException('AI service is not configured on the server');
    }
    return key;
  }

  async generateJson(dto: GenerateJsonDto): Promise<unknown> {
    const model = this.config.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: dto.systemInstruction }] },
      contents: [{ role: 'user', parts: dto.parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: dto.responseSchema,
      },
    });

    let response!: Response;
    let data: GeminiResponse = {};
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
      }
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey() },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        this.logger.warn(`Gemini unreachable (attempt ${attempt + 1})`);
        if (attempt < RETRY_DELAYS_MS.length) continue;
        throw new ServiceUnavailableException('AI provider unreachable. Please try again.');
      }

      data = (await response.json().catch(() => ({}))) as GeminiResponse;
      if (response.ok || !RETRYABLE_STATUSES.has(response.status)) break;
      this.logger.warn(
        `Gemini ${response.status} (attempt ${attempt + 1}): ${data.error?.message ?? 'no message'}`,
      );
    }

    if (!response.ok) {
      // 4xx from Google is a malformed request (bad schema/parts); the rest is on their side.
      if (response.status === 400) {
        throw new BadRequestException(data.error?.message ?? 'AI request was rejected');
      }
      this.logger.error(`Gemini ${response.status}: ${data.error?.message ?? 'no message'}`);
      throw new BadGatewayException('AI service is busy right now. Please try again.');
    }

    if (data.promptFeedback?.blockReason) {
      throw new BadRequestException('This request could not be processed by the AI.');
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) {
      throw new BadGatewayException('The AI returned an empty answer. Please try again.');
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new BadGatewayException('The AI returned an unreadable answer. Please try again.');
    }
  }
}
