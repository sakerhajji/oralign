# Clean Architecture & Design Patterns

## Overview

This project follows **Clean Architecture** principles, separating concerns into distinct layers. Each module is self-contained and can be tested, modified, or replaced independently.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│                   (Controllers + DTOs)                       │
│  Handles HTTP requests/responses, validation, routing        │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   BUSINESS LOGIC LAYER                       │
│                  (Services/Use Cases)                        │
│  Contains core business rules, no database/HTTP knowledge    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  DATA ACCESS LAYER                           │
│                    (Repositories)                            │
│  Database queries abstraction, no business logic             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                 FRAMEWORK & DATABASE                         │
│              (Prisma ORM + PostgreSQL)                       │
│  Low-level database operations handled by ORM               │
└─────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### 1. Presentation Layer (Controllers)

**Location**: `src/*/controllers/`

**Responsibilities**:
- HTTP request handling
- Input validation via DTOs
- HTTP status codes
- API documentation with Swagger

**Rules**:
- ❌ No business logic
- ❌ No database queries
- ✅ Delegate to Service Layer
- ✅ Return response DTOs
- ✅ Handle exceptions thrown by services

**Example**:
```typescript
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    // Call service - no direct database access
    return this.userService.createUser(createUserDto);
  }
}
```

### 2. Business Logic Layer (Services)

**Location**: `src/*/services/`

**Responsibilities**:
- Implement use cases (business rules)
- Service orchestration
- Validation logic
- Error handling

**Rules**:
- ✅ Pure business logic
- ❌ No HTTP knowledge
- ❌ No directory knowledge
- ✅ Use Repository for data access
- ✅ Throw custom exceptions

**Example**:
```typescript
@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}

  async createUser(createUserDto: CreateUserDto) {
    // Check business rule: email must be unique
    const existingUser = await this.userRepository.findByEmail(
      createUserDto.email
    );
    
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password (business logic)
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Persist data via repository
    return this.userRepository.create({
      ...createUserDto,
      passwordHash: hashedPassword
    });
  }
}
```

### 3. Data Access Layer (Repositories)

**Location**: `src/*/repositories/`

**Responsibilities**:
- Database query abstraction
- Query optimization
- Data transformation
- Connection handling

**Rules**:
- ✅ Only database operations
- ✅ No business logic enforcement
- ❌ No HTTP knowledge
- ✅ Use Prisma ORM
- ✅ Return domain objects

**Example**:
```typescript
@Injectable()
export class UserRepository {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    // Pure data access - no business logic
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: UserCreateData): Promise<User> {
    // Just delegate to Prisma
    return this.prisma.user.create({ data });
  }
}
```

## Dependency Injection

All dependencies are injected via constructor. This enables:
- Easy testing with mocks
- Loose coupling
- Easy to replace implementations

```typescript
// Service depends on Repository
export class UserService {
  constructor(
    private userRepository: UserRepository // ← Injected
  ) {}
}

// Controller depends on Service
export class UserController {
  constructor(
    private userService: UserService // ← Injected
  ) {}
}
```

## Design Patterns Used

### 1. Repository Pattern

**Problem**: Decouple business logic from data access

**Solution**: Create repository interface abstracting database operations

```typescript
// abstraction
interface IUserRepository {
  create(data: CreateUserData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

// implementation
@Injectable()
export class UserRepository implements IUserRepository {
  constructor(private prisma: PrismaService) {}
  
  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({ data });
  }
}
```

**Benefits**:
- Services don't know about Prisma
- Easy to swap database (SQL → MongoDB)
- Easy to test (mock repository)

### 2. Service Pattern (Business Logic)

**Problem**: Controllers shouldn't contain business logic

**Solution**: Create services to encapsulate use cases

```typescript
@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}

  async createUser(dto: CreateUserDto) {
    // Validate business rules
    if (await this.userRepository.findByEmail(dto.email)) {
      throw new ConflictException('Email already exists');
    }

    // Execute use case
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.userRepository.create({
      ...dto,
      passwordHash: hashedPassword
    });
  }
}
```

### 3. Data Transfer Object (DTO) Pattern

**Purpose**: Validate and transform input/output

```typescript
// Input DTO - validates from request
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// Output DTO - shapes response
export class UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  role: string;
  // Note: passwordHash is NOT included
}
```

### 4. Exception Handling Pattern

