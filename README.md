# Vibe Backend API

A Node.js/Express backend for the Vibe nightlife app with PostgreSQL database, JWT authentication, and real-time venue data.

## Features

- 🔐 JWT-based authentication with role-based access control (RBAC)
- 🏢 Venue management with real-time occupancy tracking
- 📊 Analytics and reporting for venue managers
- 🎉 Deals, events, and posts management
- 🔄 Real-time busy status integration with SerpAPI and Google Places
- 📱 RESTful API designed for mobile apps
- 🛡️ Security: Rate limiting, CORS, audit logging
- 📦 Database: PostgreSQL with Prisma ORM

## Architecture

This backend follows the requirements from your architecture refactor:

### ✅ Security & API Keys
- All API keys (SerpAPI, Google Places) are server-side only
- No sensitive data exposed to mobile clients
- JWT tokens stored securely in iOS Keychain

### ✅ Authentication & Authorization
- JWT-based authentication
- Role-based access control (USER, VENUE_MANAGER, ADMIN)
- Venue managers can only access their assigned venues
- Refresh token mechanism

### ✅ Data Architecture
- PostgreSQL database with proper relations
- Prisma ORM for type safety
- Audit logging for all sensitive operations
- Real-time busy snapshots stored in database

### ✅ API Design
- RESTful endpoints matching iOS app expectations
- Venue data served from database, not static files
- Aggregated analytics for venue managers
- Rate limiting and security middleware

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. Clone and install dependencies:
```bash
cd VibeBackend
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database URL and API keys
```

3. Set up the database:
```bash
npm run generate  # Generate Prisma client
npm run migrate   # Run database migrations
```

4. Start development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/vibe_db"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_EXPIRES_IN="7d"
BCRYPT_ROUNDS=12

# API Keys (server-side only)
SERP_API_KEY="your-serp-api-key"
GOOGLE_PLACES_API_KEY="your-google-places-api-key"

# Server Configuration
PORT=3000
NODE_ENV="development"

# CORS Origins
ALLOWED_ORIGINS="http://localhost:3000,https://app.vibe.com"
```

## API Endpoints

### Authentication
- `POST /auth/signup` - Create new user account
- `POST /auth/signin` - Sign in user
- `POST /auth/signout` - Sign out user
- `POST /auth/refresh` - Refresh JWT token
- `GET /auth/me` - Get current user profile

### Venues
- `GET /venues` - Get all venues (with filtering)
- `GET /venues/:id` - Get single venue details
- `GET /venues/:id/busy` - Get venue busy data/snapshots
- `GET /venues/:id/busy/aggregates` - Get aggregated busy analytics
- `POST /venues` - Create venue (Admin only)
- `PUT /venues/:id` - Update venue (Admin only)

### Venue Management (RBAC Protected)
- `POST /venues/:id/deals` - Create deal (Manager/Admin)
- `POST /venues/:id/events` - Create event (Manager/Admin)
- `POST /venues/:id/posts` - Create post (Manager/Admin)
- `GET /venues/:id/analytics/overview` - Get analytics (Manager/Admin)

### Feed
- `GET /feed` - Get personalized feed
- `GET /feed/trending` - Get trending content

### Users
- `PUT /users/me` - Update user profile
- `GET /users/me/activity` - Get user activity
- `DELETE /users/me` - Delete user account

## Database Schema

Key models:
- `User` - User accounts with RBAC
- `Venue` - Venue information and metadata
- `BusySnapshot` - Real-time occupancy data points
- `Deal` - Promotional deals
- `Event` - Venue events
- `Post` - User-generated content
- `AuditLog` - Security audit trail

## Security Features

### Rate Limiting
- Auth endpoints: 5 requests per 15 minutes
- Account creation: 3 requests per hour
- General API: 100 requests per 15 minutes

### Authentication
- JWT tokens with expiration
- Secure password hashing (bcrypt)
- Role-based access control
- Venue-specific access for managers

### Audit Logging
- All sensitive operations logged
- IP address and user agent tracking
- Sensitive data redaction

## Deployment

### Production Checklist

1. Set up PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Set up SSL/TLS certificates
5. Configure reverse proxy (nginx)
6. Set up monitoring and logging

### Docker Deployment

```bash
# Build image
docker build -t vibe-backend .

# Run with database
docker-compose up -d
```

## API Integration with iOS

The iOS app should:

1. Set `baseURL` to your API endpoint (e.g., `https://api.vibe.app`)
2. Include `Authorization: Bearer <token>` header in all requests
3. Handle token refresh when receiving 401 responses
4. Cache venue data with 5-minute expiry
5. Use the new endpoint structure:
   - `/venues` instead of static JSON files
   - `/venues/:id/busy` for real-time data
   - `/auth/*` for authentication

## Development

### Scripts
- `npm run dev` - Development server with hot reload
- `npm run build` - Build TypeScript
- `npm run start` - Start production server
- `npm run migrate` - Run database migrations
- `npm run studio` - Open Prisma Studio
- `npm test` - Run tests

### Code Structure
```
src/
├── routes/          # API route handlers
├── middleware/      # Express middleware
├── services/        # Business logic & external APIs
├── utils/          # Utility functions
└── server.ts       # Main application entry
```

## Monitoring & Analytics

The backend provides:
- Real-time venue occupancy tracking
- Aggregated analytics for venue managers
- Audit trails for security
- Performance monitoring endpoints

## Contributing

1. Follow TypeScript strict mode
2. Use Prisma for all database operations
3. Add validation for all inputs
4. Include audit logging for sensitive operations
5. Test all new endpoints

## License

MIT License