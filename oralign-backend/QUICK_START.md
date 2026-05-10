# Quick Start Guide

## Installation (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your PostgreSQL connection

# 3. Setup database
npx prisma migrate dev

# 4. Start development server
npm run start:dev
```

Server running on: `http://localhost:3000`
API Docs: `http://localhost:3000/docs`

## Authentication Flow

### 1. Sign Up
```bash
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dentist@clinic.com",
    "fullName": "Dr. John Doe",
    "password": "SecurePass123!",
    "phone": "+1234567890",
    "country": "USA"
  }'
```

**Response includes**: `accessToken`, `refreshToken`, user info

### 2. Sign In
```bash
curl -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dentist@clinic.com",
    "password": "SecurePass123!"
  }'
```

### 3. Use Token
```bash
curl -X GET http://localhost:3000/api/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Create Dentist Profile

```bash
curl -X POST http://localhost:3000/api/dentist-profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clinicName": "Smile Dental Clinic",
    "city": "New York",
    "country": "USA",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "clinicPhone": "+1234567890",
    "clinicEmail": "clinic@smile.com",
    "description": "Full-service dental clinic with modern equipment"
  }'
```

## Add Working Hours

```bash
curl -X POST http://localhost:3000/api/working-hours \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dentistProfileId": "PROFILE_ID_FROM_ABOVE",
    "dayOfWeek": "monday",
    "openTime": "09:00",
    "closeTime": "17:00",
    "isClosed": false
  }'
```

## Search Clinics

### By City
```bash
curl "http://localhost:3000/api/dentist-profile/search/by-city?city=New York"
```

### Nearby (5km radius)
```bash
curl "http://localhost:3000/api/dentist-profile/search/nearby?latitude=40.7128&longitude=-74.0060&radiusKm=5"
```

## Swagger Documentation

Open browser to: `http://localhost:3000/docs`

## Available Commands

```bash
npm run start:dev      # Development with hot-reload
npm run build          # Build for production
npm run start:prod     # Run production build
npm run lint           # ESLint check and fix
npm run format         # Format with Prettier
npm run test           # Run tests
npm test:e2e           # Run E2E tests
```

## Architecture Layers

```
Controller (HTTP Handler)
    ↓
Service (Business Logic)
    ↓
Repository (Data Access)
    ↓
Prisma (ORM)
    ↓
PostgreSQL Database
```

## Key Features

✅ **Complete Authentication**
  - Sign up, sign in, email verification
  - Password reset flow
  - JWT with refresh tokens
  - Brute-force protection

✅ **CRUD Operations**
  - Users, Dentist Profiles, Working Hours
  - Full pagination support
  - Soft deletes for data recovery

✅ **Security**
  - Password hashing with bcrypt
  - Role-based access control (RBAC)
  - Input validation (class-validator)
  - Authorization guards

✅ **Search Capabilities**
  - Search clinics by city
  - Geo-proximity search
  - Pagination on all lists

✅ **Documentation**
  - Swagger/OpenAPI integration
  - Type-safe with TypeScript strict mode
  - Clean code architecture

## Troubleshooting

### Database Connection Error
```bash
# Check .env DATABASE_URL
# Verify PostgreSQL is running
psql -U postgres -c "SELECT 1"
```

### Migration Error
```bash
# Reset database (dev only)
npx prisma migrate reset

# Verify schema
npx prisma studio
```

### Port Already in Use
```bash
# Change HTTP_PORT in .env
HTTP_PORT=3001
```

### JWT Token Invalid
```bash
# Get new token via sign-in
# Include token in header: "Authorization: Bearer TOKEN"
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/oralign_db"

# Server
HTTP_PORT=3000
NODE_ENV=development

# JWT (Change these in production!)
JWT_SECRET="change-this-to-random-string-32-chars"
JWT_REFRESH_SECRET="change-this-to-random-string-32-chars"

# Email (for password reset)
MAIL_HOST="smtp.gmail.com"
MAIL_PORT=587
MAIL_USER="your-email@gmail.com"
MAIL_PASSWORD="your-app-password"
```

## API Response Format

### Success (200)
```json
{
  "id": "uuid",
  "email": "dentist@example.com",
  "fullName": "Dr. John Doe",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Error (4xx, 5xx)
```json
{
  "statusCode": 400,
  "message": "Email already registered",
  "errorCode": "EMAIL_EXISTS",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Paginated List
```json
{
  "data": [...],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

## Production Checklist

- [ ] Set strong JWT secrets in environment
- [ ] Enable HTTPS
- [ ] Setup database backups
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Setup error logging/monitoring
- [ ] Use httpOnly cookies for tokens
- [ ] Configure environment variables
- [ ] Run `npm run build` successfully
- [ ] Test all endpoints
- [ ] Setup CI/CD pipeline

## Next Steps

1. **Frontend Integration**
   - Import API_DOCUMENTATION.md into frontend project
   - Setup API client with BASE_URL = empty (relative URLs)
   - Implement token refresh logic

2. **Database Enhancements**
   - Add caching (Redis)
   - Add full-text search
   - Setup read replicas

3. **Features**
   - Email notifications
   - Real-time updates (WebSockets)
   - Advanced search filters
   - Reviews/ratings system

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)

---

**Everything you need is in the codebase. Read the code, it's well-documented!**
