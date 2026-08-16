import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OtpChannel } from '@prisma/client';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  ForgotPasswordDto,
  ListUsersQueryDto,
  LoginDto,
  MedicalHistoryDto,
  PatientOnboardingDto,
  PublicUserDto,
  RegisterDto,
  ResetPasswordDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { Public, CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user (customer, vendor, doctor, admin)' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email or phone + password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('otp/send')
  @ApiOperation({ summary: 'Send OTP via SMS or email' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify OTP code' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('password/forgot')
  @ApiOperation({ summary: 'Request password reset OTP' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    const channel = dto.contact.includes('@') ? OtpChannel.EMAIL : OtpChannel.SMS;
    return this.authService.sendOtp({ contact: dto.contact, channel });
  }

  @Public()
  @Get('users')
  @ApiOperation({ summary: 'List all users (public directory)' })
  @ApiResponse({ status: 200, type: [PublicUserDto] })
  getAllUsers(@Query() query: ListUsersQueryDto) {
    return this.authService.getAllUsers(query.role, query.status);
  }

  @Public()
  @Post('password/reset')
  @ApiOperation({ summary: 'Reset password with verified OTP' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('onboarding/patient')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Complete patient onboarding after registration' })
  patientOnboarding(@CurrentUser() user: JwtPayload, @Body() dto: PatientOnboardingDto) {
    return this.authService.completePatientOnboarding(user.sub, dto);
  }

  @Post('onboarding/medical-history')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Save medical history and meal times' })
  medicalHistory(@CurrentUser() user: JwtPayload, @Body() dto: MedicalHistoryDto) {
    return this.authService.completeMedicalHistory(user.sub, dto);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user with profiles' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }
}
