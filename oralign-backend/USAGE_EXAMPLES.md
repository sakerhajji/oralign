# API Usage Examples & Common Scenarios

## Complete User Workflow

### Scenario 1: New User Registration & Profile Setup

#### Step 1: Sign Up
```bash
# Request
POST /api/auth/sign-up
Content-Type: application/json

{
  "email": "dr.smith@clinic.com",
  "fullName": "Dr. James Smith",
  "password": "SecurePassword123!",
  "phone": "+1-555-0123",
  "country": "United States"
}

# Response (201 Created)
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "dr.smith@clinic.com",
  "fullName": "Dr. James Smith",
  "role": "dentist",
  "isEmailVerified": false,
  "authToken": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  }
}
```

#### Step 2: Store Token (Securely)
```javascript
// Frontend - Store in secure httpOnly cookie (if using server)
// or in localStorage (with precautions)
localStorage.setItem('accessToken', authToken.accessToken);
localStorage.setItem('refreshToken', authToken.refreshToken);
localStorage.setItem('tokenExpiresAt', Date.now() + 900000);
```

#### Step 3: Verify Email
```bash
# Request - User gets verification code via email
POST /api/auth/verify-email
Content-Type: application/json

{
  "email": "dr.smith@clinic.com",
  "verificationCode": "123456"  # From email
}

# Response (200 OK)
{
  "message": "Email verified successfully"
}
```

#### Step 4: Create Dentist Profile
```bash
# Request - Authenticated request with token
POST /api/dentist-profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "clinicName": "Smile Dental Clinic",
  "clinicAddress": "123 Main Street, Suite 100",
  "city": "San Francisco",
  "country": "United States",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "clinicPhone": "+1-555-0123",
  "clinicEmail": "contact@smiledental.com",
  "description": "Modern dental clinic specializing in implants and orthodontics",
  "logoUrl": "/logos/smile-dental-clinic.png"
}

# Response (201 Created)
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "clinicName": "Smile Dental Clinic",
  "clinicAddress": "123 Main Street, Suite 100",
  "city": "San Francisco",
  "country": "United States",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "clinicPhone": "+1-555-0123",
  "clinicEmail": "contact@smiledental.com",
  "description": "Modern dental clinic specializing in implants and orthodontics",
  "logoUrl": "/logos/smile-dental-clinic.png",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### Step 5: Add Working Hours (for each day)
```bash
# Request - Add Monday hours
POST /api/working-hours
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "dentistProfileId": "660e8400-e29b-41d4-a716-446655440000",
  "dayOfWeek": "monday",
  "openTime": "09:00",
  "closeTime": "17:00",
  "isClosed": false
}

# Response (201 Created)
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "dentistProfileId": "660e8400-e29b-41d4-a716-446655440000",
  "dayOfWeek": "monday",
  "openTime": "09:00",
  "closeTime": "17:00",
  "isClosed": false,
  "createdAt": "2024-01-15T10:35:00Z",
  "updatedAt": "2024-01-15T10:35:00Z"
}

# Repeat for each day of the week...
```

---

## Scenario 2: Patient Discovering Dentists

#### Step 1: Get All Dental Clinics
```bash
# Request - No authentication needed
GET /api/dentist-profile?page=1&limit=20

# Response (200 OK)
{
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "clinicName": "Smile Dental Clinic",
      "city": "San Francisco",
      "country": "United States",
      "clinicPhone": "+1-555-0123",
      "clinicEmail": "contact@smiledental.com",
      "description": "Modern dental clinic specializing in implants...",
      "logoUrl": "/logos/smile-dental-clinic.png",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    },
    // ... more clinics
  ],
  "total": 152,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

#### Step 2: Search by City
```bash
# Request - Find clinics in New York
GET /api/dentist-profile/search/by-city?city=New York&page=1&limit=10

# Response (200 OK)
{
  "data": [
    // ... clinics in New York
  ],
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

#### Step 3: Find Nearby Clinics
```bash
# Request - Find clinics near user location
GET /api/dentist-profile/search/nearby?latitude=40.7128&longitude=-74.0060&radiusKm=5&page=1&limit=10

