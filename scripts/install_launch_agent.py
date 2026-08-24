#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LABEL = "com.local.notion-chess-bridge"


def agent_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def install() -> None:
    path = agent_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "Label": LABEL,
        "ProgramArguments": [str(ROOT / ".venv/bin/python"), "-m", "chess_library.cli", "bridge"],
        "WorkingDirectory": str(ROOT), "RunAtLoad": True, "KeepAlive": True,
        "StandardOutPath": str(ROOT / "build/bridge.log"),
        "StandardErrorPath": str(ROOT / "build/bridge-error.log"),
        "EnvironmentVariables": {"PYTHONPATH": str(ROOT / "src")},
    }
    path.write_bytes(plistlib.dumps(payload))
    os.chmod(path, 0o600)
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}", str(path)], capture_output=True)
    subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(path)], check=True)
    print(f"已安裝並啟動：{path}")


def uninstall() -> None:
    path = agent_path()
    if path.exists():
        subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}", str(path)], capture_output=True)
        path.unlink()
    print("已移除 LaunchAgent；本機密鑰與棋譜資料保留。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("install", "uninstall"))
    args = parser.parse_args()
    install() if args.action == "install" else uninstall()
