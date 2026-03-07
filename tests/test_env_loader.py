import os
import tempfile
import unittest
from pathlib import Path

from env_loader import load_project_env


class LoadProjectEnvTests(unittest.TestCase):
    def setUp(self):
        self.target_keys = ("DISCORD_TOKEN", "PAYPAL_EMAIL", "PAYPAL_PASSWORD")
        self.original_values = {key: os.environ.get(key) for key in self.target_keys}
        for key in self.target_keys:
            os.environ.pop(key, None)

    def tearDown(self):
        for key in self.target_keys:
            os.environ.pop(key, None)

        for key, value in self.original_values.items():
            if value is not None:
                os.environ[key] = value

    def test_loads_variables_from_dotenv_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env"
            env_path.write_text(
                "DISCORD_TOKEN=test-token\n"
                "PAYPAL_EMAIL=test@example.com\n"
                "PAYPAL_PASSWORD=test-password\n",
                encoding="utf-8",
            )

            loaded = load_project_env(Path(temp_dir))

            self.assertTrue(loaded)
            self.assertEqual(os.environ.get("DISCORD_TOKEN"), "test-token")
            self.assertEqual(os.environ.get("PAYPAL_EMAIL"), "test@example.com")
            self.assertEqual(os.environ.get("PAYPAL_PASSWORD"), "test-password")

    def test_does_not_override_existing_environment_variables(self):
        os.environ["DISCORD_TOKEN"] = "already-set-token"

        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env"
            env_path.write_text("DISCORD_TOKEN=dotenv-token\n", encoding="utf-8")

            loaded = load_project_env(Path(temp_dir))

            self.assertTrue(loaded)
            self.assertEqual(os.environ.get("DISCORD_TOKEN"), "already-set-token")


if __name__ == "__main__":
    unittest.main()