**Custom Exceptions**:
```typescript
// Specific, hierarchical exceptions
export class ConflictException extends AppException {
  constructor(message: string) {
    super(409, message);
  }
}

export class NotFoundException extends AppException {
  constructor(message: string) {
    super(404, message);
  }
}
```

**Error Filter**:
```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Catches ALL exceptions, returns consistent response
    // Logs for monitoring
    // Returns standardized format
  }
}
```

### 5. Guard Pattern (Security)

**Route Protection**:
```typescript
// JWT Guard - validates token
@UseGuards(JwtAuthGuard)
getProfile() { ... }

// Roles Guard - checks authorization
@UseGuards(RolesGuard)
@Roles(UserRole.admin)
getAllUsers() { ... }
```

### 6. Decorator Pattern (Metadata)

**Custom Decorators**:
```typescript
// Extract authenticated user
@CurrentUser() user: JwtPayload

// Mark route as public
@Public()
signUp() { ... }

// Specify required roles
@Roles(UserRole.admin)
adminOnly() { ... }
```

## Module Organization

Each module is self-contained:

```
users/
├── controllers/          # HTTP handlers
├── services/             # Business logic
├── repositories/         # Data access
├── dto/                  # Validation schemas
├── users.module.ts       # Module definition
└── index.ts              # Exports
```

**Benefits**:
- Clear separation of concerns
- Easy to locate code
- Easy to test/modify
- Reusable modules

## Testing Strategy

### Unit Testing Services

```typescript
describe('UserService', () => {
  let service: UserService;
  let repository: MockRepository;

  beforeEach(() => {
    repository = new MockRepository();
    service = new UserService(repository);
  });

  it('should create user with hashed password', async () => {
    const user = await service.createUser({
      email: 'test@example.com',
      password: 'password123',
      fullName: 'Test User'
    });

    expect(user.id).toBeDefined();
    expect(repository.create).toHaveBeenCalled();
  });
});
```

### Integration Testing

```typescript
describe('UserController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [UsersModule]
    }).compile();

    app = module.createNestApplication();
  });

  it('POST /users should create new user', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send(createUserDto)
      .expect(201);
  });
});
```

## Best Practices Applied

### 1. Input Validation
```typescript
// Automatic validation via DTOs + ValidationPipe
@Post()
async create(@Body() createDto: CreateUserDto) {
  // createDto is guaranteed to be valid
  return this.service.create(createDto);
}
```

### 2. Error Handling
```typescript
// Service throws specific exceptions
if (exists) throw new ConflictException('Email exists');

// Global filter catches and formats
// { statusCode: 409, message: 'Email exists' }
```

### 3. Pagination
```typescript
// Consistent pagination response
const result = await service.getAllUsers(page, limit);
// { data: [...], total: 50, page: 1, limit: 10, totalPages: 5 }
```

### 4. Type Safety
```typescript
// Full TypeScript strict mode
// No `any` type allowed
// All types explicitly defined
// Compile-time error checking
```

### 5. Immutability
```typescript
// DTOs are readonly where appropriate
export class ReadOnlyDto {
  readonly id: string;
  readonly email: string;
}
```

## Data Flow Example

**Creating a User** - Request to Response

```
1. POST /api/users
   ↓
2. UserController.createUser(@Body() dto)
   - Validates DTO (class-validator)
   ↓
3. UserService.createUser(dto)
   - Check business rules (email unique)
   - Hash password (security)
   - Transform data
   ↓
4. UserRepository.create(data)
   - Execute SQL via Prisma
   - Return User entity
   ↓
5. UserService returns UserResponseDto
   - Map User → UserResponseDto (exclude passwordHash)
   ↓
6. UserController returns mapped DTO
   ↓
7. NestJS sends 201 response with JSON
```

## Configuring Application

### ConfigModule Integration
```typescript
// In app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    })
  ]
})
export class AppModule {}

// In any service
constructor(
  private config: ConfigService
) {}

async authenticate() {
  const secret = this.config.get('JWT_SECRET');
}
```

## Conclusion

This architecture ensures:
- ✅ **Maintainability**: Clear structure, easy to modify
- ✅ **Testability**: Each layer testable independently  
- ✅ **Scalability**: Add features without refactoring
- ✅ **Readability**: Code is self-documenting
- ✅ **Flexibility**: Easy to swap implementations
- ✅ **Robustness**: Proper error handling throughout

**The codebase is production-ready and follows industry best practices.**
