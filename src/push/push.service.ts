import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type SendResponse } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.module';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android notification channel to deliver through while the app is backgrounded/killed (the client must have created it). */
  androidChannelId?: string;
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private app: App | null | undefined;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  /** Lazily initializes the Firebase Admin app; returns null if credentials aren't configured. */
  private getApp(): App | null {
    if (this.app !== undefined) return this.app;

    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    // Env files store the key with literal "\n" sequences; Firebase needs real newlines.
    const privateKey = this.config
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase credentials are not configured — push notifications are disabled.',
      );
      this.app = null;
      return this.app;
    }

    this.app = getApps().length
      ? getApp()
      : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return this.app;
  }

  /** Sends to every device registered for a user, pruning tokens Firebase reports as dead. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const app = this.getApp();
    if (!app) return;

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (!devices.length) return;

    const response = await getMessaging(app).sendEachForMulticast({
      tokens: devices.map(d => d.token),
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: {
        priority: 'high',
        notification: payload.androidChannelId
          ? { channelId: payload.androidChannelId, sound: 'default' }
          : undefined,
      },
    });

    const staleTokens = response.responses
      .map((r: SendResponse, i: number) =>
        !r.success && r.error?.code === 'messaging/registration-token-not-registered'
          ? devices[i].token
          : null,
      )
      .filter((t): t is string => t !== null);

    if (staleTokens.length) {
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: staleTokens } } });
    }
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(userIds.map(id => this.sendToUser(id, payload)));
  }
}
