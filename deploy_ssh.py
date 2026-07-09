"""Shared, security-conscious SSH configuration for deployment scripts."""

import os

import paramiko

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env.deploy"))
except ImportError:
    pass


def require_env(name: str) -> str:
    """Return a required environment variable or fail with a useful message."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def connect_ssh(host: str, user: str, timeout: int = 15) -> paramiko.SSHClient:
    """Connect using a verified host key and SSH key/agent or an explicit password."""
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())

    options = {
        "hostname": host,
        "username": user,
        "timeout": timeout,
        "allow_agent": True,
        "look_for_keys": True,
    }

    key_file = os.environ.get("DEPLOY_SSH_KEY_FILE", "").strip()
    password = os.environ.get("DEPLOY_SERVER_PASSWORD", "").strip()
    if key_file:
        options["key_filename"] = os.path.expanduser(key_file)
    if password:
        options["password"] = password

    try:
        client.connect(**options)
    except paramiko.BadHostKeyException as exc:
        raise RuntimeError("Server host key changed. Verify the server before deploying.") from exc
    except paramiko.SSHException as exc:
        raise RuntimeError(
            "SSH connection failed. Ensure the server is present in known_hosts and "
            "configure DEPLOY_SSH_KEY_FILE, an SSH agent, or DEPLOY_SERVER_PASSWORD."
        ) from exc

    return client
