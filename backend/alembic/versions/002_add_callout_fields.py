"""Add call-out fields to shifts

Revision ID: 002_callout
Revises: 001_initial
Create Date: 2024-12-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_callout'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create shift status enum
    op.execute("CREATE TYPE shiftstatus AS ENUM ('scheduled', 'called_out', 'covered', 'no_show')")

    # Add new columns to shifts table
    op.add_column('shifts', sa.Column('status', sa.Enum('scheduled', 'called_out', 'covered', 'no_show', name='shiftstatus'), server_default='scheduled', nullable=False))
    op.add_column('shifts', sa.Column('callout_reason', sa.String(500), nullable=True))
    op.add_column('shifts', sa.Column('callout_time', sa.DateTime(timezone=True), nullable=True))
    op.add_column('shifts', sa.Column('original_employee_id', sa.Integer(), nullable=True))
    op.add_column('shifts', sa.Column('covered_by_id', sa.Integer(), nullable=True))

    # Add foreign key for covered_by
    op.create_foreign_key(
        'fk_shifts_covered_by',
        'shifts', 'employees',
        ['covered_by_id'], ['id'],
        ondelete='SET NULL'
    )

    # Add foreign key for original_employee (for tracking who called out)
    op.create_foreign_key(
        'fk_shifts_original_employee',
        'shifts', 'employees',
        ['original_employee_id'], ['id'],
        ondelete='SET NULL'
    )

    # Create index for finding call-outs
    op.create_index('ix_shifts_status', 'shifts', ['status'])
    op.create_index('ix_shifts_date_status', 'shifts', ['date', 'status'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_shifts_date_status', 'shifts')
    op.drop_index('ix_shifts_status', 'shifts')

    # Drop foreign keys
    op.drop_constraint('fk_shifts_original_employee', 'shifts', type_='foreignkey')
    op.drop_constraint('fk_shifts_covered_by', 'shifts', type_='foreignkey')

    # Drop columns
    op.drop_column('shifts', 'covered_by_id')
    op.drop_column('shifts', 'original_employee_id')
    op.drop_column('shifts', 'callout_time')
    op.drop_column('shifts', 'callout_reason')
    op.drop_column('shifts', 'status')

    # Drop enum
    op.execute('DROP TYPE IF EXISTS shiftstatus')
