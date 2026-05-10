# Oralign Backend API - Complete Production-Ready Implementation

A complete, production-ready NestJS backend following clean architecture principles with full CRUD operations, authentication, RBAC, and Swagger documentation.

## 🏗️ Architecture Overview

### Clean Architecture Layers

```
Controller Layer
    ↓
Use Case/Service Layer
    ↓
Repository Layer
    ↓
Data Access (Prisma)
    ↓
Database
```

### Project Structure

```
src/
├── common/                          # Shared utilities
│   ├── decorators/                  # @CurrentUser, @Public, @Roles
│   ├── dto/                         # Common response DTOs
│   ├── exceptions/                  # Custom exceptions & filter
│   ├── guards/                      # JWT & Roles authentication guards
│   └── common.module.ts
├── auth/                            # Authentication module
│   ├── controllers/                 # Auth endpoints
│   ├── services/                    # Auth business logic
│   ├── strategies/                  # JWT strategy
│   ├── dto/                         # Auth request/response DTOs
│   └── auth.module.ts
├── users/                           # Users module
│   ├── controllers/                 # User CRUD endpoints
│   ├── services/                    # User business logic
│   ├── repositories/                # Data access layer
│   ├── dto/                         # User DTOs
│   └── users.module.ts
├── dentist-profile/                 # Dentist profiles module
│   ├── controllers/                 # Profile endpoints
│   ├── services/                    # Profile business logic
│   ├── repositories/                # Data access layer
│   ├── dto/                         # Profile DTOs
│   └── dentist-profile.module.ts
├── working-hours/                   # Working hours module
│   ├── controllers/                 # Working hours endpoints
│   ├── services/                    # Working hours logic
│   ├── repositories/                # Data access layer
│   ├── dto/                         # Working hours DTOs
│   └── working-hours.module.ts
├── prisma/                          # Prisma module
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── app.module.ts                    # Main app module
└── main.ts                          # Application entry point
```

## 🚀 Key Features

### 1. Complete Authentication System
- **Registration** (Sign Up) with email validation
- **Login** (Sign In) with password hashing & brute-force protection
- **Email Verification** flow
- **Password Reset** flow with secure tokens
- **JWT Tokens** with access & refresh tokens
- **Token Refresh** endpoint

### 2. Role-Based Access Control (RBAC)
- Three roles: `admin`, `dentist`, `designer`
- Guards and decorators for role-based route protection
- Resources protected at controller level

### 3. Security Features
- **Password Hashing** with bcryptjs (10 rounds)
- **JWT Authentication** with expiration times
- **Brute-force Protection** (account locks after 5 failed attempts)
- **Input Validation** with class-validator
- **Soft Deletes** for data recovery
- **SQL Injection Prevention** via Prisma ORM

### 4. Database Models
- **User** - Main user entity with verification status
- **DentistProfile** - Clinic information with geo-coordinates
- **WorkingHours** - Operating hours per day

### 5. API Documentation
- **Swagger/OpenAPI** integration
- Complete endpoint documentation
- Request/response schemas
- Bearer token authentication

## 📦 Installation

### Prerequisites
- Node.js 18+
- PostgreSQL database
- npm or yarn

### Setup Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd oralign-backend

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Setup database
npx prisma migrate dev --name initial_schema

# 5. Generate Prisma Client
npx prisma generate

# 6. Start development server
npm run start:dev
```

## 🔧 Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/oralign_db"

# Server
HTTP_PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
JWT_RESET_SECRET="your-super-secret-reset-key"

# Email (for password reset)
MAIL_HOST="smtp.gmail.com"
MAIL_PORT=587
MAIL_USER="your-email@gmail.com"
MAIL_PASSWORD="your-app-password"

# Frontend
FRONTEND_URL="http://localhost:5173"
```

## 📚 API Endpoints

### Authentication Endpoints

