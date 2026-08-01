#!/usr/bin/env powershell

param(
    [Parameter(Position = 0)]
    [string]$Command = "start",
    
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

function Ensure-LocalEnvironment {
    if (Test-Path ".env") {
        return
    }

    if (Test-Path ".env.docker") {
        Copy-Item ".env.docker" ".env"
        Print-Info "Created .env from the existing .env.docker file."
        return
    }

    if (-not (Test-Path ".env.docker.example")) {
        Print-Error "Missing .env.docker.example; cannot create local Docker settings."
        exit 1
    }

    Copy-Item ".env.docker.example" ".env"
    Print-Info "Created .env with local Docker defaults."
}

function Assert-Docker {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Print-Error "Docker Desktop is not running."
        exit 1
    }

    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        Print-Error "Docker Compose is not available."
        exit 1
    }
}

function Show-ServiceUrls {
    Write-Host ""
    Write-Host "Frontend:  http://localhost:3001" -ForegroundColor Green
    Write-Host "Backend:   http://localhost:3000/api" -ForegroundColor Green
    Write-Host "Health:    http://localhost:3000/api/health" -ForegroundColor Green
    Write-Host "API Docs:  http://localhost:3000/docs" -ForegroundColor Green
}

function Cmd-Start {
    Ensure-LocalEnvironment
    Assert-Docker
    Print-Header "Starting Oralign"
    Print-Info "Building changed images and starting PostgreSQL, Redis, backend, and frontend..."

    docker compose up --build --detach --remove-orphans --wait --wait-timeout 240
    if ($LASTEXITCODE -ne 0) {
        Print-Error "The stack did not become healthy."
        docker compose ps
        Write-Host ""
        Print-Info "Recent service logs:"
        docker compose logs --tail 80
        exit 1
    }

    docker compose ps
    Print-Success "All Oralign services are healthy."
    Show-ServiceUrls
}

function Cmd-Build {
    Ensure-LocalEnvironment
    Assert-Docker
    Print-Header "Building Docker Images"
    docker compose build
    Print-Success "Images built successfully"
}

function Cmd-Up {
    Cmd-Start
}

# Frees the host port from any leftover process (typically a stray
# `next dev` that survived its parent shell). Called by Cmd-Rebuild before
# the stack is brought up, so the docker bind doesn't fight a node process.
function Free-Port {
    param([int]$Port)
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -ne 0 }
    if (-not $listeners) { return }

    foreach ($processId in $listeners) {
        try {
            $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $proc) { continue }
            # Don't kill Docker Desktop's own processes — they own ports too.
            if ($proc.ProcessName -match '^(com\.docker|Docker|vpnkit)') {
                Print-Warning "Port ${Port} held by $($proc.ProcessName) (pid $processId) — leaving it alone."
                continue
            }
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Print-Info "Freed port ${Port}: killed $($proc.ProcessName) (pid $processId)"
        } catch {
            Print-Warning "Could not free port ${Port} (pid $processId): $($_.Exception.Message)"
        }
    }
}

function Cmd-KillPorts {
    Print-Header "Freeing Project Ports"
    foreach ($p in 3000, 3001, 5432, 6379, 9229, 9230) { Free-Port -Port $p }
    Print-Success "Project ports checked"
}

# One-shot full-stack rebuild: clears stale port holders, brings the stack
# down, builds with --pull, brings it back up, then verifies health.
function Cmd-Rebuild {
    Assert-Docker
    Print-Header "Full-stack Rebuild"

    Print-Info "Step 1/5  Freeing project ports (3000, 3001, 5432, 6379)"
    foreach ($p in 3000, 3001, 5432, 6379, 9229, 9230) { Free-Port -Port $p }

    Print-Info "Step 2/5  Stopping any running containers"
    docker compose down --remove-orphans
    if ($LASTEXITCODE -ne 0) {
        Print-Error "docker compose down failed"
        exit 1
    }

    Print-Info "Step 3/5  Building images (--pull base images)"
    docker compose build --pull
    if ($LASTEXITCODE -ne 0) {
        Print-Error "docker compose build failed"
        exit 1
    }

    Print-Info "Step 4/5  Starting services"
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Print-Error "docker compose up failed"
        exit 1
    }

    Print-Info "Step 5/5  Waiting for services to become healthy (max 90s)"
    $deadline = (Get-Date).AddSeconds(90)
    $services = @('oralign-postgres', 'oralign-redis', 'oralign-backend', 'oralign-frontend')
    while ((Get-Date) -lt $deadline) {
        $statuses = $services | ForEach-Object {
            $s = docker inspect --format '{{.State.Health.Status}}' $_ 2>$null
            if (-not $s) { 'missing' } else { $s }
        }
        if ($statuses -notcontains 'starting' -and $statuses -notcontains 'missing') { break }
        Start-Sleep -Seconds 3
    }
    docker compose ps

    $unhealthy = $services | Where-Object {
        $s = docker inspect --format '{{.State.Health.Status}}' $_ 2>$null
        $s -ne 'healthy'
    }
    if ($unhealthy) {
        Print-Warning "Some services are not healthy yet: $($unhealthy -join ', ')"
        Print-Info "Tail logs with: .\docker.ps1 logs <service>"
    } else {
        Print-Success "All services healthy"
        Show-ServiceUrls
    }
}

