import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { OtpChannel, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import {
  LoginDto,
  MedicalHistoryDto,
  PatientOnboardingDto,
  RegisterDto,
  ResetPasswordDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { generateOtpCode } from '../common/utils/helpers';
import { UsersService } from '../users/users.service';

const RESET_TOKEN_TTL_SECONDS = 10 * 60;

type ResetTokenPayload = { sub: string; purpose: 'password-reset'; pwv: string };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private usersService: UsersService,
    private config: ConfigService,
  ) {}

  /**
   * Separate secret so a reset token can never pass the access-token guard.
   */
  private resetTokenSecret() {
    return `${this.config.get<string>('JWT_SECRET', 'change-me')}:password-reset`;
  }

  /**
   * Fingerprint of the current password hash. Changing the password changes it,
   * which makes a reset token single-use without storing it.
   */
  private passwordVersion(passwordHash: string) {
    return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
  }

  private async hashPassword(password: string) {
    return bcrypt.hash(password, 12);
  }

  private async comparePassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }

  private signToken(user: { id: string; email: string | null; role: UserRole }) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private formatUser(user: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    role: UserRole;
    status: UserStatus;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
    };
  }

  async register(dto: RegisterDto) {
    const role = dto.role ?? UserRole.CUSTOMER;

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already registered');
    }
    if (dto.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing) throw new ConflictException('Phone already registered');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const status = role === UserRole.VENDOR ? UserStatus.PENDING : UserStatus.ACTIVE;

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role,
        status,
        patientProfile: role === UserRole.CUSTOMER ? { create: {} } : undefined,
        vendorProfile:
          role === UserRole.VENDOR
            ? { create: { pharmacyName: `${dto.fullName} Pharmacy` } }
            : undefined,
        doctorProfile:
          role === UserRole.DOCTOR
            ? { create: { specialty: 'General', fee: 500 } }
            : undefined,
        cart: role === UserRole.CUSTOMER ? { create: {} } : undefined,
      },
    });

    const accessToken = this.signToken(user);
    return { accessToken, user: this.formatUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { phone: dto.identifier }],
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.comparePassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }

    const accessToken = this.signToken(user);
    return { accessToken, user: this.formatUser(user) };
  }

  async sendOtp(dto: SendOtpDto) {
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.contact }, { phone: dto.contact }],
      },
    });

    // A new code replaces any earlier ones, so only one code per contact is ever valid.
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { contact: dto.contact, used: false },
        data: { used: true },
      }),
      this.prisma.otpCode.create({
        data: {
          contact: dto.contact,
          channel: dto.channel,
          code,
          expiresAt,
          userId: user?.id,
        },
      }),
    ]);

    // In production: send via SMS/email provider
    return {
      message: 'OTP sent successfully',
      channel: dto.channel,
      expiresInSeconds: 600,
      ...(process.env.NODE_ENV === 'development' ? { debugCode: code } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        contact: dto.contact,
        code: dto.code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('Invalid or expired OTP');

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    return { verified: true, contact: dto.contact };
  }

  /** Consumes a password-reset OTP and returns a short-lived token for the reset call. */
  async verifyResetOtp(dto: VerifyOtpDto) {
    await this.verifyOtp(dto);

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.contact }, { phone: dto.contact }] },
    });
    if (!user) throw new BadRequestException('Invalid or expired OTP');

    const payload: ResetTokenPayload = {
      sub: user.id,
      purpose: 'password-reset',
      pwv: this.passwordVersion(user.passwordHash),
    };
    const resetToken = this.jwt.sign(payload, {
      secret: this.resetTokenSecret(),
      expiresIn: RESET_TOKEN_TTL_SECONDS,
    });
    return { resetToken, expiresInSeconds: RESET_TOKEN_TTL_SECONDS };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = dto.resetToken
      ? await this.userFromResetToken(dto.resetToken)
      : await this.userFromResetCode(dto.contact, dto.code);

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { message: 'Password updated successfully' };
  }

  private async userFromResetToken(token: string) {
    const expired = new BadRequestException('Reset link expired. Please request a new code.');
    let payload: ResetTokenPayload;
    try {
      payload = this.jwt.verify<ResetTokenPayload>(token, { secret: this.resetTokenSecret() });
    } catch {
      throw expired;
    }
    if (payload.purpose !== 'password-reset') throw expired;

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    // A changed password means this token was already used (or is stale).
    if (!user || this.passwordVersion(user.passwordHash) !== payload.pwv) throw expired;
    return user;
  }

  /** Legacy path for app builds that send contact + code straight to reset. */
  private async userFromResetCode(contact?: string, code?: string) {
    if (!contact || !code) {
      throw new BadRequestException('resetToken, or contact and code, is required');
    }
    await this.verifyOtp({ contact, code });

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: contact }, { phone: contact }] },
    });
    if (!user) throw new BadRequestException('User not found');
    return user;
  }

  async completePatientOnboarding(userId: string, dto: PatientOnboardingDto) {
    await this.prisma.patientProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return { message: 'Patient profile saved' };
  }

  async completeMedicalHistory(userId: string, dto: MedicalHistoryDto) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new BadRequestException('Patient profile required first');

    await this.prisma.patientProfile.update({
      where: { userId },
      data: {
        conditions: dto.conditions ?? profile.conditions,
        mealBreakfast: dto.mealBreakfast,
        mealLunch: dto.mealLunch,
        mealDinner: dto.mealDinner,
      },
    });
    return { message: 'Medical history saved' };
  }

  getAllUsers(role?: UserRole, status?: UserStatus) {
    return this.usersService.findAll(role, status);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patientProfile: { include: { familyMembers: true, emergencyContacts: true } },
        vendorProfile: true,
        doctorProfile: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash: _, ...safe } = user;
    return safe;
  }
}