#### 1. Sign Up
```
POST /api/auth/sign-up
Content-Type: application/json

{
  "email": "dentist@example.com",
  "fullName": "Dr. John Doe",
  "password": "SecurePass123!",
  "phone": "+1234567890",
  "country": "USA"
}

Response: 201 Created
{
  "id": "uuid",
  "email": "dentist@example.com",
  "fullName": "Dr. John Doe",
  "role": "dentist",
  "isEmailVerified": false,
  "authToken": {
    "accessToken": "jwt-token",
    "refreshToken": "refresh-token",
    "expiresIn": 900
  }
}
```

#### 2. Sign In
```
POST /api/auth/sign-in
Content-Type: application/json

{
  "email": "dentist@example.com",
  "password": "SecurePass123!"
}

Response: 200 OK
{
  "id": "uuid",
  "email": "dentist@example.com",
  "fullName": "Dr. John Doe",
  "role": "dentist",
  "isEmailVerified": false,
  "authToken": {
    "accessToken": "jwt-token",
    "refreshToken": "refresh-token",
    "expiresIn": 900
  }
}
```

#### 3. Verify Email
```
POST /api/auth/verify-email
Content-Type: application/json

{
  "email": "dentist@example.com",
  "verificationCode": "123456"
}

Response: 200 OK
{
  "message": "Email verified successfully"
}
```

#### 4. Forgot Password
```
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "dentist@example.com"
}

Response: 200 OK
{
  "message": "Password reset email sent"
}
```

#### 5. Reset Password
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePass123!"
}

Response: 200 OK
{
  "message": "Password reset successfully"
}
```

#### 6. Refresh Token
```
POST /api/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "refresh-token"
}

Response: 200 OK
{
  "accessToken": "new-jwt-token",
  "refreshToken": "new-refresh-token",
  "expiresIn": 900
}
```

### User Management Endpoints

#### 1. Get Current User
```
GET /api/users/me
Authorization: Bearer {accessToken}

Response: 200 OK
{
  "id": "uuid",
  "email": "dentist@example.com",
  "fullName": "Dr. John Doe",
  "role": "dentist",
  "isActive": true,
  "isEmailVerified": true,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### 2. Update User Profile
```
PUT /api/users/:id
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "fullName": "Dr. Jane Doe",
  "phone": "+1987654320",
  "country": "Canada",
  "password": "NewPassword123!" // Optional
}

Response: 200 OK
{
  "id": "uuid",
  "email": "dentist@example.com",
  "fullName": "Dr. Jane Doe",
  "phone": "+1987654320",
  "country": "Canada",
  "role": "dentist",
  "isActive": true,
  "isEmailVerified": true,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-02T00:00:00Z"
}
```

#### 3. Get All Users (Admin Only)
```
GET /api/users?page=1&limit=10
Authorization: Bearer {adminToken}

Response: 200 OK
{
  "data": [...],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

#### 4. Delete User (Admin Only)
```
DELETE /api/users/:id
Authorization: Bearer {adminToken}

Response: 200 OK
{
  "message": "User deleted successfully"
}
```

### Dentist Profile Endpoints

#### 1. Create Dentist Profile
```
POST /api/dentist-profile
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "clinicName": "Smile Dental Clinic",
  "clinicAddress": "123 Main St",
  "city": "New York",
  "country": "USA",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "clinicPhone": "+1234567890",
  "clinicEmail": "clinic@example.com",
  "description": "Full-service dental clinic",
  "logoUrl": "/logos/smile-clinic.png"
}

Response: 201 Created
```

#### 2. Get All Dentist Profiles
```
GET /api/dentist-profile?page=1&limit=10

