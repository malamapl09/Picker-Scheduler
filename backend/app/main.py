from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.routes import auth, stores, employees, schedules, shifts, availability, time_off, swaps, reports, compliance, optimizer, forecasts, notifications, data_io

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="API for Picker Scheduling & Labor Optimization System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(stores.router, prefix="/api/stores", tags=["Stores"])
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(schedules.router, prefix="/api/schedules", tags=["Schedules"])
app.include_router(shifts.router, prefix="/api/shifts", tags=["Shifts"])
app.include_router(availability.router, prefix="/api/availability", tags=["Availability"])
app.include_router(time_off.router, prefix="/api/time-off", tags=["Time Off"])
app.include_router(swaps.router, prefix="/api/swaps", tags=["Shift Swaps"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["Compliance"])
app.include_router(optimizer.router, prefix="/api/optimizer", tags=["Schedule Optimizer"])
app.include_router(forecasts.router, prefix="/api/forecasts", tags=["Demand Forecasting"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(data_io.router, prefix="/api/data", tags=["Data Import/Export"])


@app.get("/")
async def root():
    return {"message": "Picker Scheduling System API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
