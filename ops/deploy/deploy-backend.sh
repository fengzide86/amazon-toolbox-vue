#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE_PATH="${1:?archive path is required}"
EXPECTED_VERSION="${2:?expected version is required}"
APP_ROOT="/opt/amazon-toolbox"
BACKEND_DIR="${APP_ROOT}/backend"
UPDATE_ROOT="/var/lib/amazon-toolbox"
PUBLIC_UPDATES_DIR="${UPDATE_ROOT}/updates"
UPDATE_STAGING_DIR="${UPDATE_ROOT}/.updates-staging"
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
      --exclude='/.env' \
      --exclude='/updates/' \
      --exclude='/.updates-staging/' \
      --exclude='/chroma_db/' \
      --exclude='/runtime/' \
      --exclude='/uploads/' \
      --exclude='/logs/' \
      --exclude='/.venv/' \
      --exclude='__pycache__/' \
      "${BACKUP_DIR}/backend/" "${BACKEND_DIR}/"
    cp -a "${BACKUP_DIR}/package.json" "${APP_ROOT}/package.json"
    restore_file "${BACKUP_DIR}/nginx-amazon-toolbox" "/etc/nginx/sites-enabled/amazon-toolbox"
    restore_file "${BACKUP_DIR}/nginx-toolbox-observability.conf" "/etc/nginx/conf.d/toolbox-observability.conf"
    restore_file "${BACKUP_DIR}/toolbox-backend.service" "/etc/systemd/system/toolbox-backend.service"
    systemctl daemon-reload || true
    nginx -t && systemctl reload nginx || true
    systemctl start toolbox-backend || true
  fi
  cleanup
  exit "${exit_code}"
}

trap rollback ERR
trap cleanup EXIT
umask 077

require_free_space() {
  local label="$1"
  local path="$2"
  local required_bytes="$3"
  local available_bytes
  available_bytes="$(df -PB1 "${path}" | awk 'NR == 2 {print $4}')"
  if [[ ! "${available_bytes}" =~ ^[0-9]+$ ]]; then
    echo "Unable to determine free space for ${label}: ${path}" >&2
    exit 1
  fi
  if (( available_bytes < required_bytes )); then
    echo "Insufficient disk space for ${label}: required=${required_bytes}, available=${available_bytes}, path=${path}" >&2
    exit 1
  fi
}

mkdir -p "${BACKUP_ROOT}"
ARCHIVE_METRICS="$(python3 - "${ARCHIVE_PATH}" <<'PY'
import sys
import tarfile
from pathlib import Path, PurePosixPath

archive = Path(sys.argv[1]).resolve(strict=True)
if not archive.is_file():
    raise RuntimeError(f"deployment archive is not a file: {archive}")

unpacked_bytes = 0
with tarfile.open(archive, "r:gz") as package:
    for member in package.getmembers():
        member_path = PurePosixPath(member.name)
        if member_path.is_absolute() or ".." in member_path.parts:
            raise RuntimeError(f"unsafe deployment archive member: {member.name}")
        if member.issym() or member.islnk():
            raise RuntimeError(f"deployment archive links are not allowed: {member.name}")
        unpacked_bytes += max(member.size, 0)

print(archive.stat().st_size, unpacked_bytes)
PY
)"
read -r ARCHIVE_BYTES UNPACKED_BYTES <<<"${ARCHIVE_METRICS}"
CURRENT_BACKEND_BYTES="$(du -sb "${BACKEND_DIR}" | awk '{print $1}')"
DB_BACKUP_RESERVE_BYTES="${DEPLOY_DB_BACKUP_RESERVE_BYTES:-1073741824}"
for value in "${ARCHIVE_BYTES}" "${UNPACKED_BYTES}" "${CURRENT_BACKEND_BYTES}" "${DB_BACKUP_RESERVE_BYTES}"; do
  [[ "${value}" =~ ^[0-9]+$ ]] || { echo "Invalid deployment size metric: ${value}" >&2; exit 1; }
