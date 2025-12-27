"""
Sample Data Seeder

Generates realistic sample data for testing the Picker Scheduling System:
- Stores with different characteristics
- Employees with varied availability
- Historical order data with patterns
- Initial labor standards

Run with: python -m app.scripts.seed_data
"""

import random
from datetime import date, datetime, time, timedelta
from typing import List
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
from app.models.store import Store
from app.models.employee import Employee, EmployeeStatus
from app.models.user import User, UserRole
from app.models.labor_standard import LaborStandard
from app.models.historical_order import HistoricalOrder
from app.models.availability import Availability
from app.core.security import get_password_hash


# Sample store data (24 stores as per PRD)
STORE_DATA = [
    {"name": "Downtown Plaza", "code": "DTP-001", "address": "123 Main St, Downtown"},
    {"name": "Westside Mall", "code": "WSM-002", "address": "456 West Ave, Westside"},
    {"name": "Eastgate Center", "code": "EGC-003", "address": "789 East Blvd, Eastgate"},
    {"name": "Northpoint", "code": "NRP-004", "address": "321 North Dr, Northpoint"},
    {"name": "Southside Market", "code": "SSM-005", "address": "654 South St, Southside"},
    {"name": "Central Station", "code": "CTS-006", "address": "987 Center Ave, Central"},
    {"name": "Harbor View", "code": "HBV-007", "address": "147 Harbor Rd, Waterfront"},
    {"name": "Mountain View", "code": "MTV-008", "address": "258 Highland Dr, Uptown"},
    {"name": "Valley Plaza", "code": "VLP-009", "address": "369 Valley Way, Suburbs"},
    {"name": "Riverside Mall", "code": "RSM-010", "address": "741 River St, Riverside"},
    {"name": "Airport Center", "code": "APC-011", "address": "852 Airport Rd, Airport District"},
    {"name": "University Town", "code": "UNT-012", "address": "963 College Ave, University"},
    {"name": "Tech Park", "code": "TKP-013", "address": "174 Innovation Way, Tech District"},
    {"name": "Historic District", "code": "HSD-014", "address": "285 Heritage Ln, Old Town"},
    {"name": "Lakeside", "code": "LKS-015", "address": "396 Lake Dr, Lakefront"},
    {"name": "Industrial Hub", "code": "INH-016", "address": "417 Factory Row, Industrial"},
    {"name": "Fashion Center", "code": "FSC-017", "address": "528 Style Ave, Fashion District"},
    {"name": "Sports Arena", "code": "SPA-018", "address": "639 Stadium Way, Sports Complex"},
    {"name": "Medical Center", "code": "MDC-019", "address": "741 Health Blvd, Medical District"},
    {"name": "Business Park", "code": "BSP-020", "address": "852 Corporate Dr, Business District"},
    {"name": "Suburban Plaza", "code": "SBP-021", "address": "963 Suburban Way, Outer Ring"},
    {"name": "Garden District", "code": "GDN-022", "address": "174 Garden Path, Green Zone"},
    {"name": "Coastal Center", "code": "CST-023", "address": "285 Beach Rd, Coastal"},
    {"name": "Metro Central", "code": "MTC-024", "address": "396 Metro Ave, City Center"},
]

# First names for employees
FIRST_NAMES = [
    "James", "Maria", "David", "Jennifer", "Michael", "Lisa", "Robert", "Patricia",
    "William", "Linda", "Richard", "Barbara", "Joseph", "Elizabeth", "Thomas", "Susan",
    "Charles", "Jessica", "Daniel", "Sarah", "Matthew", "Karen", "Anthony", "Nancy",
    "Mark", "Betty", "Donald", "Margaret", "Steven", "Sandra", "Paul", "Ashley",
    "Andrew", "Kimberly", "Joshua", "Emily", "Kenneth", "Donna", "Kevin", "Michelle",
    "Brian", "Dorothy", "George", "Carol", "Timothy", "Amanda", "Ronald", "Melissa",
    "Edward", "Deborah"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts"
]


def create_stores(db: Session) -> List[Store]:
    """Create sample stores."""
    print("Creating stores...")
    stores = []
    for data in STORE_DATA:
        store = Store(
            name=data["name"],
            code=data["code"],
            address=data["address"],
            operating_start=time(8, 0),
            operating_end=time(22, 0)
        )
        db.add(store)
        stores.append(store)
    db.commit()
    print(f"Created {len(stores)} stores")
    return stores


def create_admin_user(db: Session) -> User:
    """Create admin user."""
    print("Creating admin user...")
    admin = User(
        email="admin@picker-scheduler.com",
        password_hash=get_password_hash("admin123"),
        role=UserRole.ADMIN
    )
    db.add(admin)
    db.commit()
    print("Created admin user: admin@picker-scheduler.com / admin123")
    return admin


def create_manager_users(db: Session, stores: List[Store]) -> List[User]:
    """Create manager users for each store."""
    print("Creating manager users...")
    managers = []
    for i, store in enumerate(stores):
        manager = User(
            email=f"manager{i+1}@picker-scheduler.com",
            password_hash=get_password_hash("manager123"),
            role=UserRole.MANAGER
        )
        db.add(manager)
        managers.append(manager)
    db.commit()
    print(f"Created {len(managers)} manager users")
    return managers


