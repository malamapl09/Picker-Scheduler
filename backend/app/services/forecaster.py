"""
Demand Forecasting Service.

Predicts hourly order volumes for stores using historical data and
time series forecasting algorithms.
"""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
import logging
import math

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.store import Store
from app.models.historical_order import HistoricalOrder
from app.models.order_forecast import OrderForecast
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class ForecastMethod(str, Enum):
    """Available forecasting methods."""
    SIMPLE_AVERAGE = "simple_average"  # Average of same day/hour over past weeks
    WEIGHTED_AVERAGE = "weighted_average"  # Recent weeks weighted more heavily
    EXPONENTIAL_SMOOTHING = "exponential_smoothing"  # Holt-Winters style
    ENSEMBLE = "ensemble"  # Combination of multiple methods


@dataclass
class HourlyForecast:
    """Forecast for a single hour."""
    date: date
    hour: int
    predicted_orders: float
    confidence_low: float
    confidence_high: float
    method: str
    data_points_used: int


@dataclass
class DailyForecast:
    """Forecast for an entire day."""
    date: date
    hourly_forecasts: List[HourlyForecast]
    total_predicted_orders: float
    peak_hour: int
    peak_orders: float


@dataclass
class WeeklyForecast:
    """Forecast for an entire week."""
    store_id: int
    week_start: date
    daily_forecasts: List[DailyForecast]
    total_predicted_orders: float
    method: str
    generated_at: datetime
    warnings: List[str] = field(default_factory=list)


