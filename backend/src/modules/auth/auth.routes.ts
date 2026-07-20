import { Router } from 'express';
import { validate } from '@middlewares/validate.middleware';
import { authenticate } from '@middlewares/auth.middleware';
import { authLimiter, refreshLimiter } from '@middlewares/rateLimit.middleware';
import { authController } from './auth.controller';
import { loginSchema, refreshSchema, registerSchema } from './auth.validation';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', refreshLimiter, validate(refreshSchema), authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
