import { Request, Response } from 'express';
import { authService } from './auth.service';
import { validateSignUp, validateSignIn } from './auth.dto';
import { AuthenticatedRequest } from '../../shared/middleware/auth';

export class AuthController {
  /**
   * POST /auth/signup
   * Register a new user
   */
  async signUp(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const { error, value } = validateSignUp(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      // Sign up user
      const result = await authService.signUp(value);

      res.status(201).json({
        message: 'User created successfully',
        ...result
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          res.status(409).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * POST /auth/signin
   * Sign in an existing user
   */
  async signIn(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const { error, value } = validateSignIn(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      // Sign in user
      const result = await authService.signIn(value);

      res.json({
        message: 'Signed in successfully',
        ...result
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid')) {
          res.status(401).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * POST /auth/signout
   * Sign out (client-side token removal)
   */
  async signOut(req: AuthenticatedRequest, res: Response): Promise<void> {
    // JWT tokens are stateless - client handles token removal
    res.json({ message: 'Signed out successfully' });
  }

  /**
   * POST /auth/refresh
   * Refresh authentication token
   */
  async refreshToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await authService.refreshToken(req.user.id, req.user.email);

      res.json(result);
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * GET /auth/me
   * Get current user profile
   */
  async getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = await authService.getCurrentUser(req.user.id);

      res.json({ user });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
}

// Export singleton instance
export const authController = new AuthController();
