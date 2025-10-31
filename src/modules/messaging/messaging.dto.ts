import Joi from 'joi';

// DTO interfaces
export interface CreateConversationDTO {
  friendId: string;
  type?: 'DIRECT' | 'GROUP';
  sharedEncryptionKey?: string;
}

export interface SendMessageDTO {
  conversationId: string;
  encryptedContent: string;
  iv: string;
  authTag?: string;
  messageType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'VENUE_SHARE' | 'LOCATION_SHARE';
  venueId?: string;
  mediaUrl?: string;
}

export interface GetMessagesDTO {
  conversationId: string;
  limit?: number;
  before?: string;
}

// Validation schemas
export const createConversationSchema = Joi.object({
  friendId: Joi.string().required().messages({
    'any.required': 'Friend ID is required'
  }),
  type: Joi.string().valid('DIRECT', 'GROUP').optional(),
  sharedEncryptionKey: Joi.string().optional()
});

export const sendMessageSchema = Joi.object({
  conversationId: Joi.string().required().messages({
    'any.required': 'Conversation ID is required'
  }),
  encryptedContent: Joi.string().required().messages({
    'any.required': 'Encrypted content is required'
  }),
  iv: Joi.string().required().messages({
    'any.required': 'IV (initialization vector) is required'
  }),
  authTag: Joi.string().optional(),
  messageType: Joi.string().valid('TEXT', 'IMAGE', 'VIDEO', 'VENUE_SHARE', 'LOCATION_SHARE').optional(),
  venueId: Joi.string().optional(),
  mediaUrl: Joi.string().uri().optional()
});

export const getMessagesSchema = Joi.object({
  limit: Joi.number().min(1).max(100).optional(),
  before: Joi.string().isoDate().optional()
});

// Validation helper functions
export const validateCreateConversation = (data: unknown) => createConversationSchema.validate(data);
export const validateSendMessage = (data: unknown) => sendMessageSchema.validate(data);
export const validateGetMessages = (data: unknown) => getMessagesSchema.validate(data);
