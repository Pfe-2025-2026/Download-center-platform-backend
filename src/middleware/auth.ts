import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ── P1 STUB ── Person 1 will implement full JWT verification + role-based checks
// For now, this middleware passes through all requests so P3 can test routes independently

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: "admin" | "viewer" };
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      const secret = process.env.JWT_SECRET || "dev-secret";
      const decoded = jwt.verify(token, secret) as { id: string; email: string; role: "admin" | "viewer" };
      req.user = decoded;
    } catch {
      // Token invalid — still allow through in dev; P1 will enforce rejection
    }
  }

  // TODO(P1): Return 401 if no valid token
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // TODO(P1): Enforce role check. For now, pass through.
    if (req.user && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
