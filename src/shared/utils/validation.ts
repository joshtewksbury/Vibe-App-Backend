import Joi from 'joi';

// Auth validation schemas
export const signUpSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  dateOfBirth: Joi.date().max('now').required()
});

export const signInSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Venue validation schemas
export const createVenueSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  category: Joi.string().min(1).max(50).required(),
  location: Joi.string().min(1).max(200).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  capacity: Joi.number().integer().min(1).required(),
  rating: Joi.number().min(0).max(5).optional(),
  priceRange: Joi.string().valid('$', '$$', '$$$', '$$$$').required(),
  pricing: Joi.object().optional(),
  musicGenres: Joi.array().items(Joi.object()).optional(),
  openingHours: Joi.object().required(),
  features: Joi.array().items(Joi.object()).optional(),
  bookingURL: Joi.string().uri().optional(),
  phoneNumber: Joi.string().optional(),
  images: Joi.array().items(Joi.string().uri()).optional(),
  placeId: Joi.string().optional()
});

export const updateVenueSchema = createVenueSchema.fork(
  ['name', 'category', 'location', 'latitude', 'longitude', 'capacity', 'priceRange', 'openingHours'],
  (schema) => schema.optional()
);

// Deal validation schemas
export const createDealSchema = Joi.object({
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().min(1).max(500).required(),
  discountPercentage: Joi.number().integer().min(1).max(100).optional(),
  validFrom: Joi.date().required(),
  validUntil: Joi.date().greater(Joi.ref('validFrom')).required(),
  termsAndConditions: Joi.string().max(1000).optional()
});

// Event validation schemas
export const createEventSchema = Joi.object({
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().min(1).max(500).required(),
  startTime: Joi.date().required(),
  endTime: Joi.date().greater(Joi.ref('startTime')).required(),
  ticketPrice: Joi.number().min(0).optional(),
  capacity: Joi.number().integer().min(1).optional(),
  eventType: Joi.string().min(1).max(50).required(),
  imageUrl: Joi.string().uri().optional()
});

// Post validation schemas
export const createPostSchema = Joi.object({
  content: Joi.string().min(1).max(500).required(),
  imageUrl: Joi.string().uri().optional(),
  tags: Joi.array().items(Joi.string().max(30)).max(10).optional()
});

// User validation schemas
export const updateUserSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  dateOfBirth: Joi.date().max('now').optional(),
  gender: Joi.string().valid('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY').optional(),
  profileImage: Joi.string().uri().optional(),
  musicPreferences: Joi.array().items(Joi.string().max(30)).max(20).optional(),
  venuePreferences: Joi.array().items(Joi.string().max(30)).max(20).optional(),
  goingOutFrequency: Joi.string().valid('RARELY', 'OCCASIONALLY', 'REGULARLY', 'FREQUENTLY').optional(),
  location: Joi.string().max(100).optional(),
  phoneNumber: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional()
});

// Validation helper functions
export const validateSignUp = (data: any) => signUpSchema.validate(data);
export const validateSignIn = (data: any) => signInSchema.validate(data);
export const validateCreateVenue = (data: any) => createVenueSchema.validate(data);
export const validateUpdateVenue = (data: any) => updateVenueSchema.validate(data);
export const validateCreateDeal = (data: any) => createDealSchema.validate(data);
export const validateCreateEvent = (data: any) => createEventSchema.validate(data);
export const validateCreatePost = (data: any) => createPostSchema.validate(data);
export const validateUpdateUser = (data: any) => updateUserSchema.validate(data);