Response: 200 OK
{
  "data": [...],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

#### 3. Search by City
```
GET /api/dentist-profile/search/by-city?city=New York&page=1&limit=10

Response: 200 OK
{
  "data": [...],
  "total": 10,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

#### 4. Find Nearby Clinics (Geo Search)
```
GET /api/dentist-profile/search/nearby?latitude=40.7128&longitude=-74.0060&radiusKm=5&page=1&limit=10

Response: 200 OK
{
  "data": [...],
  "total": 5,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

#### 5. Get Profile by ID
```
GET /api/dentist-profile/:id

Response: 200 OK
{
  "id": "uuid",
  "userId": "uuid",
  "clinicName": "Smile Dental Clinic",
  ...
}
```

#### 6. Update Profile
```
PUT /api/dentist-profile/:id
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "clinicName": "Smile Dental Clinic - Updated",
  "city": "Los Angeles"
}

Response: 200 OK
```

#### 7. Delete Profile
```
DELETE /api/dentist-profile/:id
Authorization: Bearer {accessToken}

Response: 200 OK
{
  "message": "Dentist profile deleted successfully"
}
```

### Working Hours Endpoints

#### 1. Create Working Hours
```
POST /api/working-hours
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "dentistProfileId": "uuid",
  "dayOfWeek": "monday",
  "openTime": "09:00",
  "closeTime": "17:00",
  "isClosed": false
}

Response: 201 Created
```

#### 2. Get Working Hours by Dentist Profile
```
GET /api/working-hours/dentist-profile/:dentistProfileId

Response: 200 OK
[
  {
    "id": "uuid",
    "dentistProfileId": "uuid",
    "dayOfWeek": "monday",
    "openTime": "09:00",
    "closeTime": "17:00",
    "isClosed": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

#### 3. Get Working Hours by ID
```
GET /api/working-hours/:id

Response: 200 OK
{
  "id": "uuid",
  "dentistProfileId": "uuid",
  ...
}
```

#### 4. Update Working Hours
```
PUT /api/working-hours/:id
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "openTime": "08:30",
  "closeTime": "18:00"
}

Response: 200 OK
```

#### 5. Delete Working Hours
```
DELETE /api/working-hours/:id
Authorization: Bearer {accessToken}

Response: 200 OK
{
  "message": "Working hours deleted successfully"
}
```

## 🔐 Authentication & Authorization

### Token Lifecycle

1. **User Signs Up/Signs In**
   - Receives `accessToken` (15 minutes)
   - Receives `refreshToken` (7 days)

2. **Using the API**
   - Include accessToken in Authorization header: `Bearer {accessToken}`

3. **Token Expires**
   - Use refreshToken to get new accessToken
   - `POST /api/auth/refresh-token`

4. **Security Considerations**
   - Store tokens securely (httpOnly cookies preferred)
   - Don't expose tokens in URLs
   - Use HTTPS in production
   - Refresh tokens before expiration

### Role-Based Access Control

```typescript
User Roles:
- admin: Can manage users, view all data
- dentist: Own profile management, clinic operations
- designer: Design/content management (future)

Example Protected Route:
@Get()
@Roles(UserRole.admin)
getAllUsers() { ... }

// Only accessible by admin users
```

## 📖 Swagger Documentation

After starting the server, access documentation at:
```
http://localhost:3000/docs
```

All endpoints are documented with:
- Request schemas
- Response schemas
- Required parameters
- Bearer token authentication
- Example values

## 🧪 Testing the API

### Using cURL

```bash
# Sign Up
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "fullName": "Test User",
    "password": "SecurePass123!"
  }'

# Sign In
curl -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'

# Get Current User (with token)
curl -X GET http://localhost:3000/api/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Using Postman

1. Import endpoints from `http://localhost:3000/api-json`
2. Set environment variables for tokens
3. Use the pre-configured requests

## 🚀 Development Workflow

### Running the Application

```bash
# Development with hot-reload
npm run start:dev

# Build for production
npm run build

# Run production build
npm run start:prod

# Run linter
npm run lint

# Format code
npm run format
```

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name <migration_name>

# Apply migrations to production
npx prisma migrate deploy

