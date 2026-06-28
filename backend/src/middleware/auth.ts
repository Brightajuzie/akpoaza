import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const DUMMY_JWT_SECRET = 'super-secret-dummy-key';
const JWT_SECRET = process.env.JWT_SECRET || DUMMY_JWT_SECRET;

if (JWT_SECRET === DUMMY_JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn(
    '[SECURITY WARNING] JWT_SECRET is not set — using the insecure default key. ' +
    'Set a strong JWT_SECRET environment variable before deploying to production!'
  );
}

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};
