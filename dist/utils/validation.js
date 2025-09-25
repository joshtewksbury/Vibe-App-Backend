"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateUser = exports.validateCreatePost = exports.validateCreateEvent = exports.validateCreateDeal = exports.validateUpdateVenue = exports.validateCreateVenue = exports.validateSignIn = exports.validateSignUp = exports.updateUserSchema = exports.createPostSchema = exports.createEventSchema = exports.createDealSchema = exports.updateVenueSchema = exports.createVenueSchema = exports.signInSchema = exports.signUpSchema = void 0;
const joi_1 = __importDefault(require("joi"));
// Auth validation schemas
exports.signUpSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(8).required(),
    firstName: joi_1.default.string().min(1).max(50).required(),
    lastName: joi_1.default.string().min(1).max(50).required()
});
exports.signInSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().required()
});
// Venue validation schemas
exports.createVenueSchema = joi_1.default.object({
    name: joi_1.default.string().min(1).max(100).required(),
    category: joi_1.default.string().min(1).max(50).required(),
    location: joi_1.default.string().min(1).max(200).required(),
    latitude: joi_1.default.number().min(-90).max(90).required(),
    longitude: joi_1.default.number().min(-180).max(180).required(),
    capacity: joi_1.default.number().integer().min(1).required(),
    rating: joi_1.default.number().min(0).max(5).optional(),
    priceRange: joi_1.default.string().valid('$', '$$', '$$$', '$$$$').required(),
    pricing: joi_1.default.object().optional(),
    musicGenres: joi_1.default.array().items(joi_1.default.object()).optional(),
    openingHours: joi_1.default.object().required(),
    features: joi_1.default.array().items(joi_1.default.object()).optional(),
    bookingURL: joi_1.default.string().uri().optional(),
    phoneNumber: joi_1.default.string().optional(),
    images: joi_1.default.array().items(joi_1.default.string().uri()).optional(),
    placeId: joi_1.default.string().optional()
});
exports.updateVenueSchema = exports.createVenueSchema.fork(['name', 'category', 'location', 'latitude', 'longitude', 'capacity', 'priceRange', 'openingHours'], (schema) => schema.optional());
// Deal validation schemas
exports.createDealSchema = joi_1.default.object({
    title: joi_1.default.string().min(1).max(100).required(),
    description: joi_1.default.string().min(1).max(500).required(),
    discountPercentage: joi_1.default.number().integer().min(1).max(100).optional(),
    validFrom: joi_1.default.date().required(),
    validUntil: joi_1.default.date().greater(joi_1.default.ref('validFrom')).required(),
    termsAndConditions: joi_1.default.string().max(1000).optional()
});
// Event validation schemas
exports.createEventSchema = joi_1.default.object({
    title: joi_1.default.string().min(1).max(100).required(),
    description: joi_1.default.string().min(1).max(500).required(),
    startTime: joi_1.default.date().required(),
    endTime: joi_1.default.date().greater(joi_1.default.ref('startTime')).required(),
    ticketPrice: joi_1.default.number().min(0).optional(),
    capacity: joi_1.default.number().integer().min(1).optional(),
    eventType: joi_1.default.string().min(1).max(50).required(),
    imageUrl: joi_1.default.string().uri().optional()
});
// Post validation schemas
exports.createPostSchema = joi_1.default.object({
    content: joi_1.default.string().min(1).max(500).required(),
    imageUrl: joi_1.default.string().uri().optional(),
    tags: joi_1.default.array().items(joi_1.default.string().max(30)).max(10).optional()
});
// User validation schemas
exports.updateUserSchema = joi_1.default.object({
    firstName: joi_1.default.string().min(1).max(50).optional(),
    lastName: joi_1.default.string().min(1).max(50).optional(),
    dateOfBirth: joi_1.default.date().max('now').optional(),
    gender: joi_1.default.string().valid('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY').optional(),
    profileImage: joi_1.default.string().uri().optional(),
    musicPreferences: joi_1.default.array().items(joi_1.default.string().max(30)).max(20).optional(),
    venuePreferences: joi_1.default.array().items(joi_1.default.string().max(30)).max(20).optional(),
    goingOutFrequency: joi_1.default.string().valid('RARELY', 'OCCASIONALLY', 'REGULARLY', 'FREQUENTLY').optional(),
    location: joi_1.default.string().max(100).optional(),
    phoneNumber: joi_1.default.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional()
});
// Validation helper functions
const validateSignUp = (data) => exports.signUpSchema.validate(data);
exports.validateSignUp = validateSignUp;
const validateSignIn = (data) => exports.signInSchema.validate(data);
exports.validateSignIn = validateSignIn;
const validateCreateVenue = (data) => exports.createVenueSchema.validate(data);
exports.validateCreateVenue = validateCreateVenue;
const validateUpdateVenue = (data) => exports.updateVenueSchema.validate(data);
exports.validateUpdateVenue = validateUpdateVenue;
const validateCreateDeal = (data) => exports.createDealSchema.validate(data);
exports.validateCreateDeal = validateCreateDeal;
const validateCreateEvent = (data) => exports.createEventSchema.validate(data);
exports.validateCreateEvent = validateCreateEvent;
const validateCreatePost = (data) => exports.createPostSchema.validate(data);
exports.validateCreatePost = validateCreatePost;
const validateUpdateUser = (data) => exports.updateUserSchema.validate(data);
exports.validateUpdateUser = validateUpdateUser;
//# sourceMappingURL=validation.js.map