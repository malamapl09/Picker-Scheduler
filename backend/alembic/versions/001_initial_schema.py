"""Initial database schema

Revision ID: 001_initial
Revises:
Create Date: 2024-12-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === USERS TABLE ===
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'manager', 'employee', name='userrole'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # === STORES TABLE ===
    op.create_table(
        'stores',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('operating_start', sa.Time(), nullable=True),
        sa.Column('operating_end', sa.Time(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_stores_id', 'stores', ['id'])
    op.create_index('ix_stores_code', 'stores', ['code'], unique=True)

    # === EMPLOYEES TABLE ===
    op.create_table(
        'employees',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('first_name', sa.String(100), nullable=False),
        sa.Column('last_name', sa.String(100), nullable=False),
        sa.Column('hire_date', sa.Date(), nullable=False),
        sa.Column('status', sa.Enum('active', 'inactive', 'on_leave', name='employeestatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index('ix_employees_id', 'employees', ['id'])

    # === SCHEDULES TABLE ===
    op.create_table(
        'schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('week_start_date', sa.Date(), nullable=False),
        sa.Column('status', sa.Enum('draft', 'published', 'archived', name='schedulestatus'), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_schedules_id', 'schedules', ['id'])

    # === SHIFTS TABLE ===
    op.create_table(
        'shifts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('schedule_id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('break_minutes', sa.Integer(), default=30, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['schedule_id'], ['schedules.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_shifts_id', 'shifts', ['id'])

    # === AVAILABILITY TABLE ===
    op.create_table(
        'availability',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('is_available', sa.Boolean(), default=True, nullable=True),
        sa.Column('preferred_start', sa.Time(), nullable=True),
        sa.Column('preferred_end', sa.Time(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_availability_id', 'availability', ['id'])

    # === TIME OFF REQUESTS TABLE ===
    op.create_table(
        'time_off_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.String(500), nullable=True),
        sa.Column('status', sa.Enum('pending', 'approved', 'denied', 'cancelled', name='timeoffstatus'), nullable=False),
        sa.Column('approved_by', sa.Integer(), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_time_off_requests_id', 'time_off_requests', ['id'])

    # === SHIFT SWAPS TABLE ===
    op.create_table(
        'shift_swaps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('requester_shift_id', sa.Integer(), nullable=False),
        sa.Column('requested_shift_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.String(500), nullable=True),
        sa.Column('status', sa.Enum('pending', 'accepted', 'approved', 'denied', 'cancelled', name='swapstatus'), nullable=False),
        sa.Column('approved_by', sa.Integer(), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['requester_shift_id'], ['shifts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requested_shift_id'], ['shifts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_shift_swaps_id', 'shift_swaps', ['id'])

    # === NOTIFICATIONS TABLE ===
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('message', sa.String(500), nullable=False),
        sa.Column('type', sa.Enum(
            'schedule_published', 'shift_assigned', 'shift_changed',
            'swap_requested', 'swap_approved', 'swap_denied',
            'time_off_approved', 'time_off_denied',
            'compliance_warning', 'general',
            name='notificationtype'
        ), nullable=False),
        sa.Column('is_read', sa.Boolean(), default=False, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notifications_id', 'notifications', ['id'])

    # === ORDER FORECASTS TABLE ===
    op.create_table(
        'order_forecasts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('hour', sa.Integer(), nullable=False),
        sa.Column('predicted_orders', sa.Float(), nullable=False),
        sa.Column('actual_orders', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_order_forecasts_id', 'order_forecasts', ['id'])

    # === LABOR STANDARDS TABLE ===
    op.create_table(
        'labor_standards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('orders_per_picker_hour', sa.Float(), default=10.0, nullable=False),
        sa.Column('min_shift_hours', sa.Integer(), default=4, nullable=False),
        sa.Column('max_shift_hours', sa.Integer(), default=8, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('store_id')
    )
    op.create_index('ix_labor_standards_id', 'labor_standards', ['id'])

    # === HISTORICAL ORDERS TABLE ===
    op.create_table(
        'historical_orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('hour', sa.Integer(), nullable=False),
        sa.Column('order_count', sa.Float(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=True),
        sa.Column('is_holiday', sa.Integer(), default=0, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_historical_orders_id', 'historical_orders', ['id'])
    op.create_index('ix_historical_orders_store_date', 'historical_orders', ['store_id', 'date'])
    op.create_index('ix_historical_orders_store_dow_hour', 'historical_orders', ['store_id', 'day_of_week', 'hour'])


def downgrade() -> None:
    # Drop tables in reverse order of creation (respecting foreign keys)
    op.drop_index('ix_historical_orders_store_dow_hour', 'historical_orders')
    op.drop_index('ix_historical_orders_store_date', 'historical_orders')
    op.drop_index('ix_historical_orders_id', 'historical_orders')
    op.drop_table('historical_orders')

    op.drop_index('ix_labor_standards_id', 'labor_standards')
    op.drop_table('labor_standards')

    op.drop_index('ix_order_forecasts_id', 'order_forecasts')
    op.drop_table('order_forecasts')

    op.drop_index('ix_notifications_id', 'notifications')
    op.drop_table('notifications')

    op.drop_index('ix_shift_swaps_id', 'shift_swaps')
    op.drop_table('shift_swaps')

    op.drop_index('ix_time_off_requests_id', 'time_off_requests')
    op.drop_table('time_off_requests')

    op.drop_index('ix_availability_id', 'availability')
    op.drop_table('availability')

    op.drop_index('ix_shifts_id', 'shifts')
    op.drop_table('shifts')

    op.drop_index('ix_schedules_id', 'schedules')
    op.drop_table('schedules')

    op.drop_index('ix_employees_id', 'employees')
    op.drop_table('employees')

    op.drop_index('ix_stores_code', 'stores')
    op.drop_index('ix_stores_id', 'stores')
    op.drop_table('stores')

    op.drop_index('ix_users_email', 'users')
    op.drop_index('ix_users_id', 'users')
    op.drop_table('users')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS notificationtype')
    op.execute('DROP TYPE IF EXISTS swapstatus')
    op.execute('DROP TYPE IF EXISTS timeoffstatus')
    op.execute('DROP TYPE IF EXISTS schedulestatus')
    op.execute('DROP TYPE IF EXISTS employeestatus')
    op.execute('DROP TYPE IF EXISTS userrole')
