"""プロジェクト直下の .env を安全に読込むユーティリティ。"""

from pathlib import Path

from dotenv import load_dotenv


def get_project_env_path(base_dir: Path | None = None) -> Path:
    """`.env` の探索先パスを返す。"""
    root_dir = Path(base_dir) if base_dir else Path(__file__).resolve().parent
    return root_dir / ".env"


def load_project_env(base_dir: Path | None = None) -> bool:
    """プロジェクト直下の `.env` があれば読込み、存在有無を返す。"""
    env_path = get_project_env_path(base_dir)
    if not env_path.exists():
        return False

    load_dotenv(dotenv_path=env_path, override=False)
    return True
