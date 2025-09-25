import Joi from 'joi';
export declare const signUpSchema: Joi.ObjectSchema<any>;
export declare const signInSchema: Joi.ObjectSchema<any>;
export declare const createVenueSchema: Joi.ObjectSchema<any>;
export declare const updateVenueSchema: Joi.ObjectSchema<any>;
export declare const createDealSchema: Joi.ObjectSchema<any>;
export declare const createEventSchema: Joi.ObjectSchema<any>;
export declare const createPostSchema: Joi.ObjectSchema<any>;
export declare const updateUserSchema: Joi.ObjectSchema<any>;
export declare const validateSignUp: (data: any) => Joi.ValidationResult<any>;
export declare const validateSignIn: (data: any) => Joi.ValidationResult<any>;
export declare const validateCreateVenue: (data: any) => Joi.ValidationResult<any>;
export declare const validateUpdateVenue: (data: any) => Joi.ValidationResult<any>;
export declare const validateCreateDeal: (data: any) => Joi.ValidationResult<any>;
export declare const validateCreateEvent: (data: any) => Joi.ValidationResult<any>;
export declare const validateCreatePost: (data: any) => Joi.ValidationResult<any>;
export declare const validateUpdateUser: (data: any) => Joi.ValidationResult<any>;
//# sourceMappingURL=validation.d.ts.map