# 🐳 Oralign - Complete Docker Setup

> **Professional Docker configuration for full-stack application with NestJS, Next.js, PostgreSQL, and Redis**

## ⚡ Quick Links

| Document | Purpose |
|----------|---------|
| **[QUICK_DOCKER_GUIDE.md](QUICK_DOCKER_GUIDE.md)** | 👈 **START HERE** - Quick reference with 3-step setup |
| **[README_DOCKER.md](README_DOCKER.md)** | Common commands and quick troubleshooting |
| **[DOCKER_SETUP.md](DOCKER_SETUP.md)** | Comprehensive guide with best practices |
| **[DOCKER_CHECKLIST.md](DOCKER_CHECKLIST.md)** | Verification checklist and features |

## 🚀 30-Second Setup

```powershell
# Windows (PowerShell)
cd C:\Users\saker\Desktop\oraling
cp .env.docker .env
.\docker.ps1 build
.\docker.ps1 up
```

```bash
# macOS/Linux (Bash)
cd ~/Desktop/oraling
cp .env.docker .env
./docker.sh build
./docker.sh up
```

Then open **http://localhost:3001** in your browser.

## 📦 What's Included

### Services
- ✅ **PostgreSQL 17** - Database with persistent storage
- ✅ **Redis 7** - Cache with data persistence
- ✅ **NestJS Backend** - TypeScript REST API on port 3000
- ✅ **Next.js Frontend** - React UI on port 3001

### Features
- ✅ Multi-stage Docker builds (production optimized)
- ✅ Health checks on all services
- ✅ Hot reload for development
- ✅ Non-root users (security)
- ✅ Docker bridge network
- ✅ Environment-based configuration
- ✅ Helper scripts (PowerShell & Bash)

## 🌐 Service URLs

```
Frontend ........ http://localhost:3001
Backend ........ http://localhost:3000
API Docs ....... http://localhost:3000/api/docs
PostgreSQL ..... localhost:5432 (user: oralign)
Redis .......... localhost:6379
```

## 📁 Project Structure

```
oralign/
├── 📄 docker-compose.yml           Main service orchestration
├── 📄 docker-compose.dev.yml       Development overrides
├── 📄 .env.docker                  Environment template
├── 🐚 docker.ps1                   PowerShell helper
├── 🐚 docker.sh                    Bash helper
│
├── 📖 QUICK_DOCKER_GUIDE.md        Quick reference (start here!)
├── 📖 README_DOCKER.md             Common commands
├── 📖 DOCKER_SETUP.md              Comprehensive guide
├── 📖 DOCKER_CHECKLIST.md          Features & checklist
│
├── scripts/
│   └── init.sql                    Database initialization
│
├── oralign-backend/
│   ├── Dockerfile                  NestJS multi-stage build
│   ├── .dockerignore
│   ├── src/
│   ├── prisma/
│   └── package.json
│
└── oralign-frontend/
    ├── Dockerfile                  Next.js multi-stage build
    ├── .dockerignore
    ├── src/
    └── package.json
```

## 💻 Helper Commands

### PowerShell (Windows)
```powershell
.\docker.ps1 build      # Build images
.\docker.ps1 up         # Start services
.\docker.ps1 down       # Stop services
.\docker.ps1 status     # Check health
.\docker.ps1 logs       # View logs
.\docker.ps1 shell      # Access container
.\docker.ps1 migrate    # Run migrations
.\docker.ps1 reset      # Delete all data
.\docker.ps1 help       # Show all commands
```

### Bash (macOS/Linux)
```bash
./docker.sh build       # Build images
./docker.sh up          # Start services
./docker.sh down        # Stop services
./docker.sh status      # Check health
./docker.sh logs        # View logs
./docker.sh shell       # Access container
./docker.sh migrate     # Run migrations
./docker.sh reset       # Delete all data
./docker.sh help        # Show all commands
```

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│    Docker Bridge Network            │
│  (oralign_oralign-network)          │
├─────────────────────────────────────┤
│                                     │
│  ┌────────┐  ┌──────────┐          │
│  │ Next.js│  │ NestJS   │          │
│  │ :3001  │  │ :3000    │          │
│  └────────┘  └──────────┘          │
│       │           │                 │
│       └─────┬─────┘                 │
│             │                       │
│       ┌─────▼──────────┐            │
│       │  PostgreSQL    │            │
│       │  Redis         │            │
│       │  Network DNS   │            │
│       └────────────────┘            │
└─────────────────────────────────────┘
         ↑ Exposed to localhost
```

## 🔧 Configuration

### Environment File (.env)

```env
# Database
DB_USER=oralign
DB_PASSWORD=oralign_secure_password
DB_NAME=oralign_db

