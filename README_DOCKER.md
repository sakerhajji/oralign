# Oralign Project - Docker Setup

## 🐳 Complete Docker Solution

## One-command startup

Run this from the project root (`C:\Users\saker\Desktop\oraling`) to build and
start PostgreSQL, Redis, the NestJS API, and the Next.js frontend together:

### Windows PowerShell

```powershell
.\docker.ps1
```

### macOS / Linux

```bash
bash docker.sh
```

The launcher creates `.env` from the Docker template when needed, waits for
all services to become healthy, and prints the local URLs.

This project includes a production-ready Docker setup with all services containerized:

- **Frontend**: Next.js (React)
- **Backend**: NestJS (Node.js)
- **Database**: PostgreSQL 17
- **Cache**: Redis 7
- **Network**: Docker bridge network for inter-service communication
- **Volumes**: Persistent data storage for DB and cache

## 🚀 Quick Start (Windows)

```powershell
# Navigate to project root
cd ~/Desktop/oraling

# Build, start, and health-check every service
.\docker.ps1
```

On the first run, the launcher creates `.env` from
`.env.docker.example`. Existing `.env` files are never overwritten.

## 🚀 Quick Start (macOS/Linux)

```bash
# Navigate to project root
cd ~/Desktop/oraling

# Build, start, and health-check every service
bash docker.sh
```

## 📋 Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend** | http://localhost:3001 | React/Next.js UI |
| **Backend API** | http://localhost:3000 | REST API |
| **API Docs** | http://localhost:3000/docs | Swagger Documentation |
| **Database** | localhost:5432 | PostgreSQL |
| **Cache** | internal `redis:6379` | Redis (not exposed on the host) |

## 🔧 Common Commands

### Using PowerShell (Windows)
```powershell
.\docker.ps1 up          # Start services
.\docker.ps1 down        # Stop services
.\docker.ps1 logs backend      # View backend logs
.\docker.ps1 shell backend     # Access backend container
.\docker.ps1 status      # Check all services
.\docker.ps1 migrate     # Run migrations
.\docker.ps1 reset       # Delete all data
```

### Using Bash (macOS/Linux)
```bash
bash docker.sh up          # Start services
bash docker.sh down        # Stop services
bash docker.sh logs backend      # View backend logs
bash docker.sh shell backend     # Access backend container
bash docker.sh status      # Check all services
bash docker.sh migrate     # Run migrations
bash docker.sh reset       # Delete all data
```

### Direct Docker Commands
```bash
# View all running containers
docker compose ps

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Execute command in container
docker compose exec backend npx prisma studio
docker compose exec postgres psql -U oralign -d oralign_db

# Stop all services
docker compose down

# Stop and remove all data
docker compose down -v
```

## 🗄️ Database Setup

### Run Migrations
```bash
# PowerShell
.\docker.ps1 migrate

# Bash
bash docker.sh migrate
```

### Database Shell
```bash
docker compose exec postgres psql -U oralign -d oralign_db
```

### Prisma Studio (Visual DB)
```bash
docker compose exec backend npx prisma studio
```

## 💾 Environment Configuration

Edit `.env` file to configure:

```env
# Database
DB_USER=oralign
DB_PASSWORD=oralign_secure_password
DB_NAME=oralign_db

# Redis
REDIS_PASSWORD=redis_secure_password

# JWT (Change these in production!)
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-key
JWT_RESET_SECRET=your-reset-key

# URLs
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_APP_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3001
```

⚠️ **IMPORTANT**: In production, change all secrets to strong random values!

## 🔍 Troubleshooting

### Services Won't Start
```bash
# Check logs
docker compose logs

# Rebuild everything
docker compose down -v
docker compose build --no-cache
docker compose up
```

### Port Already in Use
```bash
# Windows: Find and kill process
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux: Find and kill process
lsof -i :3000
kill -9 <PID>
```

### Database Connection Error
```bash
# Verify PostgreSQL is running
docker compose exec postgres psql -U oralign -d oralign_db -c "SELECT 1"

# View PostgreSQL logs
docker compose logs postgres
```

### Redis Connection Error
```bash
# Test Redis
docker compose exec redis redis-cli -a redis_secure_password ping

# View Redis logs
docker compose logs redis
```

