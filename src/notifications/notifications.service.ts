import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { PushService } from '../push/push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async registerDeviceToken(userId: string, token: string, platform: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async unregisterDeviceToken(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { removed: true };
  }

  async create(userId: string, category: string, title: string, body: string) {
    return this.prisma.notification.create({
      data: { userId, category, title, body },
    });
  }

  async notifyAdmins(category: string, title: string, body: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    await Promise.all(
      admins.map(a => this.create(a.id, category, title, body)),
    );
  }

  /** Patient-triggered SOS: alerts every admin with who needs help and how to reach them. */
  async requestEmergencyHelp(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        phone: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { formattedAddress: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const patientAddress = user.addresses[0]?.formattedAddress ?? 'Not provided';
    const title = 'Emergency Help Requested';
    const body = [
      `${user.fullName} has requested emergency help.`,
      `Patient ID: ${userId}`,
      `Phone: ${user.phone ?? 'Not provided'}`,
      `Address: ${patientAddress}`,
    ].join('\n');

    // Guard against repeated taps flooding admins with identical alerts.
    const recent = await this.prisma.notification.findFirst({
      where: {
        category: 'alert',
        title,
        body,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
    });

    if (!recent) {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });
      await Promise.all(admins.map(a => this.create(a.id, 'alert', title, body)));

      await this.push.sendToUsers(
        admins.map(a => a.id),
        {
          title: `🚨 ${title}`,
          body: `${user.fullName} needs help — tap for details.`,
          androidChannelId: 'emergency-alerts',
          data: {
            type: 'emergency',
            patientId: userId,
            patientName: user.fullName,
            patientPhone: user.phone ?? '',
            patientAddress,
          },
        },
      );
    }

    return { sent: true };
  }
}
