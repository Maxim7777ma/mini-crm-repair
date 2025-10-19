"""timestamps -> timestamptz

Revision ID: da50ff78e6b0
Revises: 665708c35586
Create Date: 2025-10-18 11:35:27.220810

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "da50ff78e6b0"
down_revision = '665708c35586'
branch_labels = None
depends_on = None

def upgrade():
    # users.created_at
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='created_at'
          AND data_type='timestamp without time zone'
      ) THEN
        ALTER TABLE users
          ALTER COLUMN created_at TYPE timestamptz
          USING (created_at AT TIME ZONE 'UTC');
      END IF;
    END $$;
    """)

    # tickets.created_at
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tickets' AND column_name='created_at'
          AND data_type='timestamp without time zone'
      ) THEN
        ALTER TABLE tickets
          ALTER COLUMN created_at TYPE timestamptz
          USING (created_at AT TIME ZONE 'UTC');
      END IF;
    END $$;
    """)

    # tickets.updated_at
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tickets' AND column_name='updated_at'
          AND data_type='timestamp without time zone'
      ) THEN
        ALTER TABLE tickets
          ALTER COLUMN updated_at TYPE timestamptz
          USING (updated_at AT TIME ZONE 'UTC');
      END IF;
    END $$;
    """)

    # tickets.scheduled_at (nullable)
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tickets' AND column_name='scheduled_at'
          AND data_type='timestamp without time zone'
      ) THEN
        ALTER TABLE tickets
          ALTER COLUMN scheduled_at TYPE timestamptz
          USING (scheduled_at AT TIME ZONE 'UTC');
      END IF;
    END $$;
    """)

    # на будущее: убедимся, что default now() остаётся
    op.execute("ALTER TABLE tickets ALTER COLUMN created_at SET DEFAULT now();")
    op.execute("ALTER TABLE tickets ALTER COLUMN updated_at SET DEFAULT now();")
    op.execute("ALTER TABLE users   ALTER COLUMN created_at SET DEFAULT now();")


def downgrade():
    # Возврат к timestamp without time zone (если вдруг понадобится)
    op.execute("""
    ALTER TABLE tickets
      ALTER COLUMN created_at  TYPE timestamp WITHOUT time zone USING (created_at  AT TIME ZONE 'UTC'),
      ALTER COLUMN updated_at  TYPE timestamp WITHOUT time zone USING (updated_at  AT TIME ZONE 'UTC');
    """)
    op.execute("""
    ALTER TABLE users
      ALTER COLUMN created_at  TYPE timestamp WITHOUT time zone USING (created_at  AT TIME ZONE 'UTC');
    """)
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tickets' AND column_name='scheduled_at'
      ) THEN
        ALTER TABLE tickets
          ALTER COLUMN scheduled_at TYPE timestamp WITHOUT time zone
          USING (scheduled_at AT TIME ZONE 'UTC');
      END IF;
    END $$;
    """)