#!/bin/sh
# racha-backup.sh - consistent backup of the Racha SQLite DB + avatars.
#
# Takes a WAL-safe snapshot with `sqlite3 .backup` (safe to run while the app is
# live), verifies it with PRAGMA integrity_check, then bundles the snapshot
# together with the avatars/ folder into a timestamped, rotated tarball.
#
# Config (all optional env vars):
#   RACHA_DIR         stack dir that contains data/  (default: the repo root,
#                     i.e. the parent of this script's directory)
#   RACHA_BACKUP_DIR  where archives are written     (default: $RACHA_DIR/backups)
#   RACHA_KEEP        how many archives to keep       (default: 30)
#
# Example nightly root cron (03:17):
#   17 3 * * * root RACHA_DIR=/srv/racha /usr/local/bin/racha-backup.sh
#
# Restore: stop the app, extract an archive, copy racha.db back over data/
# (remove the stale -wal/-shm first), restore avatars/, then start the app.
set -eu

RACHA_DIR="${RACHA_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DATA="$RACHA_DIR/data"
BK="${RACHA_BACKUP_DIR:-$RACHA_DIR/backups}"
KEEP="${RACHA_KEEP:-30}"
TS=$(date +%Y%m%d-%H%M%S)
LOG="$BK/backup.log"

mkdir -p "$BK"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1) consistent snapshot (WAL-safe; fine while the app holds the DB open)
sqlite3 "$DATA/racha.db" ".backup '$TMP/racha.db'"

# 2) integrity check - abort without touching the archive set if not "ok"
CHK=$(sqlite3 "$TMP/racha.db" 'PRAGMA integrity_check;' | head -1)
if [ "$CHK" != "ok" ]; then
  echo "$TS FAIL integrity_check=$CHK" >> "$LOG"
  exit 1
fi

# 3) bundle snapshot + avatars into one self-contained archive
if [ -d "$DATA/avatars" ]; then
  tar czf "$BK/racha-$TS.tgz" -C "$TMP" racha.db -C "$DATA" avatars
else
  tar czf "$BK/racha-$TS.tgz" -C "$TMP" racha.db
fi

# 4) rotate: keep only the newest $KEEP archives.
# The latest.tgz pointer is named without the "racha-" prefix on purpose, so
# this glob never counts or deletes it.
ls -1t "$BK"/racha-*.tgz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

# 5) refresh a "latest" pointer + log
ln -sf "racha-$TS.tgz" "$BK/latest.tgz"
SZ=$(du -h "$BK/racha-$TS.tgz" | cut -f1)
N=$(ls -1 "$BK"/racha-*.tgz 2>/dev/null | wc -l)
echo "$TS OK size=$SZ kept=$N" >> "$LOG"