class ForecastingService:
    """
    Service for generating demand forecasts using historical order data.

    Implements multiple forecasting algorithms:
    - Simple Average: Mean of same day-of-week/hour combinations
    - Weighted Average: Recent weeks weighted more heavily
    - Exponential Smoothing: Holt-Winters style with trend/seasonality
    - Ensemble: Weighted combination of all methods
    """

    # Number of weeks of historical data to use
    DEFAULT_LOOKBACK_WEEKS = 8

    # Minimum data points needed for reliable forecast
    MIN_DATA_POINTS = 3

    # Weight decay for weighted average (0.9 = 10% decay per week)
    WEIGHT_DECAY = 0.85

    # Smoothing factor for exponential smoothing
    ALPHA = 0.3  # Level smoothing
    BETA = 0.1   # Trend smoothing

    def __init__(self, db: Session):
        self.db = db

    def _get_historical_data(
        self,
        store_id: int,
        lookback_weeks: int = DEFAULT_LOOKBACK_WEEKS
    ) -> Dict[Tuple[int, int], List[Tuple[date, float]]]:
        """
        Fetch historical order data grouped by (day_of_week, hour).

        Returns a dict where keys are (day_of_week, hour) tuples and
        values are lists of (date, order_count) tuples.
        """
        cutoff_date = date.today() - timedelta(weeks=lookback_weeks)

        historical = self.db.query(HistoricalOrder).filter(
            HistoricalOrder.store_id == store_id,
            HistoricalOrder.date >= cutoff_date
        ).order_by(HistoricalOrder.date).all()

        # Group by (day_of_week, hour)
        grouped: Dict[Tuple[int, int], List[Tuple[date, float]]] = {}

        for record in historical:
            day_of_week = record.day_of_week
            if day_of_week is None:
                day_of_week = record.date.weekday()

            key = (day_of_week, record.hour)
            if key not in grouped:
                grouped[key] = []
            grouped[key].append((record.date, record.order_count))

        return grouped

    def _simple_average(
        self,
        data_points: List[Tuple[date, float]]
    ) -> Tuple[float, float, float]:
        """
        Calculate simple average forecast.

        Returns (predicted, confidence_low, confidence_high).
        """
        if not data_points:
            return 0.0, 0.0, 0.0

        values = [d[1] for d in data_points]
        mean = sum(values) / len(values)

        if len(values) > 1:
            variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
            std_dev = math.sqrt(variance)
            # 95% confidence interval
            margin = 1.96 * std_dev / math.sqrt(len(values))
        else:
            margin = mean * 0.3  # 30% margin if only one data point

        return mean, max(0, mean - margin), mean + margin

    def _weighted_average(
        self,
        data_points: List[Tuple[date, float]],
        reference_date: date
    ) -> Tuple[float, float, float]:
        """
        Calculate weighted average forecast (recent data weighted more).

        Returns (predicted, confidence_low, confidence_high).
        """
        if not data_points:
            return 0.0, 0.0, 0.0

        # Sort by date (most recent first)
        sorted_points = sorted(data_points, key=lambda x: x[0], reverse=True)

        weighted_sum = 0.0
        weight_total = 0.0
        weighted_values = []

        for i, (d, value) in enumerate(sorted_points):
            weeks_ago = (reference_date - d).days / 7
            weight = self.WEIGHT_DECAY ** weeks_ago
            weighted_sum += value * weight
            weight_total += weight
            weighted_values.append((value, weight))

        if weight_total == 0:
            return 0.0, 0.0, 0.0

        mean = weighted_sum / weight_total

        # Weighted variance
        if len(weighted_values) > 1:
            variance_sum = sum(w * (v - mean) ** 2 for v, w in weighted_values)
            variance = variance_sum / weight_total
            std_dev = math.sqrt(variance)
            margin = 1.96 * std_dev
        else:
            margin = mean * 0.3

        return mean, max(0, mean - margin), mean + margin

    def _exponential_smoothing(
        self,
        data_points: List[Tuple[date, float]]
    ) -> Tuple[float, float, float]:
        """
        Calculate forecast using simple exponential smoothing.

        Returns (predicted, confidence_low, confidence_high).
        """
        if not data_points:
            return 0.0, 0.0, 0.0

        # Sort by date (oldest first for smoothing)
        sorted_points = sorted(data_points, key=lambda x: x[0])
        values = [d[1] for d in sorted_points]

        # Initialize
        level = values[0]

        # Apply exponential smoothing
        for value in values[1:]:
            level = self.ALPHA * value + (1 - self.ALPHA) * level

        # Calculate error for confidence interval
        errors = []
        smooth = values[0]
        for value in values[1:]:
            errors.append(abs(value - smooth))
            smooth = self.ALPHA * value + (1 - self.ALPHA) * smooth

        if errors:
            mae = sum(errors) / len(errors)
            margin = 1.96 * mae
        else:
            margin = level * 0.3

        return level, max(0, level - margin), level + margin

    def _ensemble_forecast(
        self,
        data_points: List[Tuple[date, float]],
        reference_date: date
    ) -> Tuple[float, float, float]:
        """
        Combine multiple forecasting methods for robust prediction.

        Uses weighted average of all methods based on typical accuracy.
        """
        simple = self._simple_average(data_points)
        weighted = self._weighted_average(data_points, reference_date)
        exp_smooth = self._exponential_smoothing(data_points)

        # Weights for each method (sum to 1)
        weights = {
            'simple': 0.25,
            'weighted': 0.45,  # Higher weight for recency-aware method
            'exp_smooth': 0.30
        }

        predicted = (
            weights['simple'] * simple[0] +
            weights['weighted'] * weighted[0] +
            weights['exp_smooth'] * exp_smooth[0]
        )

        # Conservative confidence interval (widest bounds)
        conf_low = min(simple[1], weighted[1], exp_smooth[1])
        conf_high = max(simple[2], weighted[2], exp_smooth[2])

        return predicted, conf_low, conf_high

    def forecast_hour(
        self,
        store_id: int,
        target_date: date,
        hour: int,
        method: ForecastMethod = ForecastMethod.ENSEMBLE,
        historical_data: Optional[Dict] = None
    ) -> HourlyForecast:
        """
        Generate forecast for a specific hour.

        Args:
            store_id: Store to forecast for
            target_date: Date to forecast
            hour: Hour of day (0-23)
            method: Forecasting method to use
            historical_data: Pre-fetched historical data (optional)

        Returns:
            HourlyForecast with prediction and confidence interval
        """
        if historical_data is None:
            historical_data = self._get_historical_data(store_id)

        day_of_week = target_date.weekday()
        key = (day_of_week, hour)
        data_points = historical_data.get(key, [])

        if method == ForecastMethod.SIMPLE_AVERAGE:
            predicted, conf_low, conf_high = self._simple_average(data_points)
        elif method == ForecastMethod.WEIGHTED_AVERAGE:
            predicted, conf_low, conf_high = self._weighted_average(data_points, target_date)
        elif method == ForecastMethod.EXPONENTIAL_SMOOTHING:
            predicted, conf_low, conf_high = self._exponential_smoothing(data_points)
        else:  # ENSEMBLE
            predicted, conf_low, conf_high = self._ensemble_forecast(data_points, target_date)

        return HourlyForecast(
            date=target_date,
            hour=hour,
            predicted_orders=round(predicted, 2),
            confidence_low=round(conf_low, 2),
            confidence_high=round(conf_high, 2),
            method=method.value,
            data_points_used=len(data_points)
        )

    def forecast_day(
        self,
        store_id: int,
        target_date: date,
        method: ForecastMethod = ForecastMethod.ENSEMBLE
    ) -> DailyForecast:
        """
        Generate forecast for an entire day.

        Args:
            store_id: Store to forecast for
            target_date: Date to forecast
            method: Forecasting method to use

        Returns:
            DailyForecast with hourly breakdown
        """
        store = self.db.query(Store).filter(Store.id == store_id).first()
        if not store:
            raise ValueError(f"Store {store_id} not found")

        start_hour = store.operating_start.hour if store.operating_start else 8
        end_hour = store.operating_end.hour if store.operating_end else 22

        historical_data = self._get_historical_data(store_id)

        hourly_forecasts = []
        for hour in range(start_hour, end_hour):
            forecast = self.forecast_hour(
                store_id, target_date, hour, method, historical_data
            )
            hourly_forecasts.append(forecast)

        total_orders = sum(h.predicted_orders for h in hourly_forecasts)

        # Find peak hour
        peak_forecast = max(hourly_forecasts, key=lambda h: h.predicted_orders) if hourly_forecasts else None

        return DailyForecast(
            date=target_date,
            hourly_forecasts=hourly_forecasts,
            total_predicted_orders=round(total_orders, 2),
            peak_hour=peak_forecast.hour if peak_forecast else 12,
            peak_orders=peak_forecast.predicted_orders if peak_forecast else 0
        )

    def forecast_week(
        self,
        store_id: int,
        week_start: date,
        method: ForecastMethod = ForecastMethod.ENSEMBLE
    ) -> WeeklyForecast:
        """
        Generate forecast for an entire week.

        Args:
            store_id: Store to forecast for
            week_start: Monday of the week to forecast
            method: Forecasting method to use

        Returns:
            WeeklyForecast with daily breakdown
        """
        if week_start.weekday() != 0:
            raise ValueError("week_start must be a Monday")

        daily_forecasts = []
        warnings = []

        # Pre-fetch historical data once for efficiency
        historical_data = self._get_historical_data(store_id)

        if not historical_data:
            warnings.append("No historical data available - using default estimates")

        for day_offset in range(7):
            target_date = week_start + timedelta(days=day_offset)
            day_forecast = self.forecast_day(store_id, target_date, method)
            daily_forecasts.append(day_forecast)

            # Check data quality
            low_data_hours = sum(
                1 for h in day_forecast.hourly_forecasts
                if h.data_points_used < self.MIN_DATA_POINTS
            )
            if low_data_hours > 0:
                warnings.append(
                    f"{target_date.strftime('%A')}: {low_data_hours} hours with limited data"
                )

        total_orders = sum(d.total_predicted_orders for d in daily_forecasts)

        return WeeklyForecast(
            store_id=store_id,
            week_start=week_start,
            daily_forecasts=daily_forecasts,
            total_predicted_orders=round(total_orders, 2),
            method=method.value,
            generated_at=datetime.utcnow(),
            warnings=warnings
        )

    def save_forecast(
        self,
        store_id: int,
        week_start: date,
        method: ForecastMethod = ForecastMethod.ENSEMBLE
    ) -> int:
        """
        Generate and save forecast to database.

        Args:
            store_id: Store to forecast for
            week_start: Monday of the week to forecast
            method: Forecasting method to use

        Returns:
            Number of forecast records created
        """
        weekly_forecast = self.forecast_week(store_id, week_start, method)

        # Delete existing forecasts for this store/week
        week_end = week_start + timedelta(days=6)
        self.db.query(OrderForecast).filter(
            OrderForecast.store_id == store_id,
            OrderForecast.date >= week_start,
            OrderForecast.date <= week_end
        ).delete()

        # Insert new forecasts
        count = 0
        for daily in weekly_forecast.daily_forecasts:
            for hourly in daily.hourly_forecasts:
                forecast = OrderForecast(
                    store_id=store_id,
                    date=hourly.date,
                    hour=hourly.hour,
                    predicted_orders=hourly.predicted_orders
                )
                self.db.add(forecast)
                count += 1

        self.db.commit()
        logger.info(f"Saved {count} forecast records for store {store_id}, week {week_start}")

        return count

    def update_actuals(
        self,
        store_id: int,
        target_date: date,
        hour: int,
        actual_orders: float
    ) -> bool:
        """
        Update forecast with actual order count (for accuracy tracking).

        Args:
            store_id: Store ID
            target_date: Date of the actual
            hour: Hour of the actual
            actual_orders: Actual order count

        Returns:
            True if forecast was updated, False if not found
        """
        forecast = self.db.query(OrderForecast).filter(
            OrderForecast.store_id == store_id,
            OrderForecast.date == target_date,
            OrderForecast.hour == hour
        ).first()

        if forecast:
            forecast.actual_orders = actual_orders
            self.db.commit()
            return True
        return False

    def get_forecast_accuracy(
        self,
        store_id: int,
        start_date: date,
        end_date: date
    ) -> Dict:
        """
        Calculate forecast accuracy metrics for a date range.

        Returns MAPE (Mean Absolute Percentage Error) and other metrics.
        """
        forecasts = self.db.query(OrderForecast).filter(
            OrderForecast.store_id == store_id,
            OrderForecast.date >= start_date,
            OrderForecast.date <= end_date,
            OrderForecast.actual_orders.isnot(None)
        ).all()

        if not forecasts:
            return {
                "store_id": store_id,
                "period": f"{start_date} to {end_date}",
                "data_points": 0,
                "mape": None,
                "mae": None,
                "message": "No actual data available for accuracy calculation"
            }

        errors = []
        absolute_errors = []
        percentage_errors = []

        for f in forecasts:
            error = f.actual_orders - f.predicted_orders
            errors.append(error)
            absolute_errors.append(abs(error))

            if f.actual_orders > 0:
                percentage_errors.append(abs(error) / f.actual_orders * 100)

        mae = sum(absolute_errors) / len(absolute_errors)
        mape = sum(percentage_errors) / len(percentage_errors) if percentage_errors else None

        # Bias (positive = under-forecasting, negative = over-forecasting)
        bias = sum(errors) / len(errors)

        return {
            "store_id": store_id,
            "period": f"{start_date} to {end_date}",
            "data_points": len(forecasts),
            "mape": round(mape, 2) if mape else None,
            "mae": round(mae, 2),
            "bias": round(bias, 2),
            "accuracy_rating": self._rate_accuracy(mape) if mape else "insufficient_data"
        }

    def _rate_accuracy(self, mape: float) -> str:
        """Rate forecast accuracy based on MAPE."""
        if mape < 10:
            return "excellent"
        elif mape < 20:
            return "good"
        elif mape < 30:
            return "fair"
        else:
            return "poor"

    def generate_default_forecast(
        self,
        store_id: int,
        week_start: date
    ) -> WeeklyForecast:
        """
        Generate default forecast when no historical data is available.

        Uses typical retail patterns based on industry averages.
        """
        store = self.db.query(Store).filter(Store.id == store_id).first()
        if not store:
            raise ValueError(f"Store {store_id} not found")

        start_hour = store.operating_start.hour if store.operating_start else 8
        end_hour = store.operating_end.hour if store.operating_end else 22

        # Default hourly pattern (percentage of daily total)
        hourly_pattern = {
            8: 0.04, 9: 0.06, 10: 0.08, 11: 0.10, 12: 0.12,
            13: 0.10, 14: 0.08, 15: 0.08, 16: 0.09, 17: 0.10,
            18: 0.08, 19: 0.05, 20: 0.02, 21: 0.00
        }

        # Default daily pattern (multiplier)
        daily_pattern = {
            0: 0.9,   # Monday
            1: 0.95,  # Tuesday
            2: 1.0,   # Wednesday
            3: 1.0,   # Thursday
            4: 1.1,   # Friday
            5: 1.2,   # Saturday (peak)
            6: 0.85   # Sunday
        }

        # Base daily orders (configurable)
        base_daily_orders = 100

        daily_forecasts = []
        for day_offset in range(7):
            target_date = week_start + timedelta(days=day_offset)
            day_of_week = target_date.weekday()
            day_multiplier = daily_pattern.get(day_of_week, 1.0)
            daily_total = base_daily_orders * day_multiplier

            hourly_forecasts = []
            for hour in range(start_hour, end_hour):
                hour_pct = hourly_pattern.get(hour, 0.05)
                predicted = daily_total * hour_pct

                hourly_forecasts.append(HourlyForecast(
                    date=target_date,
                    hour=hour,
                    predicted_orders=round(predicted, 2),
                    confidence_low=round(predicted * 0.7, 2),
                    confidence_high=round(predicted * 1.3, 2),
                    method="default_pattern",
                    data_points_used=0
                ))

            actual_total = sum(h.predicted_orders for h in hourly_forecasts)
            peak_forecast = max(hourly_forecasts, key=lambda h: h.predicted_orders)

            daily_forecasts.append(DailyForecast(
                date=target_date,
                hourly_forecasts=hourly_forecasts,
                total_predicted_orders=round(actual_total, 2),
                peak_hour=peak_forecast.hour,
                peak_orders=peak_forecast.predicted_orders
            ))

        total_orders = sum(d.total_predicted_orders for d in daily_forecasts)

        return WeeklyForecast(
            store_id=store_id,
            week_start=week_start,
            daily_forecasts=daily_forecasts,
            total_predicted_orders=round(total_orders, 2),
            method="default_pattern",
            generated_at=datetime.utcnow(),
            warnings=["Using default pattern - no historical data available"]
        )
