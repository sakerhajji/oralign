#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Functions
print_header() {
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

ensure_local_environment() {
    if [ -f ".env" ]; then
        return
    fi

    if [ -f ".env.docker" ]; then
        cp ".env.docker" ".env"
        print_info "Created .env from the existing .env.docker file."
        return
    fi

    if [ ! -f ".env.docker.example" ]; then
        print_error "Missing .env.docker.example; cannot create local Docker settings."
        exit 1
    fi

    cp ".env.docker.example" ".env"
    print_info "Created .env with local Docker defaults."
}

# Commands
cmd_build() {
    ensure_local_environment
    print_header "Building Docker Images"
    docker compose build
    print_success "Images built successfully"
}

cmd_start() {
    ensure_local_environment
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running."
        exit 1
    fi

    print_header "Starting Oralign"
    print_info "Building changed images and starting PostgreSQL, Redis, backend, and frontend..."
    docker compose up --build --detach --remove-orphans --wait --wait-timeout 240
    docker compose ps
    print_success "All Oralign services are healthy."
    echo ""
    echo -e "Frontend:  ${GREEN}http://localhost:3001${NC}"
    echo -e "Backend:   ${GREEN}http://localhost:3000/api${NC}"
    echo -e "Health:    ${GREEN}http://localhost:3000/api/health${NC}"
    echo -e "API Docs:  ${GREEN}http://localhost:3000/docs${NC}"
}

cmd_up() {
    cmd_start
}

cmd_down() {
    print_header "Stopping Services"
    docker compose down
    print_success "Services stopped"
}

cmd_logs() {
    local service=$1
    if [ -z "$service" ]; then
        docker compose logs -f
    else
        docker compose logs -f "$service"
    fi
}

cmd_shell() {
    local service=$1
    if [ -z "$service" ]; then
        print_error "Please specify a service: backend, frontend, or postgres"
        return 1
    fi
    docker compose exec "$service" sh
}

cmd_status() {
    print_header "Service Status"
    docker compose ps
    
    print_header "Service Health"
    echo ""
    print_info "Checking service health..."
    echo ""
    
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        print_success "Backend is healthy"
    else
        print_error "Backend is not responding"
    fi
    
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        print_success "Frontend is healthy"
    else
        print_error "Frontend is not responding"
    fi
    
    if docker compose exec postgres psql -U oralign -d oralign_db -c "SELECT 1" > /dev/null 2>&1; then
        print_success "PostgreSQL is healthy"
    else
        print_error "PostgreSQL is not responding"
    fi
    
    if docker compose exec redis redis-cli -a redis_secure_password ping > /dev/null 2>&1; then
        print_success "Redis is healthy"
    else
        print_error "Redis is not responding"
    fi
}

cmd_migrate() {
    print_header "Running Migrations"
    docker compose exec backend npx prisma migrate deploy
    print_success "Migrations completed"
}

cmd_seed() {
    print_header "Seeding Database"
    docker compose exec backend npx prisma db seed
    print_success "Database seeded"
}

cmd_reset() {
    print_header "Resetting Everything"
    print_warning "This will DELETE all data!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Reset cancelled"
        return 0
    fi
    
    docker compose down -v
    print_success "All data removed"
    print_info "Run 'bash docker.sh up' to start fresh"
}

cmd_clean() {
    print_header "Cleaning Up"
    docker system prune -f
    print_success "Cleanup completed"
}

cmd_ps() {
    docker compose ps
}

cmd_stats() {
    docker stats
}

cmd_help() {
    cat << EOF
${BLUE}Oralign Docker CLI${NC}

Usage: ${YELLOW}bash docker.sh [command] [options]${NC}

${YELLOW}Commands:${NC}
  ${GREEN}start${NC}              Build and start all services, then wait for health
  ${GREEN}build${NC}              Build Docker images
  ${GREEN}up${NC}                 Start all services
  ${GREEN}down${NC}               Stop all services
  ${GREEN}ps${NC}                 Show container status
  ${GREEN}logs [service]${NC}     View logs (backend, frontend, postgres, redis)
  ${GREEN}shell <service>${NC}    Open shell in service
  ${GREEN}status${NC}             Check health of all services
  ${GREEN}stats${NC}              Show resource usage
  ${GREEN}migrate${NC}            Run database migrations
  ${GREEN}seed${NC}               Seed database
  ${GREEN}reset${NC}              Delete all data (CAREFUL!)
  ${GREEN}clean${NC}              Clean up Docker resources
  ${GREEN}help${NC}               Show this help message

${YELLOW}Examples:${NC}
  bash docker.sh                    # One command: build + start all services
  bash docker.sh start              # Explicit form of the same command
  bash docker.sh build              # Build images
  bash docker.sh up                 # Start services
  bash docker.sh logs backend       # View backend logs
  bash docker.sh shell backend      # Access backend shell
  bash docker.sh status             # Check all services
  bash docker.sh migrate            # Run migrations

${YELLOW}Service URLs:${NC}
  Frontend:  ${BLUE}http://localhost:3001${NC}
  Backend:   ${BLUE}http://localhost:3000${NC}
  API Docs:  ${BLUE}http://localhost:3000/docs${NC}
  Database:  ${BLUE}localhost:5432${NC} (user: oralign)
    Redis:     ${BLUE}internal Docker service redis:6379${NC}
EOF
}

# Main
case "${1:-start}" in
    start) cmd_start ;;
    build) cmd_build ;;
    up) cmd_up ;;
    down) cmd_down ;;
    ps) cmd_ps ;;
    logs) cmd_logs "$2" ;;
    shell) cmd_shell "$2" ;;
    status) cmd_status ;;
    stats) cmd_stats ;;
    migrate) cmd_migrate ;;
    seed) cmd_seed ;;
    reset) cmd_reset ;;
    clean) cmd_clean ;;
    help) cmd_help ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        cmd_help
        exit 1
        ;;
esac
