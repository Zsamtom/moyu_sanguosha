import type { RequestHandler } from "express";
import { asyncHandler, HttpError } from "../errors.js";
import type { PublicUser, UserStore } from "../users.js";

export interface AuthLocals {
  user: PublicUser;
}

export function requireAuth(users: UserStore): RequestHandler {
  return asyncHandler(async (request, response, next) => {
    if (response.locals.user) {
      next();
      return;
    }
    const userId = request.session.userId;
    if (!userId) throw new HttpError(401, "UNAUTHENTICATED", "请先登录");

    const authenticated = await users.findSessionUser(userId);
    if (!authenticated) {
      request.session.destroy(() => undefined);
      throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效");
    }
    const user = authenticated.user;
    if (user.disabled) {
      request.session.destroy(() => undefined);
      throw new HttpError(403, "ACCOUNT_DISABLED", "账号已被停用");
    }
    if (authenticated.sessionVersion !== request.session.authVersion) {
      request.session.destroy(() => undefined);
      throw new HttpError(401, "UNAUTHENTICATED", "登录状态已失效");
    }

    response.locals.user = user;
    next();
  });
}

export const requireAdmin: RequestHandler = (_request, response, next) => {
  const user = response.locals.user as PublicUser | undefined;
  if (!user || user.role !== "admin") {
    next(new HttpError(403, "FORBIDDEN", "需要管理员权限"));
    return;
  }
  next();
};

export const requirePasswordChangeComplete: RequestHandler = (_request, response, next) => {
  const user = response.locals.user as PublicUser | undefined;
  if (!user) {
    next(new HttpError(401, "UNAUTHENTICATED", "请先登录"));
    return;
  }
  if (user.mustChangePassword) {
    next(new HttpError(403, "PASSWORD_CHANGE_REQUIRED", "请先修改初始密码"));
    return;
  }
  next();
};

export function currentUser(response: { locals: Record<string, unknown> }): PublicUser {
  const user = response.locals.user as PublicUser | undefined;
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "请先登录");
  return user;
}