# Response (200 OK)
{
  "data": [
    // ... clinics within 5km of user location
  ],
  "total": 8,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

#### Step 4: View Clinic Details & Hours
```bash
# Request - Get specific clinic
GET /api/dentist-profile/660e8400-e29b-41d4-a716-446655440000

# Response (200 OK)
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "clinicName": "Smile Dental Clinic",
  // ... full clinic details
}

# Request - Get clinic working hours
GET /api/working-hours/dentist-profile/660e8400-e29b-41d4-a716-446655440000

# Response (200 OK)
[
  {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "dentistProfileId": "660e8400-e29b-41d4-a716-446655440000",
    "dayOfWeek": "monday",
    "openTime": "09:00",
    "closeTime": "17:00",
    "isClosed": false
  },
  // ... more days
]
```

---

## Scenario 3: Existing User Login & Update Profile

#### Step 1: Sign In
```bash
# Request
POST /api/auth/sign-in
Content-Type: application/json

{
  "email": "dr.smith@clinic.com",
  "password": "SecurePassword123!"
}

# Response (200 OK)
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "dr.smith@clinic.com",
  "fullName": "Dr. James Smith",
  "role": "dentist",
  "isEmailVerified": true,
  "authToken": {
    "accessToken": "NEW_JWT_TOKEN",
    "refreshToken": "NEW_REFRESH_TOKEN",
    "expiresIn": 900
  }
}
```

#### Step 2: Update User Profile
```bash
# Request - Update personal info
PUT /api/users/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer NEW_JWT_TOKEN
Content-Type: application/json

{
  "fullName": "Dr. James Smith MD",
  "phone": "+1-555-9999",
  "country": "Canada",
  "password": "NewSecurePassword456!"
}

# Response (200 OK)
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "dr.smith@clinic.com",
  "fullName": "Dr. James Smith MD",
  "phone": "+1-555-9999",
  "country": "Canada",
  "role": "dentist",
  "isActive": true,
  "isEmailVerified": true,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:45:00Z"
}
```

#### Step 3: Update Clinic Profile
```bash
# Request - Update clinic info
PUT /api/dentist-profile/660e8400-e29b-41d4-a716-446655440000
Authorization: Bearer NEW_JWT_TOKEN
Content-Type: application/json

{
  "description": "Updated description - now with 3D imaging",
  "clinicPhone": "+1-555-NEW-PHONE",
  "logoUrl": "/logos/smile-dental-updated.png"
}

# Response (200 OK)
{
  // ... updated clinic details
}
```

---

## Scenario 4: Handle Token Expiration

#### Detecting Token Expiration
```javascript
// Frontend implementation
const isTokenExpired = () => {
  const expiresAt = localStorage.getItem('tokenExpiresAt');
  return Date.now() >= expiresAt;
};

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (response.ok) {
    const { accessToken, expiresIn } = await response.json();
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('tokenExpiresAt', Date.now() + (expiresIn * 1000));
    return accessToken;
  } else {
    // Token refresh failed, go to login
    window.location.href = '/login';
  }
};
```

#### Making Authenticated Requests
```javascript
// Wrapper for API calls
async function apiCall(url, options = {}) {
  let token = localStorage.getItem('accessToken');

  // Check if token expired
  if (isTokenExpired()) {
    token = await refreshAccessToken();
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    // Try to refresh and retry
    token = await refreshAccessToken();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    });
  }

  return response;
}

// Usage
const profile = await apiCall('/api/dentist-profile/660e8400-e29b-41d4-a716-446655440000');
```

---

## Scenario 5: Error Handling

### Invalid Credentials
```bash
# Request
POST /api/auth/sign-in
Content-Type: application/json

{
  "email": "dr.smith@clinic.com",
  "password": "WrongPassword"
}

# Response (401 Unauthorized)
{
  "statusCode": 401,
  "message": "Invalid email or password",
  "timestamp": "2024-01-15T10:50:00Z"
}
```

### Account Locked (Brute Force)
```bash
# After 5 failed login attempts...

# Response (401 Unauthorized)
{
  "statusCode": 401,
  "message": "Account locked due to too many login attempts",
  "timestamp": "2024-01-15T10:51:00Z"
}
# Account unlocks after 15 minutes
```

### Email Already Exists
```bash
# Request - Try to sign up with existing email
POST /api/auth/sign-up
Content-Type: application/json

{
  "email": "dr.smith@clinic.com",
  "fullName": "Another User",
  "password": "Password123!"
}

# Response (409 Conflict)
{
  "statusCode": 409,
  "message": "Email already registered",
  "errorCode": "EMAIL_EXISTS",
  "timestamp": "2024-01-15T10:52:00Z"
}
```

### Validation Error
```bash
# Request - Invalid data
POST /api/auth/sign-up
Content-Type: application/json

{
  "email": "not-an-email",
  "fullName": "J",  // Too short
  "password": "short"  // Too short
}

# Response (400 Bad Request)
{
  "statusCode": 400,
  "message": "Validation failed",
  "timestamp": "2024-01-15T10:53:00Z"
}
```

### Unauthorized (Missing Token)
```bash
# Request
GET /api/users/550e8400-e29b-41d4-a716-446655440000
# No Authorization header

# Response (401 Unauthorized)
{
  "statusCode": 401,
  "message": "Invalid or expired token",
  "timestamp": "2024-01-15T10:54:00Z"
}
```

### Forbidden (Insufficient Permissions)
```bash
# Request - Non-admin trying to get all users
GET /api/users
Authorization: Bearer dentist_token
# User has 'dentist' role, not 'admin'

# Response (403 Forbidden)
{
  "statusCode": 403,
  "message": "Forbidden",
  "timestamp": "2024-01-15T10:55:00Z"
}
```

---

## Frontend Integration Example (TypeScript)

```typescript
// api.client.ts
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.loadTokens();
  }

  private loadTokens() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  private saveTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  }

  async signUp(email: string, fullName: string, password: string) {
    const response = await axios.post(`${API_BASE}/auth/sign-up`, {
      email,
      fullName,
      password
    });
    const { authToken } = response.data;
    this.saveTokens(authToken.accessToken, authToken.refreshToken);
    return response.data;
  }

  async signIn(email: string, password: string) {
    const response = await axios.post(`${API_BASE}/auth/sign-in`, {
      email,
      password
    });
    const { authToken } = response.data;
    this.saveTokens(authToken.accessToken, authToken.refreshToken);
    return response.data;
  }

  async getCurrentUser() {
    const response = await axios.get(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    return response.data;
  }

  async createDentistProfile(profileData: any) {
    const response = await axios.post(
      `${API_BASE}/dentist-profile`,
      profileData,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    return response.data;
  }

  async searchClinicsByCity(city: string, page = 1) {
    const response = await axios.get(
      `${API_BASE}/dentist-profile/search/by-city?city=${city}&page=${page}`
    );
    return response.data;
  }

  async findNearby(lat: number, lng: number, radius = 5) {
    const response = await axios.get(
      `${API_BASE}/dentist-profile/search/nearby?latitude=${lat}&longitude=${lng}&radiusKm=${radius}`
    );
    return response.data;
  }
}

export const apiClient = new ApiClient();
```

---

## React Hook Example

```typescript
// useAuth.ts
import { useEffect, useState } from 'react';
import { apiClient } from './api.client';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, apiClient };
}

// Usage in component
function DashboardPage() {
  const { user, loading, apiClient } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  return (
    <div>
      <h1>Welcome, {user.fullName}</h1>
      {/* ... rest of dashboard */}
    </div>
  );
}
```

---

## Testing with Postman

1. Create collection "Oralign API"
2. Create environment with variables:
   - `baseUrl`: http://localhost:3000/api
   - `accessToken`: (set after sign-in)
   - `refreshToken`: (set after sign-in)

3. Create requests:

```
POST {{baseUrl}}/auth/sign-up
POST {{baseUrl}}/auth/sign-in
GET {{baseUrl}}/users/me
  Header: Authorization: Bearer {{accessToken}}
GET {{baseUrl}}/dentist-profile
POST {{baseUrl}}/dentist-profile
  Header: Authorization: Bearer {{accessToken}}
```

---

## Performance Optimization Tips

1. **Pagination**: Always use pagination for lists
   ```
   GET /api/dentist-profile?page=1&limit=50
   ```

2. **Caching**: Cache clinic data with reasonable TTL
   ```typescript
   const cache = new Map();
   if (cache.has(clinicId)) {
     return cache.get(clinicId);
   }
   ```

3. **Request Batching**: Group multiple requests
   ```typescript
   const [clinics, hours] = await Promise.all([
     apiClient.getAllClinics(),
     apiClient.getWorkingHours(clinicId)
   ]);
   ```

4. **Debouncing**: Debounce search requests
   ```typescript
   const debouncedSearch = debounce((city) => {
     searchClinicsByCity(city);
   }, 300);
   ```

---

Refer to `API_DOCUMENTATION.md` for complete endpoint reference and schema details.