### Clear Everything and Start Fresh
```bash
docker compose down -v
docker system prune -f
docker compose build --no-cache
docker compose up -d
```

## 📁 File Structure

```
oralign/
├── docker-compose.yml          # Service orchestration
├── .env.docker                 # Environment template
├── .env                        # Local config (git ignored)
├── docker.sh                   # Bash helper script
├── docker.ps1                  # PowerShell helper script
├── DOCKER_SETUP.md             # Detailed Docker guide
├── scripts/
│   └── init.sql                # Database initialization
├── oralign-backend/
│   ├── Dockerfile              # NestJS image
│   ├── .dockerignore
│   ├── src/
│   ├── prisma/
│   └── package.json
└── oralign-frontend/
    ├── Dockerfile              # Next.js image
    ├── .dockerignore
    ├── src/
    └── package.json
```

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│     Docker Bridge Network           │
│  (oralign_oralign-network)          │
├─────────────────────────────────────┤
│                                     │
│  ┌──────┐  ┌───────┐  ┌─────────┐  │
│  │ Next │  │NestJS │  │Postgres │  │
│  │  JS  │  │ Back  │  │  DB     │  │
│  │3001  │  │ 3000  │  │ 5432    │  │
│  └──────┘  └───────┘  └─────────┘  │
│      │          │          ▲        │
│      └──────────┤          │        │
│                 │     ┌────┴─────┐  │
│                 │     │  Redis   │  │
│                 │     │ Cache    │  │
│                 │     │ 6379     │  │
│                 └──────────────────┘  │
│                                     │
└─────────────────────────────────────┘
        ▲                   ▲
        └─────────┬─────────┘
            ┌─────┴─────┐
            │   Host    │
            │ Localhost │
            └───────────┘
```

## 🔐 Security Notes

### Development vs Production

**Development** (default):
- Uses simple passwords and secrets
- Health checks with generous timeouts
- Volume mounts for live code reload
- Debug logging enabled

**Production**:
- All passwords must be changed in `.env`
- Use environment-specific configs
- No volume mounts (immutable images)
- Minimal logging

### Recommended Production Steps

1. Use `.env` with strong secrets
2. Disable volume mounts in docker-compose.yml
3. Use managed database (AWS RDS, Azure Database)
4. Use managed Redis (AWS ElastiCache, Redis Cloud)
5. Add SSL/TLS with reverse proxy (Nginx, Traefik)
6. Enable resource limits
7. Use image registries for versioning

## 📚 Additional Resources

- [Docker Docs](https://docs.docker.com)
- [Docker Compose Docs](https://docs.docker.com/compose)
- [NestJS Docker](https://docs.nestjs.com/deployment/docker)
- [Next.js Docker](https://nextjs.org/docs/deployment/docker)
- [PostgreSQL](https://www.postgresql.org/docs)
- [Redis](https://redis.io/docs)

## 📖 Detailed Guide

See [DOCKER_SETUP.md](./DOCKER_SETUP.md) for comprehensive documentation including:
- Architecture overview
- Production best practices
- CI/CD integration
- Performance optimization
- Debugging tips

## 💡 Tips

### Development Workflow
1. Edit code locally
2. Changes hot-reload in containers
3. View logs with `docker compose logs -f`
4. Restart service if needed

### Quick Database Access
```bash
# Open database UI
docker compose exec backend npx prisma studio

# Access database directly
docker compose exec postgres psql -U oralign -d oralign_db
```

### Check Service Health
```bash
docker compose ps          # Container status
.\docker.ps1 status        # Detailed health check
docker stats               # Resource usage
```

## 🤝 Contributing

When making changes:
1. Update both Dockerfiles if needed
2. Test locally with Docker
3. Update environment variables if adding new services
4. Document changes in DOCKER_SETUP.md

## ⚡ Performance

- **Multi-stage builds** minimize image size
- **Health checks** ensure service reliability
- **Volume caching** speeds up rebuilds
- **Network bridge** optimizes inter-service communication
- **Non-root users** improve security

## 📞 Support

For issues:
1. Check logs: `docker compose logs`
2. Verify services: `docker compose ps`
3. Restart: `docker compose restart`
4. Reset: `docker compose down -v && docker compose up -d`
5. Check DOCKER_SETUP.md troubleshooting section