# Redis
REDIS_PASSWORD=redis_secure_password

# Backend
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-key
JWT_RESET_SECRET=your-reset-key
NODE_ENV=production

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

**⚠️ IMPORTANT**: Change all secrets in production!

## 🎯 Common Workflows

### Development
```powershell
# Start in development mode with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# View logs
.\docker.ps1 logs backend

# Make code changes - they auto-reload!
# Edit src/main.ts and see changes instantly
```

### Database Management
```powershell
# Open Prisma Studio (visual DB)
docker-compose exec backend npx prisma studio

# Access database directly
docker-compose exec postgres psql -U oralign -d oralign_db

# Run migrations
.\docker.ps1 migrate

# Seed database
.\docker.ps1 seed
```

### Debugging
```powershell
# View service status
.\docker.ps1 status

# Check service logs
.\docker.ps1 logs

# Open container shell
.\docker.ps1 shell backend

# Monitor resource usage
docker stats
```

## 🚢 Production Deployment

### Pre-deployment Checklist
- [ ] Update all secrets in .env
- [ ] Set NODE_ENV=production
- [ ] Remove volume mounts (immutable images)
- [ ] Configure external PostgreSQL database
- [ ] Configure external Redis cache
- [ ] Setup SSL/TLS with reverse proxy
- [ ] Enable logging to external service
- [ ] Configure resource limits
- [ ] Test with docker-compose prod override

See [DOCKER_SETUP.md](DOCKER_SETUP.md#production-best-practices) for detailed production guide.

## 🐛 Troubleshooting

### Services Won't Start
```powershell
# Check logs
.\docker.ps1 logs

# Rebuild from scratch
docker-compose down -v
.\docker.ps1 build --no-cache
.\docker.ps1 up
```

### Port Already in Use
```powershell
# Find and kill process
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Database Connection Error
```powershell
# Test PostgreSQL
docker-compose exec postgres psql -U oralign -d oralign_db -c "SELECT 1"

# Check logs
.\docker.ps1 logs postgres
```

See [README_DOCKER.md](README_DOCKER.md#troubleshooting) for more troubleshooting tips.

## 📊 What's Running

### Container Images
- `postgres:17-alpine` - Lightweight PostgreSQL database
- `redis:7-alpine` - Lightweight Redis cache
- `node:22-alpine` - Custom NestJS backend image
- `node:22-alpine` - Custom Next.js frontend image

### Volumes
- `postgres_data` - PostgreSQL data persistence
- `redis_data` - Redis data persistence
- Source code mounts (development only)

### Network
- `oralign-network` - Bridge network for inter-service communication

## ✨ Best Practices Implemented

✅ **Security**
- Non-root users in containers
- Environment-based secrets
- Network isolation

✅ **Performance**
- Multi-stage builds
- Alpine base images
- Layer caching optimization

✅ **Reliability**
- Health checks on all services
- Container restart policies
- Persistent data volumes

✅ **Developer Experience**
- Hot reload for development
- Helper scripts with color output
- Easy database access
- Comprehensive documentation

✅ **Production Ready**
- Immutable images
- Proper signal handling
- Resource limit support
- Logging infrastructure ready

## 📚 Documentation

### Quick Start
- **[QUICK_DOCKER_GUIDE.md](QUICK_DOCKER_GUIDE.md)** - 30-second setup and quick reference

### Common Tasks
- **[README_DOCKER.md](README_DOCKER.md)** - Common commands and troubleshooting

### Deep Dive
- **[DOCKER_SETUP.md](DOCKER_SETUP.md)** - Complete guide with production tips

### Verification
- **[DOCKER_CHECKLIST.md](DOCKER_CHECKLIST.md)** - Features and verification checklist

## 🎓 Learning Path

1. Read **[QUICK_DOCKER_GUIDE.md](QUICK_DOCKER_GUIDE.md)** (5 min)
2. Run `.\docker.ps1 build && .\docker.ps1 up` (5 min)
3. Test services in browser (2 min)
4. Read **[README_DOCKER.md](README_DOCKER.md)** for commands (5 min)
5. Explore **[DOCKER_SETUP.md](DOCKER_SETUP.md)** for details (20 min)

## 🤝 Getting Help

1. Check logs: `.\docker.ps1 logs`
2. Verify services: `docker-compose ps`
3. Check docs: See section above
4. Test individually: `docker-compose exec service_name sh`

## 🎊 Ready to Go!

Everything is set up and ready to use. Follow the Quick Links above to get started.

**Next step**: Read [QUICK_DOCKER_GUIDE.md](QUICK_DOCKER_GUIDE.md)

---

**Pro Tip**: Bookmark [README_DOCKER.md](README_DOCKER.md) for quick command reference during development.
