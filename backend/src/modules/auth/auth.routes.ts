import { Router } from 'express';
import { validate } from '@middlewares/validate.middleware';
import { authenticate } from '@middlewares/auth.middleware';
import { authLimiter, refreshLimiter } from '@middlewares/rateLimit.middleware';
import { authController } from './auth.controller';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.validation';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', refreshLimiter, validate(refreshSchema), authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

// authLimiter (20/15min) frena el abuso del formulario abierto de recuperacion.
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

export default router;
