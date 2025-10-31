import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';
import { SignUpDTO, SignInDTO, AuthResponseDTO } from './auth.dto';

export class AuthService {
  private readonly saltRounds: number;
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor() {
    this.saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    this.jwtSecret = process.env.JWT_SECRET || '';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  /**
   * Register a new user
   */
  async signUp(data: SignUpDTO): Promise<AuthResponseDTO> {
    const { email, password, firstName, lastName } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        firstName,
        lastName,
        passwordHash
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        profileImage: true,
        createdAt: true
      }
    });

    // Generate JWT token
    const token = this.generateToken(user.id, user.email);
    const expiresAt = this.getTokenExpirationDate();

    return {
      token,
      user,
      expiresAt
    };
  }

  /**
   * Sign in an existing user
   */
  async signIn(data: SignInDTO): Promise<AuthResponseDTO> {
    const { email, password } = data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last active time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() }
    });

    // Generate JWT token
    const token = this.generateToken(user.id, user.email);
    const expiresAt = this.getTokenExpirationDate();

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profileImage: user.profileImage,
        createdAt: user.createdAt
      },
      expiresAt
    };
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(userId: string, email: string): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateToken(userId, email);
    const expiresAt = this.getTokenExpirationDate();

    return { token, expiresAt };
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        profileImage: true,
        musicPreferences: true,
        venuePreferences: true,
        goingOutFrequency: true,
        location: true,
        phoneNumber: true,
        role: true,
        venueIds: true,
        createdAt: true,
        lastActiveAt: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: string, email: string): string {
    return jwt.sign(
      { userId, email },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn } as jwt.SignOptions
    );
  }

  /**
   * Get token expiration date
   */
  private getTokenExpirationDate(): Date {
    // Default to 7 days
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}

// Export singleton instance
export const authService = new AuthService();
