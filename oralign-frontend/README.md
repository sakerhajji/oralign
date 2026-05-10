#  Oralign Frontend

Production-ready Next.js frontend for Oralign dental practice management system.

##  Features

-  Complete authentication with JWT & auto-refresh
-  User management (CRUD operations)  
-  Dashboard with user stats
-  Modern UI with shadcn/ui components
-  Optimized with React Query
-  Fully responsive design
-  TypeScript strict mode (100% type-safe)

##  Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your backend URL

# Start development server
npm run dev
```

Visit http://localhost:3001

##  Requirements

- Node.js 18+
- Backend API running on http://localhost:3000

##  Project Structure

```
src/
 app/                    # Next.js pages
    login/             # Login page
    signup/            # Registration  
    dashboard/         # Protected dashboard
    ...
 components/            # React components
    ui/               # shadcn/ui components
    users/            # User management
 lib/
│    api/              # API services
    hooks/            # React Query hooks
    providers/        # Context providers
    schemas/          # Zod validation
    types/            # TypeScript types
 middleware.ts         # Route protection
```

##  Features Implemented

###  Authentication
- Sign up with email verification
- Login with JWT tokens
- Forgot/reset password flow
- Email verification
- Automatic token refresh
- Secure logout

###  Dashboard
- Protected layout with sidebar
- User stats and info
- Role-based quick actions
- Responsive navigation

###  User Management (Admin)
- List users with pagination
- Create new users
- Edit user information
- View user details
- Delete users
- Search and filter

##  Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 |
| Language | TypeScript 5 |
| UI Library | shadcn/ui |
| State Management | TanStack Query v5 |
| Forms | React Hook Form |
| Validation | Zod |
| HTTP Client | Axios |
| Styling | Tailwind CSS 4 |

##  API Integration

Connects to backend at `/api/*`:

- `/auth/*` - Authentication endpoints
- `/users/*` - User management
- `/dentist-profile/*` - Clinic profiles
- `/working-hours/*` - Schedule management

##  Security

- JWT authentication with refresh tokens
- Protected routes via middleware
- Input validation (client + server)
- XSS protection
- Secure password requirements
- Token expiration handling

##  UI Components

20+ shadcn/ui components:
- Forms (button, input, label, select)
- Data (table, badge, avatar)
- Feedback (sonner, skeleton)
- Navigation (sidebar, breadcrumb)
- Layout (card, dialog, sheet)

##  Scripts

```bash
npm run dev      # Development server (port 3001)
npm run build    # Production build
npm start        # Production server
npm run lint     # Run ESLint
```

##  Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_APP_NAME=Oralign
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

##  Documentation

- [Implementation Summary](https://github.com/.../IMPLEMENTATION_SUMMARY.md)
- [API Documentation](https://github.com/.../API_DOCUMENTATION.md)
- [Architecture Guide](https://github.com/.../ARCHITECTURE.md)

##  Testing

```bash
# Run tests
npm test

# Coverage
npm run test:coverage
```

##  Deployment

### Build

```bash
npm run build
```

### Environment Setup

Set these in your deployment platform:
- `NEXT_PUBLIC_API_URL` - Your backend API URL
- `NEXT_PUBLIC_APP_URL` - Your frontend URL

##  Troubleshooting

**Port in use:**
```bash
npx kill-port 3001
```

**API connection issues:**
- Ensure backend is running
- Check `.env.local` configuration
- Verify CORS settings

**TypeScript errors:**
Restart TS server in VS Code

##  License

Copyright  2026 Oralign

---

Built with  using Next.js and shadcn/ui