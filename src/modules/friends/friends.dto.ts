import Joi from 'joi';

// DTO interfaces
export interface SendFriendRequestDTO {
  friendId?: string;
  friendEmail?: string;
}

export interface ShareLocationDTO {
  latitude: number;
  longitude: number;
  venueId?: string;
  venueName?: string;
  accuracy?: number;
}

export interface FriendshipDTO {
  id: string;
  userId: string;
  friendId: string;
  friendUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    profileImage?: string | null;
    location?: string | null;
    lastActiveAt?: Date | null;
  };
  status: string;
  requestedAt: Date;
  acceptedAt?: Date | null;
  lastKnownLocation?: any;
  isLocationSharingEnabled: boolean;
  lastSeen?: Date | null;
}

// Validation schemas
export const sendFriendRequestSchema = Joi.object({
  friendId: Joi.string().optional(),
  friendEmail: Joi.string().email().optional()
}).or('friendId', 'friendEmail').messages({
  'object.missing': 'Either friendId or friendEmail is required'
});

export const shareLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required().messages({
    'number.min': 'Latitude must be between -90 and 90',
    'number.max': 'Latitude must be between -90 and 90',
    'any.required': 'Latitude is required'
  }),
  longitude: Joi.number().min(-180).max(180).required().messages({
    'number.min': 'Longitude must be between -180 and 180',
    'number.max': 'Longitude must be between -180 and 180',
    'any.required': 'Longitude is required'
  }),
  venueId: Joi.string().optional(),
  venueName: Joi.string().optional(),
  accuracy: Joi.number().min(0).optional()
});

export const searchQuerySchema = Joi.object({
  query: Joi.string().min(1).required().messages({
    'string.min': 'Search query cannot be empty',
    'any.required': 'Search query is required'
  })
});

// Validation helper functions
export const validateSendFriendRequest = (data: unknown) => sendFriendRequestSchema.validate(data);
export const validateShareLocation = (data: unknown) => shareLocationSchema.validate(data);
export const validateSearchQuery = (data: unknown) => searchQuerySchema.validate(data);
