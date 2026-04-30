import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/config', authController.getAuthConfig);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/google', authController.googleSignIn);
router.post('/refresh', authController.refresh);
router.post('/logout', requireAuth, authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

export default router;
