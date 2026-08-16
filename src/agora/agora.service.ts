import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcRole, RtcTokenBuilder } from 'agora-access-token';

@Injectable()
export class AgoraService {
  constructor(private config: ConfigService) {}

  buildRtcToken(channelName: string, uid = 0, expireSeconds = 3600) {
    const appId = this.config.get<string>('AGORA_APP_ID');
    const appCertificate = this.config.get<string>('AGORA_APP_CERTIFICATE');
    if (!appId || !appCertificate) {
      throw new Error('Agora credentials are not configured');
    }

    const privilegeExpire = Math.floor(Date.now() / 1000) + expireSeconds;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpire,
    );

    return {
      appId,
      channelName,
      token,
      uid,
      expiresAt: new Date(privilegeExpire * 1000).toISOString(),
    };
  }
}
