"""
Labor Standards Service

Converts predicted order volume into required picker hours based on
configurable productivity standards.
"""

from typing import List, Dict, Optional
from datetime import date, time, datetime, timedelta
from sqlalchemy.orm import Session

from app.models.labor_standard import LaborStandard
from app.models.order_forecast import OrderForecast
from app.models.store import Store
from app.config import get_settings

settings = get_settings()


class LaborStandardsService:
    """Service for calculating labor requirements based on demand forecasts."""

    def __init__(self, db: Session):
        self.db = db

    def get_labor_standard(self, store_id: int) -> LaborStandard:
        """Get labor standard for a store, creating default if not exists."""
        standard = self.db.query(LaborStandard).filter(
            LaborStandard.store_id == store_id
        ).first()

        if not standard:
            # Create default labor standard
            standard = LaborStandard(
                store_id=store_id,
                orders_per_picker_hour=settings.default_orders_per_picker_hour,
                min_shift_hours=settings.default_min_shift_hours,
                max_shift_hours=settings.default_max_shift_hours,
            )
            self.db.add(standard)
            self.db.commit()
            self.db.refresh(standard)

        return standard

    def calculate_required_hours(
        self,
        predicted_orders: float,
        orders_per_picker_hour: float
    ) -> float:
        """Calculate required picker hours for a given order volume."""
        if orders_per_picker_hour <= 0:
            return 0.0
        return predicted_orders / orders_per_picker_hour

    def get_hourly_requirements(
        self,
        store_id: int,
        target_date: date,
        auto_generate: bool = True
    ) -> Dict[int, float]:
        """
        Get required picker hours for each hour of a given day.

        Args:
            store_id: Store ID
            target_date: Date to get requirements for
            auto_generate: If True, generate forecast if none exists

        Returns:
            Dict mapping hour (0-23) to required picker hours
        """
        standard = self.get_labor_standard(store_id)
        store = self.db.query(Store).filter(Store.id == store_id).first()

        if not store:
            return {}

        # Get forecasts for the day
        forecasts = self.db.query(OrderForecast).filter(
            OrderForecast.store_id == store_id,
            OrderForecast.date == target_date
        ).all()

        # If no forecasts exist and auto_generate is enabled, generate them
        if not forecasts and auto_generate:
            from app.services.forecaster import ForecastingService
            forecaster = ForecastingService(self.db)
            daily_forecast = forecaster.forecast_day(store_id, target_date)

            # Use the generated forecast data
            forecasts = []
            for hourly in daily_forecast.hourly_forecasts:
                # Create temporary forecast objects
                class TempForecast:
                    def __init__(self, hour, predicted_orders):
                        self.hour = hour
                        self.predicted_orders = predicted_orders

                forecasts.append(TempForecast(hourly.hour, hourly.predicted_orders))

        # Build hourly requirements
        requirements = {}

        # Get store operating hours
        start_hour = store.operating_start.hour if store.operating_start else settings.store_open_hour
        end_hour = store.operating_end.hour if store.operating_end else settings.store_close_hour

        for hour in range(start_hour, end_hour):
            # Find forecast for this hour
            forecast = next(
                (f for f in forecasts if f.hour == hour),
                None
            )
            predicted_orders = forecast.predicted_orders if forecast else 0.0

            required_hours = self.calculate_required_hours(
                predicted_orders,
                standard.orders_per_picker_hour
            )
            requirements[hour] = round(required_hours, 2)

        return requirements

    def get_daily_requirement(self, store_id: int, target_date: date) -> float:
        """Get total required picker hours for a day."""
        hourly = self.get_hourly_requirements(store_id, target_date)
        return sum(hourly.values())

    def get_weekly_requirements(
        self,
        store_id: int,
        week_start: date
    ) -> Dict[date, Dict[int, float]]:
        """
        Get required picker hours for each hour of each day in a week.

        Args:
            store_id: Store ID
            week_start: Monday of the target week

        Returns:
            Dict mapping date to hourly requirements dict
        """
        requirements = {}
        for day_offset in range(7):
            target_date = week_start + timedelta(days=day_offset)
            requirements[target_date] = self.get_hourly_requirements(
                store_id, target_date
            )
        return requirements

    def get_weekly_summary(
        self,
        store_id: int,
        week_start: date
    ) -> Dict[str, float]:
        """
        Get summary of labor requirements for a week.

        Returns:
            Dict with total_hours, avg_daily_hours, peak_hour, etc.
        """
        weekly = self.get_weekly_requirements(store_id, week_start)

        total_hours = 0.0
        peak_hour_value = 0.0
        peak_hour_info = None

        for day_date, hourly in weekly.items():
            for hour, hours_needed in hourly.items():
                total_hours += hours_needed
                if hours_needed > peak_hour_value:
                    peak_hour_value = hours_needed
                    peak_hour_info = {"date": day_date, "hour": hour}

        daily_totals = [sum(hourly.values()) for hourly in weekly.values()]
        avg_daily = sum(daily_totals) / 7 if daily_totals else 0

        return {
            "store_id": store_id,
            "week_start": week_start.isoformat(),
            "total_required_hours": round(total_hours, 2),
            "avg_daily_hours": round(avg_daily, 2),
            "peak_day": max(zip(weekly.keys(), daily_totals), key=lambda x: x[1])[0].isoformat() if daily_totals else None,
            "peak_hour": peak_hour_info,
            "peak_hour_requirement": round(peak_hour_value, 2),
        }

    def calculate_pickers_needed(
        self,
        required_hours: float,
        shift_length: int = 8
    ) -> int:
        """
        Calculate minimum number of pickers needed to cover required hours.

        Args:
            required_hours: Total picker-hours needed
            shift_length: Standard shift length in hours

        Returns:
            Minimum number of pickers needed
        """
        if required_hours <= 0:
            return 0
        import math
        return math.ceil(required_hours / shift_length)

    def estimate_staffing_for_day(
        self,
        store_id: int,
        target_date: date
    ) -> Dict[str, any]:
        """
        Estimate staffing needs for a specific day.

        Returns:
            Dict with required_hours, pickers_needed, shifts_breakdown
        """
        standard = self.get_labor_standard(store_id)
        hourly = self.get_hourly_requirements(store_id, target_date)
        total_hours = sum(hourly.values())

        # Calculate with different shift lengths
        pickers_8hr = self.calculate_pickers_needed(total_hours, 8)
        pickers_9hr = self.calculate_pickers_needed(total_hours, 9)

        # Find peak hours (top 3)
        sorted_hours = sorted(hourly.items(), key=lambda x: x[1], reverse=True)
        peak_hours = sorted_hours[:3] if len(sorted_hours) >= 3 else sorted_hours

        return {
            "store_id": store_id,
            "date": target_date.isoformat(),
            "total_required_hours": round(total_hours, 2),
            "orders_per_picker_hour": standard.orders_per_picker_hour,
            "recommended_8hr_shifts": pickers_8hr,
            "recommended_9hr_shifts": pickers_9hr,
            "peak_hours": [
                {"hour": h, "required_hours": round(r, 2)}
                for h, r in peak_hours
            ],
            "hourly_breakdown": {
                str(h): round(r, 2) for h, r in hourly.items()
            }
        }
