import Joi from 'joi';

// DTO interfaces
export interface SignUpDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface SignInDTO {
  email: string;
  password: string;
}

export interface AuthResponseDTO {
  token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    profileImage?: string | null;
    createdAt: Date;
  };
  expiresAt: Date;
}

// Validation schemas
export const signUpSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(8)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'any.required': 'Password is required'
    }),
  firstName: Joi.string()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.min': 'First name is required',
      'string.max': 'First name must be less than 50 characters',
      'any.required': 'First name is required'
    }),
  lastName: Joi.string()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.min': 'Last name is required',
      'string.max': 'Last name must be less than 50 characters',
      'any.required': 'Last name is required'
    })
});

export const signInSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

// Validation helper functions
export const validateSignUp = (data: unknown) => signUpSchema.validate(data);
export const validateSignIn = (data: unknown) => signInSchema.validate(data);
