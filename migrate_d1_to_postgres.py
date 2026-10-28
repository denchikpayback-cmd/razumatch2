"""Migrate the local D1 SQLite data to PostgreSQL.

Requires pip install 'psycopg[binary]'. Set DATABASE_URL and SQLITE_PATH.
The target schema must be created first. Use on an empty PostgreSQL database.
Do not run against production without backups.
"""
import os
import sqlite3
from pathlib import Path
import psycopg
from psycopg import sql

TABLES = [
    'users', 'credentials', 'sessions', 'auth_rate_limits', 'settings',
    'likes', 'messages', 'uploads', 'blocks', 'tickets', 'ticket_messages',
    'reports', 'privacy_preferences', 'privacy_events', 'export_audit', 'admin_chat_audit',
]

src_path = Path(os.environ['SQLITE_PATH'])
if not src_path.is_file():
    raise SystemExit(f'Not a file: {src_path}')
url = os.environ['DATABASE_URL']
with sqlite3.connect(f'file:{src_path.resolve()}?mode=ro', uri=True) as source:
    source.row_factory = sqlite3.Row
    with psycopg.connect(url) as destination:
        # One transaction: failures roll back all inserted data.
        with destination.transaction():
            for table in TABLES:
                cols = [row['name'] for row in source.execute(f'PRAGMA table_info("{table}")')]
                if not cols:
                    print('Missing source table (skipped):', table)
                    continue
                records = source.execute(f'SELECT * FROM "{table}"').fetchall()
                if not records:
                    print(table, 0)
                    continue
                query = sql.SQL('INSERT INTO {} ({}) VALUES ({})').format(
                    sql.Identifier(table),
                    sql.SQL(', ').join(map(sql.Identifier, cols)),
                    sql.SQL(', ').join(sql.Placeholder() for _ in cols),
                )
                with destination.cursor() as cur:
                    cur.executemany(query, [tuple(row[col] for col in cols) for row in records])
                print(table, len(records))
print('Data copied. Important: this does NOT migrate the API or media objects.')