# View database
npx prisma studio
```

## 📋 Database Schema

### User
```prisma
model User {
  id                  String
  email               String     @unique
  fullName            String
  passwordHash        String
  role                UserRole
  isEmailVerified     Boolean
  verificationStatus  VerificationStatus
  failedLoginAttempts Int
  lockedUntil         DateTime?
  createdAt           DateTime
  updatedAt           DateTime
  deletedAt           DateTime?  // Soft delete
}
```

### DentistProfile
```prisma
model DentistProfile {
  id               String
  userId           String     @unique
  clinicName       String
  clinicAddress    String?
  city             String?
  country          String?
  latitude         Float?
  longitude        Float?
  clinicPhone      String?
  clinicEmail      String?
  description      String?
  logoUrl          String?
  createdAt        DateTime
  updatedAt        DateTime
  deletedAt        DateTime?
}
```

### WorkingHours
```prisma
model WorkingHours {
  id               String
  dentistProfileId String
  dayOfWeek        DayOfWeek
  openTime         String      // "HH:mm"
  closeTime        String      // "HH:mm"
  isClosed         Boolean
  createdAt        DateTime
  updatedAt        DateTime
}
```

## 🛡️ Security Best Practices

1. **Never commit .env files**
2. **Use strong JWT secrets** (min 32 characters)
3. **Enable HTTPS** in production
4. **Use httpOnly cookies** for token storage
5. **Implement rate limiting** for auth endpoints
6. **Add CORS configuration** based on frontend URL
7. **Regular security updates** via npm audit
8. **Database backups** for business continuity
9. **Input validation** on all endpoints
10. **Error messages** don't expose sensitive info

## 🐛 Error Handling

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "message": "Email already registered",
  "errorCode": "EMAIL_EXISTS",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| EMAIL_EXISTS | 409 | Email already registered |
| INVALID_CREDENTIALS | 401 | Wrong password |
| ACCOUNT_LOCKED | 401 | Too many login attempts |
| USER_NOT_FOUND | 404 | User doesn't exist |
| UNAUTHORIZED | 401 | Invalid/expired token |
| FORBIDDEN | 403 | Insufficient permissions |

## 📊 Performance Considerations

1. **Database Indexes**
   - Indexed on email, role, deleted records
   - Geo-coordinates for nearby searches
   - User verification status

2. **Pagination**
   - Default limit: 10 items
   - Adjust with `?page=2&limit=25`

3. **Query Optimization**
   - Use repository pattern
   - Avoid N+1 queries
   - Select only needed fields

## 🔄 Scalability Improvements

- [ ] Redis caching for profiles
- [ ] Email queue (Bull/RabbitMQ)
- [ ] Search with Elasticsearch
- [ ] File upload to S3
- [ ] Real-time notifications with WebSockets
- [ ] GraphQL API alongside REST
- [ ] Microservices architecture

## 📝 Code Quality Standards

- ✅ TypeScript strict mode enabled
- ✅ ESLint with Prettier
- ✅ Clean architecture layers
- ✅ Comprehensive error handling
- ✅ Input validation on all endpoints
- ✅ Unit testable services
- ✅ Repository pattern for data access

## 🤝 Contributing

1. Create a feature branch
2. Follow the existing architecture
3. Write unit tests for services
4. Update documentation
5. Submit pull request

## 📄 License

MIT License - See LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check existing GitHub issues
2. Review API documentation at `/docs`
3. Check .env configuration
4. Verify database connection
5. Check console logs for errors

## 🎉 Next Steps

1. **Setup Development Environment**
   - Clone repository
   - Install dependencies
   - Configure .env
   - Run migrations

2. **Start Building**
   - Explore Swagger documentation
   - Test authentication flow
   - Create sample dentist profiles
   - Implement frontend integration

3. **Deploy to Production**
   - Configure production environment
   - Setup database backups
   - Enable monitoring
   - Setup CI/CD pipeline

---

**Built with ❤️ using NestJS, Prisma, PostgreSQL, and TypeScript**
