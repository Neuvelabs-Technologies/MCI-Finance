#!/usr/bin/env bash
# Back up the database and the uploaded documents from the Docker deployment.
#
#   ./scripts/backup.sh [backup-folder]      default: ./backups
#
# Creates <folder>/<timestamp>/mongo.archive.gz and uploads.tar.gz, and keeps the
# last 14 backups. Run it nightly from cron, then copy the folder off the server:
#   15 2 * * * cd /opt/einvoice && ./scripts/backup.sh /var/backups/einvoice >> /var/log/einvoice-backup.log 2>&1
#
# Restore: see docs/OPERATIONS.md → "Restore from a backup".
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="${1:-./backups}"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$DEST/$STAMP"
KEEP=14

mkdir -p "$OUT"
echo "[backup] $(date -Is) → $OUT"

# Database (consistent dump from the running container)
docker compose exec -T mongo mongodump --archive --gzip --db mci_einvoice > "$OUT/mongo.archive.gz"

# Uploaded documents (read from the named volume through the backend container)
docker compose exec -T backend tar -czf - -C /data uploads > "$OUT/uploads.tar.gz"

# Sanity check: both files exist and aren't empty
for f in mongo.archive.gz uploads.tar.gz; do
  [ -s "$OUT/$f" ] || { echo "[backup] ERROR: $f is empty" >&2; exit 1; }
done
ls -lh "$OUT"

# Keep only the newest $KEEP backups
ls -1dt "$DEST"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf
echo "[backup] done"
