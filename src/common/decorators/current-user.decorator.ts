import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type JwtPayload = {
  sub: string;
  email: string | null;
  role: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
