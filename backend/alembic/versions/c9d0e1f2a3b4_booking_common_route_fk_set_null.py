"""bookings.common_route_id FK ON DELETE SET NULL

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-05-31 12:00:00.000000

The default RESTRICT on bookings.common_route_id was blocking admins from
permanently deleting common routes that had ever been used in a booking.
Switch to SET NULL so the delete succeeds and historical bookings stay
intact, just unlinked from the deleted route.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Constraint name is PostgreSQL's default: <table>_<column>_fkey
_FK_NAME = 'bookings_common_route_id_fkey'


def upgrade() -> None:
    op.drop_constraint(_FK_NAME, 'bookings', type_='foreignkey')
    op.create_foreign_key(
        _FK_NAME, 'bookings', 'common_routes',
        ['common_route_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(_FK_NAME, 'bookings', type_='foreignkey')
    op.create_foreign_key(
        _FK_NAME, 'bookings', 'common_routes',
        ['common_route_id'], ['id'],
    )
