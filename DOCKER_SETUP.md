# Docker Setup Guide - Oralign Project

## Overview
This project is fully containerized with Docker Compose, including:
- **PostgreSQL 17** - Database
- **Redis 7** - Cache layer
- **NestJS** - Backend API (port 3000)
- **Next.js** - Frontend (port 3001)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Docker Network (bridge)                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │              │  │              │  │              │  │
│  │  PostgreSQL  │  │    Redis     │  │   NestJS     │  │
│  │     :5432    │  │   :6379      │  │   :3000      │  │
│  │              │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         ▲               ▲                    ▲           │
│         └───────────────┼────────────────────┘           │
│                         │                               │
│                  ┌──────────────┐                        │
│                  │   Next.js    │                        │
│                  │   :3001      │                        │
│                  └──────────────┘                        │
│                         ▲                               │
└─────────────────────────┼───────────────────────────────┘
                          │
                    ┌─────┴─────┐
                    │ Host :3001 │
                    └────────────┘
```

## Prerequisites

- Docker 24.0+
- Docker Compose 2.20+
- 4GB RAM minimum
- 5GB disk space

## Quick Start

### 1. Clone and Navigate
```bash
cd ~/Desktop/oraling
```

### 2. Configure Environment
```bash
# Copy the environment template
cp .env.docker .env

# Edit .env with your values (especially JWT secrets and passwords)
# For development, defaults are fine. For production, CHANGE ALL SECRETS!
```

### 3. Build Images
```bash
# Build fresh images for backend and frontend
docker-compose build

# Or rebuild without cache
docker-compose build --no-cache
```

### 4. Start Services
```bash
# Start all services (daemonized)
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### 5. Initialize Database
```bash
# Run Prisma migrations
docker-compose exec backend npx prisma migrate deploy

# Seed database (if seed script exists)
docker-compose exec backend npx prisma db seed
```

### 6. Access Services

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3001 | Web UI |
| Backend API | http://localhost:3000 | REST API |
| Backend Swagger | http://localhost:3000/api/docs | API Documentation |
| PostgreSQL | localhost:5432 | Database (direct access) |
| Redis | localhost:6379 | Cache (direct access) |

## Common Commands

### View Running Containers
```bash
docker-compose ps
```

### Stop All Services
```bash
docker-compose down
```

### Stop and Remove Volumes (Clean Wipe)
```bash
docker-compose down -v
```

### Rebuild Specific Service
```bash
docker-compose build backend
docker-compose up -d backend
```

### Execute Commands in Container
```bash
# Backend
docker-compose exec backend npm run build
docker-compose exec backend npx prisma studio

# Frontend
docker-compose exec frontend npm run build

# Database
docker-compose exec postgres psql -U oralign -d oralign_db
```

### View Logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend

# Follow logs in real-time
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend
```

## Development Workflow

### Hot Reload Enabled
Both backend and frontend volumes are mounted for hot reload:
- Backend: `./oralign-backend/src` → `/app/src`
- Frontend: `./oralign-frontend/src` → `/app/src`

### Code Changes
Simply edit files locally; changes will be reflected instantly in containers.

### Database Changes
```bash
# Create migration
docker-compose exec backend npx prisma migrate dev --name migration_name

# Apply migrations
docker-compose exec backend npx prisma migrate deploy
```

## Production Best Practices

### Before Deploying

1. **Update .env File**
   - Change all JWT secrets to strong random values
   - Change database password to a strong password
   - Change Redis password
   - Set NODE_ENV=production
   - Update FRONTEND_URL and API URLs to production domains

2. **Build for Production**
   ```bash
   docker-compose build
   ```

3. **Use External Database** (Recommended)
   - Configure DATABASE_URL to use managed PostgreSQL service
   - Remove postgres service from docker-compose.yml or create production override

4. **Use External Redis** (Recommended)
   - Configure Redis connection to managed service
   - Remove redis service or use production override

5. **SSL/TLS**
   - Use reverse proxy (Nginx, Traefik) for SSL termination
   - Create docker-compose.prod.yml with Nginx service

### Example Production Override

```bash
# docker-compose.prod.yml
version: '3.9'
services:
  backend:
    image: your-registry/oralign-backend:latest
    restart: always
    # Use external DB and Redis...
  frontend:
    image: your-registry/oralign-frontend:latest
    restart: always
```

Deploy with:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs backend

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### Database Connection Error
```bash
# Check if postgres is healthy
docker-compose ps postgres

# Check postgres logs
docker-compose logs postgres

# Manually test connection
docker-compose exec postgres psql -U oralign -d oralign_db -c "SELECT 1"
```

### Port Already in Use
```bash
# Check what's using the port
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # macOS/Linux

# Or change ports in docker-compose.yml
# ports:
#   - "3000:3000" -> "8000:3000"
```

### Redis Connection Failed
```bash
# Check Redis logs
docker-compose logs redis

# Test Redis connection
docker-compose exec redis redis-cli -a redis_secure_password ping
```

### Clear All Data
```bash
# Stop and remove everything
docker-compose down -v

# Restart fresh
docker-compose up -d
```

## Performance Optimization

### Multi-stage Builds
Both Dockerfiles use multi-stage builds to minimize image size:
- Stage 1: Dependencies
- Stage 2: Build application
- Stage 3: Runtime-only image

### Health Checks
All services include health checks with appropriate timeouts and retry policies.

### Resource Limits (Optional)
Add to docker-compose.yml services:
```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '1'
        memory: 1G
```

## Debugging

### Interactive Shell
```bash
# Backend
docker-compose exec backend sh

# Frontend
docker-compose exec frontend sh

# Database
docker-compose exec postgres bash
```

### View Container Stats
```bash
docker stats
```

### Inspect Network
```bash
# List networks
docker network ls

# Inspect oralign-network
docker network inspect oralign_oralign-network
```

## CI/CD Integration

### GitHub Actions Example
```yaml
services:
  docker:
    image: docker/docker-compose:latest
    
jobs:
  test:
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_PASSWORD: postgres
      redis:
        image: redis:7-alpine
    
    steps:
      - uses: actions/checkout@v3
      - name: Build images
        run: docker-compose build
      - name: Run tests
        run: docker-compose exec backend npm run test:e2e
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com)
- [Docker Compose Documentation](https://docs.docker.com/compose)
- [NestJS Docker Guide](https://docs.nestjs.com/deployment/docker)
- [Next.js Docker Guide](https://nextjs.org/docs/deployment/docker)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)
- [Redis Documentation](https://redis.io/docs)

## Support

For issues or questions:
1. Check logs: `docker-compose logs`
2. Verify services: `docker-compose ps`
3. Restart services: `docker-compose restart`
4. Full reset: `docker-compose down -v && docker-compose up -d`
