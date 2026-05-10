#!/usr/bin/env powershell

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",
    
    [Parameter(Position = 1)]
    [string]$Service = ""
)

# Colors
$Success = 'Green'
$Error = 'Red'
$Warning = 'Yellow'
$Info = 'Cyan'

function Print-Header {
    param([string]$Text)
    Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
}

function Print-Success {
    param([string]$Text)
    Write-Host "✓ $Text" -ForegroundColor Green
}

function Print-Error {
    param([string]$Text)
    Write-Host "✗ $Text" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Text)
    Write-Host "⚠ $Text" -ForegroundColor Yellow
}

function Print-Info {
    param([string]$Text)
    Write-Host "ℹ $Text" -ForegroundColor Cyan
}

function Cmd-Build {
    Print-Header "Building Docker Images"
    docker-compose build
    Print-Success "Images built successfully"
}

function Cmd-Up {
    Print-Header "Starting Services"
    docker-compose up -d
    Print-Success "Services started"
    docker-compose ps
}

function Cmd-Down {
    Print-Header "Stopping Services"
    docker-compose down
    Print-Success "Services stopped"
}

function Cmd-Logs {
    param([string]$Service)
    if ([string]::IsNullOrEmpty($Service)) {
        docker-compose logs -f
    } else {
        docker-compose logs -f $Service
    }
}

function Cmd-Shell {
    param([string]$Service)
    if ([string]::IsNullOrEmpty($Service)) {
        Print-Error "Please specify a service: backend, frontend, or postgres"
        return
    }
    docker-compose exec $Service sh
}

function Cmd-Status {
    Print-Header "Service Status"
    docker-compose ps
    
    Print-Header "Service Health"
    Print-Info "Checking service health..."
    Write-Host ""
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Print-Success "Backend is healthy"
        } else {
            Print-Error "Backend is not responding"
        }
    } catch {
        Print-Error "Backend is not responding"
    }
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Print-Success "Frontend is healthy"
        } else {
            Print-Error "Frontend is not responding"
        }
    } catch {
        Print-Error "Frontend is not responding"
    }
    
    try {
        $output = docker-compose exec postgres psql -U oralign -d oralign_db -c "SELECT 1" 2>&1
        Print-Success "PostgreSQL is healthy"
    } catch {
        Print-Error "PostgreSQL is not responding"
    }
    
    try {
        $output = docker-compose exec redis redis-cli -a redis_secure_password ping 2>&1
        Print-Success "Redis is healthy"
    } catch {
        Print-Error "Redis is not responding"
    }
}

function Cmd-Migrate {
    Print-Header "Running Migrations"
    docker-compose exec backend npx prisma migrate deploy
    Print-Success "Migrations completed"
}

function Cmd-Seed {
    Print-Header "Seeding Database"
    docker-compose exec backend npx prisma db seed
    Print-Success "Database seeded"
}

function Cmd-Reset {
    Print-Header "Resetting Everything"
    Print-Warning "This will DELETE all data!"
    $confirm = Read-Host "Are you sure? (yes/no)"
    
    if ($confirm -ne "yes") {
        Print-Info "Reset cancelled"
        return
    }
    
    docker-compose down -v
    Print-Success "All data removed"
    Print-Info "Run '.\docker.ps1 up' to start fresh"
}

function Cmd-Clean {
    Print-Header "Cleaning Up"
    docker system prune -f
    Print-Success "Cleanup completed"
}

function Cmd-Ps {
    docker-compose ps
}

function Cmd-Stats {
    docker stats
}

function Cmd-Help {
    $help = @"
Oralign Docker CLI

Usage: .\docker.ps1 [command] [options]

Commands:
  build              Build Docker images
  up                 Start all services
  down               Stop all services
  ps                 Show container status
  logs [service]     View logs (backend, frontend, postgres, redis)
  shell <service>    Open shell in service
  status             Check health of all services
  stats              Show resource usage
  migrate            Run database migrations
  seed               Seed database
  reset              Delete all data (CAREFUL!)
  clean              Clean up Docker resources
  help               Show this help message

Examples:
  .\docker.ps1 build              # Build images
  .\docker.ps1 up                 # Start services
  .\docker.ps1 logs backend       # View backend logs
  .\docker.ps1 shell backend      # Access backend shell
  .\docker.ps1 status             # Check all services
  .\docker.ps1 migrate            # Run migrations

Service URLs:
  Frontend:  http://localhost:3001
  Backend:   http://localhost:3000
  API Docs:  http://localhost:3000/api/docs
  Database:  localhost:5432 (user: oralign)
  Redis:     localhost:6379
"@
    Write-Host $help -ForegroundColor Cyan
}

# Main
switch ($Command.ToLower()) {
    "build" { Cmd-Build }
    "up" { Cmd-Up }
    "down" { Cmd-Down }
    "ps" { Cmd-Ps }
    "logs" { Cmd-Logs $Service }
    "shell" { Cmd-Shell $Service }
    "status" { Cmd-Status }
    "stats" { Cmd-Stats }
    "migrate" { Cmd-Migrate }
    "seed" { Cmd-Seed }
    "reset" { Cmd-Reset }
    "clean" { Cmd-Clean }
    "help" { Cmd-Help }
    default {
        Print-Error "Unknown command: $Command"
        Write-Host ""
        Cmd-Help
        exit 1
    }
}