done

# /opt needs room for the code/database backup plus rsync temporary files.
# /tmp needs the archive's full uncompressed size plus extraction overhead.
BACKUP_REQUIRED_BYTES=$((CURRENT_BACKEND_BYTES + ARCHIVE_BYTES + DB_BACKUP_RESERVE_BYTES + 268435456))
STAGING_REQUIRED_BYTES=$((UNPACKED_BYTES + UNPACKED_BYTES / 4 + 134217728))
if [[ "$(stat -c %d "${BACKUP_ROOT}")" == "$(stat -c %d "${STAGING_DIR}")" ]]; then
  require_free_space "backup and archive extraction" "${BACKUP_ROOT}" "$((BACKUP_REQUIRED_BYTES + STAGING_REQUIRED_BYTES))"
else
  require_free_space "deployment backup" "${BACKUP_ROOT}" "${BACKUP_REQUIRED_BYTES}"
  require_free_space "archive extraction" "${STAGING_DIR}" "${STAGING_REQUIRED_BYTES}"
fi

mkdir -p "${BACKUP_DIR}/backend"
rsync -a \
  --exclude='/.env' \
  --exclude='/updates/' \
  --exclude='/.updates-staging/' \
  --exclude='/chroma_db/' \
  --exclude='/runtime/' \
  --exclude='/uploads/' \
  --exclude='/logs/' \
  --exclude='/.venv/' \
  --exclude='__pycache__/' \
  "${BACKEND_DIR}/" "${BACKUP_DIR}/backend/"
cp -a "${APP_ROOT}/package.json" "${BACKUP_DIR}/package.json"
cp -a "${BACKEND_DIR}/.env" "${BACKUP_DIR}/backend.env"

for pair in \
  "/etc/nginx/sites-enabled/amazon-toolbox:${BACKUP_DIR}/nginx-amazon-toolbox" \
  "/etc/nginx/conf.d/toolbox-observability.conf:${BACKUP_DIR}/nginx-toolbox-observability.conf" \
  "/etc/systemd/system/toolbox-backend.service:${BACKUP_DIR}/toolbox-backend.service"
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
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from dotenv import dotenv_values

env_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
config = dotenv_values(env_path)
required = ("MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE")
missing = [key for key in required if not config.get(key)]
if missing:
    raise RuntimeError(f"database backup configuration missing: {', '.join(missing)}")

def quote_option(value: object) -> str:
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '"'