function Cmd-Down {
    Print-Header "Stopping Services"
    docker compose down
    Print-Success "Services stopped"
}

function Cmd-Logs {
    param([string]$Service)
    if ([string]::IsNullOrEmpty($Service)) {
        docker compose logs -f
    } else {
        docker compose logs -f $Service
    }
}

function Cmd-Shell {
    param([string]$Service)
    if ([string]::IsNullOrEmpty($Service)) {
        Print-Error "Please specify a service: backend, frontend, or postgres"
        return
    }
    docker compose exec $Service sh
}

function Cmd-Status {
    Print-Header "Service Status"
    docker compose ps
    
    Print-Header "Service Health"
    Print-Info "Checking service health..."
    Write-Host ""
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
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
        $output = docker compose exec postgres psql -U oralign -d oralign_db -c "SELECT 1" 2>&1
        Print-Success "PostgreSQL is healthy"
    } catch {
        Print-Error "PostgreSQL is not responding"
    }
    
    try {
        $output = docker compose exec redis redis-cli -a redis_secure_password ping 2>&1
        Print-Success "Redis is healthy"
    } catch {
        Print-Error "Redis is not responding"
    }
}

function Cmd-Migrate {
    Print-Header "Running Migrations"
    docker compose exec backend npx prisma migrate deploy
    Print-Success "Migrations completed"
}

function Cmd-Seed {
    Print-Header "Seeding Database"
    docker compose exec backend npx prisma db seed
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
    
    docker compose down -v
    Print-Success "All data removed"
    Print-Info "Run '.\docker.ps1 up' to start fresh"
}

function Cmd-Clean {
    Print-Header "Cleaning Up"
    docker system prune -f
    Print-Success "Cleanup completed"
}

function Cmd-Ps {
    docker compose ps
}

function Cmd-Stats {
    docker stats
}

function Cmd-Help {
    $help = @"
Oralign Docker CLI

Usage: .\docker.ps1 [command] [options]

Commands:
  start              Build and start the complete stack, then wait for health
  rebuild            Full-stack rebuild: free ports, down, build, up, wait healthy
  kill-ports         Free 3000/3001/5432/6379/9229/9230 from stray processes
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
  .\docker.ps1                    # One command: build + start all services
  .\docker.ps1 start              # Explicit form of the same command
  .\docker.ps1 rebuild            # One-shot full-stack rebuild + start
  .\docker.ps1 kill-ports         # Free project ports from leftover node procs
  .\docker.ps1 build              # Build images
  .\docker.ps1 up                 # Start services
  .\docker.ps1 logs backend       # View backend logs
  .\docker.ps1 shell backend      # Access backend shell
  .\docker.ps1 status             # Check all services
  .\docker.ps1 migrate            # Run migrations

Service URLs:
  Frontend:  http://localhost:3001
  Backend:   http://localhost:3000
  API Docs:  http://localhost:3000/docs
  Database:  localhost:5432 (user: oralign)
  Redis:     internal Docker service redis:6379
"@
    Write-Host $help -ForegroundColor Cyan
}

# Main
switch ($Command.ToLower()) {
    "start" { Cmd-Start }
    "rebuild" { Cmd-Rebuild }
    "kill-ports" { Cmd-KillPorts }
    "killports" { Cmd-KillPorts }
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
