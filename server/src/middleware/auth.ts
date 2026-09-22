import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'edara-secret-key-change-in-production';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'member';
  display_name: string;
  officer_id?: number;
  // A read-only زائر seat. Carried so the client can render the guest screen; every server
  // side denial is still decided from the database, never from this claim.
  is_guest?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'جلسة منتهية - يرجى إعادة تسجيل الدخول' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'صلاحيات غير كافية' });
    return;
  }
  next();
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
}

// Verify a raw JWT (used for SSE, where EventSource can't send headers).
export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}
