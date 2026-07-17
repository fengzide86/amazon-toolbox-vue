#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE_PATH="${1:?archive path is required}"
EXPECTED_VERSION="${2:?expected version is required}"
APP_ROOT="/opt/amazon-toolbox"
BACKEND_DIR="${APP_ROOT}/backend"
BACKUP_ROOT="${APP_ROOT}/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/pre-${EXPECTED_VERSION}-${STAMP}"
STAGING_DIR="$(mktemp -d /tmp/toolbox-deploy.XXXXXX)"
DEPLOY_STARTED=0

cleanup() {
  rm -rf "${STAGING_DIR}"
}

restore_file() {
  local backup_file="$1"
  local target_file="$2"
  local missing_marker="${backup_file}.missing"
  if [[ -f "${missing_marker}" ]]; then
    rm -f "${target_file}"
  elif [[ -f "${backup_file}" ]]; then
    cp -a "${backup_file}" "${target_file}"
  fi
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ "${DEPLOY_STARTED}" -eq 1 ]]; then
    echo "Deployment failed; restoring ${BACKUP_DIR}" >&2
    systemctl stop toolbox-backend || true
    rsync -a --delete \
      --exclude='.env' \
      --exclude='updates/' \
      --exclude='chroma_db/' \
      --exclude='runtime/' \
      --exclude='.venv/' \
      --exclude='__pycache__/' \
      "${BACKUP_DIR}/backend/" "${BACKEND_DIR}/"
    cp -a "${BACKUP_DIR}/package.json" "${APP_ROOT}/package.json"
    restore_file "${BACKUP_DIR}/nginx-amazon-toolbox" "/etc/nginx/sites-enabled/amazon-toolbox"
    restore_file "${BACKUP_DIR}/nginx-toolbox-observability.conf" "/etc/nginx/conf.d/toolbox-observability.conf"
    nginx -t && systemctl reload nginx || true
    systemctl start toolbox-backend || true
  fi
  cleanup
  exit "${exit_code}"
}

trap rollback ERR
trap cleanup EXIT
umask 077

mkdir -p "${BACKUP_DIR}/backend"
rsync -a \
  --exclude='.env' \
  --exclude='updates/' \
  --exclude='chroma_db/' \
  --exclude='runtime/' \
  --exclude='.venv/' \
  --exclude='__pycache__/' \
  "${BACKEND_DIR}/" "${BACKUP_DIR}/backend/"
cp -a "${APP_ROOT}/package.json" "${BACKUP_DIR}/package.json"
cp -a "${BACKEND_DIR}/.env" "${BACKUP_DIR}/backend.env"

for pair in \
  "/etc/nginx/sites-enabled/amazon-toolbox:${BACKUP_DIR}/nginx-amazon-toolbox" \
  "/etc/nginx/conf.d/toolbox-observability.conf:${BACKUP_DIR}/nginx-toolbox-observability.conf"
do
  source_file="${pair%%:*}"
  backup_file="${pair#*:}"
  if [[ -f "${source_file}" ]]; then
    cp -a "${source_file}" "${backup_file}"
  else
    touch "${backup_file}.missing"
  fi
done

python3 - "${BACKEND_DIR}/.env" "${BACKUP_DIR}/database.sql.gz" <<'PY'
import gzip
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

env_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
config = dotenv_values(env_path)
required = ("MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE")
missing = [key for key in required if not config.get(key)]
if missing:
    raise RuntimeError(f"database backup configuration missing: {', '.join(missing)}")

command = [
    "mysqldump",
    "--single-transaction",
    "--quick",
    "--skip-lock-tables",
    f"--host={config['MYSQL_HOST']}",
    f"--port={config['MYSQL_PORT']}",
    f"--user={config['MYSQL_USER']}",
    f"--password={config['MYSQL_PASSWORD']}",
    str(config["MYSQL_DATABASE"]),
]
process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
assert process.stdout is not None
with gzip.open(output_path, "wb") as compressed:
    while chunk := process.stdout.read(1024 * 1024):
        compressed.write(chunk)
stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
if process.wait() != 0:
    output_path.unlink(missing_ok=True)
    raise RuntimeError(f"database backup failed: {stderr.strip()}")
PY

tar -xzf "${ARCHIVE_PATH}" -C "${STAGING_DIR}"
test -f "${STAGING_DIR}/backend/main.py"
test -f "${STAGING_DIR}/package.json"
test -f "${STAGING_DIR}/ops/nginx/amazon-toolbox.conf"

DEPLOY_STARTED=1
systemctl stop toolbox-backend
rsync -a --delete \
  --exclude='.env' \
  --exclude='updates/' \
  --exclude='chroma_db/' \
  --exclude='runtime/' \
  --exclude='.venv/' \
  --exclude='__pycache__/' \
  --exclude='tests/' \
  "${STAGING_DIR}/backend/" "${BACKEND_DIR}/"
cp -a "${STAGING_DIR}/package.json" "${APP_ROOT}/package.json"
chown -R toolbox:toolbox "${BACKEND_DIR}"
chmod 600 "${BACKEND_DIR}/.env"

install -m 0644 "${STAGING_DIR}/ops/nginx/toolbox-observability.conf" \
  /etc/nginx/conf.d/toolbox-observability.conf
install -m 0644 "${STAGING_DIR}/ops/nginx/amazon-toolbox.conf" \
  /etc/nginx/sites-enabled/amazon-toolbox
nginx -t

systemctl start toolbox-backend
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/api/health/live \
    | grep -q "\"version\":\"${EXPECTED_VERSION}\""; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8000/api/health/live \
  | grep -q "\"version\":\"${EXPECTED_VERSION}\""
curl -fsS http://127.0.0.1:8000/api/health/ready \
  | grep -q '"status":"ok"'

systemctl reload nginx
curl -fsS "https://8.130.113.104/api/health/live" \
  | grep -q "\"version\":\"${EXPECTED_VERSION}\""

DEPLOY_STARTED=0
rm -f "${ARCHIVE_PATH}"
echo "deployment_version=${EXPECTED_VERSION}"
echo "backup_dir=${BACKUP_DIR}"