def create_employees(db: Session, stores: List[Store]) -> List[Employee]:
    """Create 50 employees distributed across stores."""
    print("Creating employees...")
    employees = []

    # Distribute employees roughly evenly with some variation
    employees_per_store = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,  # 12 stores with 2
                          2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3]  # 11 stores with 2, 1 with 3 = 50

    random.shuffle(employees_per_store)

    emp_idx = 0
    for store_idx, count in enumerate(employees_per_store):
        store = stores[store_idx]

        for _ in range(count):
            first_name = FIRST_NAMES[emp_idx % len(FIRST_NAMES)]
            last_name = LAST_NAMES[emp_idx % len(LAST_NAMES)]

            # Create user for employee
            user = User(
                email=f"{first_name.lower()}.{last_name.lower()}{emp_idx}@picker-scheduler.com",
                password_hash=get_password_hash("employee123"),
                role=UserRole.EMPLOYEE
            )
            db.add(user)
            db.flush()

            # Create employee
            employee = Employee(
                user_id=user.id,
                store_id=store.id,
                first_name=first_name,
                last_name=last_name,
                hire_date=date.today() - timedelta(days=random.randint(30, 730)),
                status=EmployeeStatus.ACTIVE
            )
            db.add(employee)
            employees.append(employee)
            emp_idx += 1

    db.commit()
    print(f"Created {len(employees)} employees")
    return employees


def create_labor_standards(db: Session, stores: List[Store]) -> None:
    """Create labor standards for each store."""
    print("Creating labor standards...")
    for store in stores:
        # Slight variation in productivity standards
        orders_per_hour = round(random.uniform(8.0, 12.0), 1)

        standard = LaborStandard(
            store_id=store.id,
            orders_per_picker_hour=orders_per_hour,
            min_shift_hours=4.0,
            max_shift_hours=9.0
        )
        db.add(standard)
    db.commit()
    print(f"Created labor standards for {len(stores)} stores")


def create_availability(db: Session, employees: List[Employee]) -> None:
    """Create availability preferences for employees."""
    print("Creating availability preferences...")
    for employee in employees:
        # Most employees available most days
        for day in range(7):
            is_available = random.random() > 0.15  # 85% chance available

            # Preferred hours (slight variations)
            if is_available:
                pref_start = time(random.choice([8, 9, 10]), 0)
                pref_end = time(random.choice([17, 18, 19, 20, 21, 22]), 0)
            else:
                pref_start = None
                pref_end = None

            avail = Availability(
                employee_id=employee.id,
                day_of_week=day,
                is_available=is_available,
                preferred_start=pref_start,
                preferred_end=pref_end
            )
            db.add(avail)

    db.commit()
    print(f"Created availability for {len(employees)} employees")


def create_historical_orders(db: Session, stores: List[Store], weeks: int = 12) -> None:
    """
    Generate realistic historical order data.

    Creates order patterns with:
    - Day-of-week seasonality (weekends busier)
    - Hourly patterns (lunch rush, afternoon peak)
    - Store-to-store variation
    - Random noise
    """
    print(f"Creating {weeks} weeks of historical order data...")

    # Base hourly pattern (percentage of daily orders)
    HOURLY_PATTERN = {
        8: 0.04, 9: 0.06, 10: 0.08, 11: 0.10, 12: 0.12,
        13: 0.10, 14: 0.08, 15: 0.08, 16: 0.09, 17: 0.10,
        18: 0.08, 19: 0.05, 20: 0.02, 21: 0.00
    }

    # Day-of-week multipliers
    DOW_MULTIPLIERS = {
        0: 0.90,  # Monday
        1: 0.95,  # Tuesday
        2: 1.00,  # Wednesday
        3: 1.00,  # Thursday
        4: 1.10,  # Friday
        5: 1.25,  # Saturday (peak)
        6: 0.80   # Sunday
    }

    today = date.today()
    start_date = today - timedelta(weeks=weeks)

    records = []
    for store in stores:
        # Each store has a base volume (varies by location)
        base_daily_orders = random.uniform(80, 150)

        current_date = start_date
        while current_date < today:
            day_of_week = current_date.weekday()
            dow_mult = DOW_MULTIPLIERS.get(day_of_week, 1.0)

            # Daily variation (+-15%)
            daily_variation = random.uniform(0.85, 1.15)
            daily_total = base_daily_orders * dow_mult * daily_variation

            # Generate hourly data
            for hour in range(8, 22):
                hour_pct = HOURLY_PATTERN.get(hour, 0.05)

                # Add some noise
                noise = random.gauss(1.0, 0.15)
                order_count = max(0, daily_total * hour_pct * noise)

                records.append(HistoricalOrder(
                    store_id=store.id,
                    date=current_date,
                    hour=hour,
                    order_count=round(order_count, 1),
                    day_of_week=day_of_week
                ))

            current_date += timedelta(days=1)

    # Batch insert for efficiency
    db.bulk_save_objects(records)
    db.commit()
    print(f"Created {len(records)} historical order records")


def seed_all(db: Session):
    """Run all seed functions."""
    print("\n" + "="*50)
    print("SEEDING PICKER SCHEDULER DATABASE")
    print("="*50 + "\n")

    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)

    # Seed data
    stores = create_stores(db)
    create_admin_user(db)
    create_manager_users(db, stores)
    employees = create_employees(db, stores)
    create_labor_standards(db, stores)
    create_availability(db, employees)
    create_historical_orders(db, stores, weeks=12)

    print("\n" + "="*50)
    print("SEEDING COMPLETE")
    print("="*50)
    print("\nTest accounts:")
    print("  Admin: admin@picker-scheduler.com / admin123")
    print("  Manager: manager1@picker-scheduler.com / manager123")
    print("  Employee: james.smith0@picker-scheduler.com / employee123")
    print("\n")


def main():
    """Main entry point."""
    db = SessionLocal()
    try:
        seed_all(db)
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
