"""
Demand Forecasting API endpoints.

Provides endpoints for generating and managing order volume forecasts.
"""

from typing import Dict, Any, List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_manager_or_admin, get_current_user
from app.models.user import User
from app.models.store import Store
from app.models.order_forecast import OrderForecast
from app.models.historical_order import HistoricalOrder
from app.services.forecaster import ForecastingService, ForecastMethod

router = APIRouter()


class GenerateForecastRequest(BaseModel):
    """Request to generate a new forecast."""
    store_id: int
    week_start: date = Field(..., description="Monday of the week to forecast")
    method: str = Field("ensemble", description="Forecasting method: simple_average, weighted_average, exponential_smoothing, ensemble")
    save_to_db: bool = Field(True, description="Whether to save forecast to database")


class ForecastResponse(BaseModel):
    """Response containing forecast data."""
    store_id: int
    week_start: str
    total_predicted_orders: float
    method: str
    daily_forecasts: List[Dict[str, Any]]
    warnings: List[str]


class ImportHistoricalRequest(BaseModel):
    """Request to import historical order data."""
    store_id: int
    data: List[Dict[str, Any]] = Field(..., description="List of {date, hour, order_count} records")


@router.post("/generate", response_model=ForecastResponse)
async def generate_forecast(
    request: GenerateForecastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Generate order volume forecast for a store and week.

    Uses historical data to predict hourly order volumes for the target week.
    Available methods:
    - simple_average: Mean of same day/hour over past weeks
    - weighted_average: Recent weeks weighted more heavily
    - exponential_smoothing: Holt-Winters style smoothing
    - ensemble: Combination of all methods (recommended)
    """
    # Validate store
    store = db.query(Store).filter(Store.id == request.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Validate week_start is Monday
    if request.week_start.weekday() != 0:
        raise HTTPException(status_code=400, detail="week_start must be a Monday")

    # Parse method
    try:
        method = ForecastMethod(request.method)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid method. Choose from: {[m.value for m in ForecastMethod]}"
        )

    # Generate forecast
    service = ForecastingService(db)

    # Check if historical data exists
    historical_count = db.query(HistoricalOrder).filter(
        HistoricalOrder.store_id == request.store_id
    ).count()

    if historical_count == 0:
        # Use default forecast
        forecast = service.generate_default_forecast(request.store_id, request.week_start)
    else:
        forecast = service.forecast_week(request.store_id, request.week_start, method)

    # Save to database if requested
    if request.save_to_db:
        service.save_forecast(request.store_id, request.week_start, method)

    # Convert to response format
    daily_data = []
    for daily in forecast.daily_forecasts:
        daily_data.append({
            "date": daily.date.isoformat(),
            "day_name": daily.date.strftime("%A"),
            "total_orders": daily.total_predicted_orders,
            "peak_hour": daily.peak_hour,
            "peak_orders": daily.peak_orders,
            "hourly": [
                {
                    "hour": h.hour,
                    "predicted": h.predicted_orders,
                    "confidence_low": h.confidence_low,
                    "confidence_high": h.confidence_high,
                    "data_points": h.data_points_used
                }
                for h in daily.hourly_forecasts
            ]
        })

    return {
        "store_id": forecast.store_id,
        "week_start": forecast.week_start.isoformat(),
        "total_predicted_orders": forecast.total_predicted_orders,
        "method": forecast.method,
        "daily_forecasts": daily_data,
        "warnings": forecast.warnings
    }


@router.get("/week")
async def get_weekly_forecast(
    store_id: int = Query(...),
    week_start: date = Query(..., description="Monday of the week"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get existing forecast for a store and week.

    Returns saved forecast from database, or generates new one if not found.
    """
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    if week_start.weekday() != 0:
        raise HTTPException(status_code=400, detail="week_start must be a Monday")

    week_end = week_start + timedelta(days=6)

    # Get saved forecasts
    forecasts = db.query(OrderForecast).filter(
        OrderForecast.store_id == store_id,
        OrderForecast.date >= week_start,
        OrderForecast.date <= week_end
    ).order_by(OrderForecast.date, OrderForecast.hour).all()

    if not forecasts:
        # Generate and return forecast without saving
        service = ForecastingService(db)
        historical_count = db.query(HistoricalOrder).filter(
            HistoricalOrder.store_id == store_id
        ).count()

        if historical_count == 0:
            forecast = service.generate_default_forecast(store_id, week_start)
        else:
            forecast = service.forecast_week(store_id, week_start)

        return {
            "store_id": store_id,
            "week_start": week_start.isoformat(),
            "source": "generated",
            "total_orders": forecast.total_predicted_orders,
            "forecasts": [
                {
                    "date": h.date.isoformat(),
                    "hour": h.hour,
                    "predicted_orders": h.predicted_orders
                }
                for d in forecast.daily_forecasts
                for h in d.hourly_forecasts
            ],
            "warnings": forecast.warnings
        }

    # Return saved forecasts
    total_orders = sum(f.predicted_orders for f in forecasts)

    return {
        "store_id": store_id,
        "week_start": week_start.isoformat(),
        "source": "database",
        "total_orders": round(total_orders, 2),
        "forecasts": [
            {
                "date": f.date.isoformat(),
                "hour": f.hour,
                "predicted_orders": f.predicted_orders,
                "actual_orders": f.actual_orders
            }
            for f in forecasts
        ],
        "warnings": []
    }


@router.get("/day")
async def get_daily_forecast(
    store_id: int = Query(...),
    target_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get forecast for a specific day.
    """
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Check database first
    forecasts = db.query(OrderForecast).filter(
        OrderForecast.store_id == store_id,
        OrderForecast.date == target_date
    ).order_by(OrderForecast.hour).all()

    if forecasts:
        total = sum(f.predicted_orders for f in forecasts)
        peak = max(forecasts, key=lambda f: f.predicted_orders)

        return {
            "store_id": store_id,
            "date": target_date.isoformat(),
            "day_name": target_date.strftime("%A"),
            "source": "database",
            "total_orders": round(total, 2),
            "peak_hour": peak.hour,
            "peak_orders": peak.predicted_orders,
            "hourly": [
                {
                    "hour": f.hour,
                    "predicted_orders": f.predicted_orders,
                    "actual_orders": f.actual_orders
                }
                for f in forecasts
            ]
        }

    # Generate on the fly
    service = ForecastingService(db)
    forecast = service.forecast_day(store_id, target_date)

    return {
        "store_id": store_id,
        "date": target_date.isoformat(),
        "day_name": target_date.strftime("%A"),
        "source": "generated",
        "total_orders": forecast.total_predicted_orders,
        "peak_hour": forecast.peak_hour,
        "peak_orders": forecast.peak_orders,
        "hourly": [
            {
                "hour": h.hour,
                "predicted_orders": h.predicted_orders,
                "confidence_low": h.confidence_low,
                "confidence_high": h.confidence_high,
                "data_points": h.data_points_used
            }
            for h in forecast.hourly_forecasts
        ]
    }


@router.post("/import-historical")
async def import_historical_data(
    request: ImportHistoricalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Import historical order data for a store.

    Data format: List of objects with {date, hour, order_count}
    Example:
    [
        {"date": "2025-01-01", "hour": 10, "order_count": 25.5},
        {"date": "2025-01-01", "hour": 11, "order_count": 32.0}
    ]
    """
    store = db.query(Store).filter(Store.id == request.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    imported = 0
    errors = []

    for i, record in enumerate(request.data):
        try:
            record_date = date.fromisoformat(record["date"]) if isinstance(record["date"], str) else record["date"]
            hour = int(record["hour"])
            order_count = float(record["order_count"])

            # Check for existing record
            existing = db.query(HistoricalOrder).filter(
                HistoricalOrder.store_id == request.store_id,
                HistoricalOrder.date == record_date,
                HistoricalOrder.hour == hour
            ).first()

            if existing:
                existing.order_count = order_count
            else:
                historical = HistoricalOrder(
                    store_id=request.store_id,
                    date=record_date,
                    hour=hour,
                    order_count=order_count,
                    day_of_week=record_date.weekday(),
                    is_holiday=record.get("is_holiday", 0)
                )
                db.add(historical)

            imported += 1

        except Exception as e:
            errors.append(f"Record {i}: {str(e)}")

    db.commit()

    return {
        "message": f"Imported {imported} records",
        "store_id": request.store_id,
        "records_imported": imported,
        "errors": errors[:10] if errors else []  # Limit error output
    }


@router.post("/update-actuals")
async def update_actual_orders(
    store_id: int = Query(...),
    target_date: date = Query(...),
    hour: int = Query(..., ge=0, le=23),
    actual_orders: float = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Update forecast with actual order count for accuracy tracking.
    """
    service = ForecastingService(db)
    updated = service.update_actuals(store_id, target_date, hour, actual_orders)

    if updated:
        return {
            "message": "Actual orders updated",
            "store_id": store_id,
            "date": target_date.isoformat(),
            "hour": hour,
            "actual_orders": actual_orders
        }
    else:
        # Create forecast record if it doesn't exist
        forecast = OrderForecast(
            store_id=store_id,
            date=target_date,
            hour=hour,
            predicted_orders=0,  # No prediction available
            actual_orders=actual_orders
        )
        db.add(forecast)
        db.commit()

        return {
            "message": "Created new record with actual orders",
            "store_id": store_id,
            "date": target_date.isoformat(),
            "hour": hour,
            "actual_orders": actual_orders
        }


@router.get("/accuracy")
async def get_forecast_accuracy(
    store_id: int = Query(...),
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Get forecast accuracy metrics for a date range.

    Returns MAPE (Mean Absolute Percentage Error), MAE, and bias.
    """
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    service = ForecastingService(db)
    return service.get_forecast_accuracy(store_id, start_date, end_date)


@router.get("/historical-summary")
async def get_historical_summary(
    store_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Get summary of available historical data for a store.
    """
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Count records
    total_records = db.query(HistoricalOrder).filter(
        HistoricalOrder.store_id == store_id
    ).count()

    if total_records == 0:
        return {
            "store_id": store_id,
            "store_name": store.name,
            "has_data": False,
            "total_records": 0,
            "message": "No historical data available. Import data using /import-historical"
        }

    # Get date range
    from sqlalchemy import func as sqlfunc

    date_range = db.query(
        sqlfunc.min(HistoricalOrder.date),
        sqlfunc.max(HistoricalOrder.date)
    ).filter(HistoricalOrder.store_id == store_id).first()

    # Get average by day of week
    dow_avg = db.query(
        HistoricalOrder.day_of_week,
        sqlfunc.avg(HistoricalOrder.order_count)
    ).filter(
        HistoricalOrder.store_id == store_id
    ).group_by(HistoricalOrder.day_of_week).all()

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    daily_averages = {
        day_names[dow]: round(avg, 2) if avg else 0
        for dow, avg in dow_avg
        if dow is not None
    }

    return {
        "store_id": store_id,
        "store_name": store.name,
        "has_data": True,
        "total_records": total_records,
        "date_range": {
            "start": date_range[0].isoformat() if date_range[0] else None,
            "end": date_range[1].isoformat() if date_range[1] else None
        },
        "weeks_of_data": ((date_range[1] - date_range[0]).days // 7 + 1) if date_range[0] and date_range[1] else 0,
        "daily_averages": daily_averages
    }


@router.delete("/historical")
async def clear_historical_data(
    store_id: int = Query(...),
    before_date: Optional[date] = Query(None, description="Clear data before this date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Clear historical data for a store.

    If before_date is provided, only clears data before that date.
    Otherwise clears all historical data for the store.
    """
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    query = db.query(HistoricalOrder).filter(HistoricalOrder.store_id == store_id)

    if before_date:
        query = query.filter(HistoricalOrder.date < before_date)

    deleted = query.delete()
    db.commit()

    return {
        "message": f"Deleted {deleted} historical records",
        "store_id": store_id,
        "before_date": before_date.isoformat() if before_date else "all"
    }


@router.post("/batch-generate")
async def batch_generate_forecasts(
    week_start: date = Query(..., description="Monday of the week"),
    store_ids: Optional[List[int]] = Query(None, description="Store IDs (omit for all stores)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Generate forecasts for multiple stores at once.

    If store_ids is not provided, generates for all stores.
    """
    if week_start.weekday() != 0:
        raise HTTPException(status_code=400, detail="week_start must be a Monday")

    if store_ids:
        stores = db.query(Store).filter(Store.id.in_(store_ids)).all()
    else:
        stores = db.query(Store).all()

    if not stores:
        raise HTTPException(status_code=404, detail="No stores found")

    service = ForecastingService(db)
    results = []

    for store in stores:
        try:
            count = service.save_forecast(store.id, week_start)
            results.append({
                "store_id": store.id,
                "store_name": store.name,
                "status": "success",
                "records_created": count
            })
        except Exception as e:
            results.append({
                "store_id": store.id,
                "store_name": store.name,
                "status": "error",
                "error": str(e)
            })

    successful = sum(1 for r in results if r["status"] == "success")

    return {
        "week_start": week_start.isoformat(),
        "stores_processed": len(stores),
        "successful": successful,
        "failed": len(stores) - successful,
        "results": results
    }