defaults_path = None
try:
    with tempfile.NamedTemporaryFile("w", prefix="toolbox-mysqldump-", suffix=".cnf", delete=False) as defaults:
        defaults_path = defaults.name
        defaults.write("[client]\n")
        for key, option in (("MYSQL_HOST", "host"), ("MYSQL_PORT", "port"), ("MYSQL_USER", "user"), ("MYSQL_PASSWORD", "password")):
            defaults.write(f"{option}={quote_option(config[key])}\n")
    os.chmod(defaults_path, 0o600)
    command = [
        "mysqldump",
        f"--defaults-extra-file={defaults_path}",
        "--single-transaction",
        "--quick",
        "--skip-lock-tables",
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
finally:
    if defaults_path:
        Path(defaults_path).unlink(missing_ok=True)
PY

tar -xzf "${ARCHIVE_PATH}" -C "${STAGING_DIR}"
test -f "${STAGING_DIR}/backend/main.py"
test -f "${STAGING_DIR}/package.json"
test -f "${STAGING_DIR}/ops/nginx/amazon-toolbox.conf"
test -f "${STAGING_DIR}/ops/systemd/toolbox-backend.service"
test -f "${STAGING_DIR}/backend/requirements.txt"
test -f "${STAGING_DIR}/backend/alembic.ini"

DEPLOY_STARTED=1
systemctl stop toolbox-backend
rsync -a --delete \
  --exclude='/.env' \
  --exclude='/updates/' \
  --exclude='/.updates-staging/' \
  --exclude='/chroma_db/' \
  --exclude='/runtime/' \
  --exclude='/uploads/' \
  --exclude='/logs/' \
  --exclude='/.venv/' \
  --exclude='__pycache__/' \
  --exclude='/tests/' \
  "${STAGING_DIR}/backend/" "${BACKEND_DIR}/"
cp -a "${STAGING_DIR}/package.json" "${APP_ROOT}/package.json"
chown -R toolbox:toolbox "${BACKEND_DIR}"
chmod 600 "${BACKEND_DIR}/.env"

# Keep public update artifacts outside the private application tree. Nginx can
# traverse/read only this release directory; the staging area stays private to
# the non-root backend service.
install -d -o toolbox -g www-data -m 0710 "${UPDATE_ROOT}"
install -d -o toolbox -g www-data -m 2750 "${PUBLIC_UPDATES_DIR}"
install -d -o toolbox -g toolbox -m 2700 "${UPDATE_STAGING_DIR}"
if [[ -d "${BACKEND_DIR}/.updates-staging" ]] \
  && ! find "${UPDATE_STAGING_DIR}" -mindepth 2 -maxdepth 2 -name stage.json -print -quit \
    | grep -q .; then
  rsync -a --exclude='.release.lock' \
    "${BACKEND_DIR}/.updates-staging/" "${UPDATE_STAGING_DIR}/"
fi
if [[ ! -f "${PUBLIC_UPDATES_DIR}/latest.yml" && -d "${BACKEND_DIR}/updates" ]]; then
  rsync -a \
    --include='*.exe' \
    --include='*.blockmap' \
    --include='latest.yml' \
    --exclude='*' \
    "${BACKEND_DIR}/updates/" "${PUBLIC_UPDATES_DIR}/"
fi
chown -R toolbox:www-data "${PUBLIC_UPDATES_DIR}"
find "${PUBLIC_UPDATES_DIR}" -type d -exec chmod 2750 {} +
find "${PUBLIC_UPDATES_DIR}" -type f -exec chmod 0640 {} +
chown -R toolbox:toolbox "${UPDATE_STAGING_DIR}"
chmod 2700 "${UPDATE_STAGING_DIR}"

VENV_PYTHON="${BACKEND_DIR}/.venv/bin/python"
if [[ ! -x "${VENV_PYTHON}" ]]; then
  python3 -m venv "${BACKEND_DIR}/.venv"
  chown -R toolbox:toolbox "${BACKEND_DIR}/.venv"
fi
test -x "${VENV_PYTHON}"
runuser -u toolbox -- "${VENV_PYTHON}" -m pip install --disable-pip-version-check -r "${BACKEND_DIR}/requirements.txt"
runuser -u toolbox -- "${VENV_PYTHON}" -m pip check
(
  cd "${BACKEND_DIR}"
  runuser -u toolbox -- "${VENV_PYTHON}" -m alembic upgrade head
)

install -m 0644 "${STAGING_DIR}/ops/nginx/toolbox-observability.conf" \
  /etc/nginx/conf.d/toolbox-observability.conf
install -m 0644 "${STAGING_DIR}/ops/nginx/amazon-toolbox.conf" \
  /etc/nginx/sites-enabled/amazon-toolbox
install -m 0644 "${STAGING_DIR}/ops/systemd/toolbox-backend.service" \
  /etc/systemd/system/toolbox-backend.service
systemctl daemon-reload
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
if [[ -f "${PUBLIC_UPDATES_DIR}/latest.yml" ]]; then
  for _ in $(seq 1 10); do
    if curl -fsS "https://8.130.113.104/updates/latest.yml" >/dev/null; then
      break
    fi
    sleep 1
  done
  curl -fsS "https://8.130.113.104/updates/latest.yml" >/dev/null
fi

DEPLOY_STARTED=0
rm -f "${ARCHIVE_PATH}"
echo "deployment_version=${EXPECTED_VERSION}"
echo "backup_dir=${BACKUP_DIR}"
