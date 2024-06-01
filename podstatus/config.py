import os
import logging
from dotenv import load_dotenv


class ConfigError(Exception):
    pass


class Config:
    def __init__(self):
        load_dotenv()
        self.FLASK_APP_SECRET_KEY = self.get_env_var("FLASK_APP_SECRET_KEY")
        self.LOG_LEVEL = self.get_env_var("LOG_LEVEL", "INFO").upper()
        self.KUBECONFIG = os.getenv("KUBECONFIG", None)
        self.K8S_NAMESPACE = self.get_env_var("K8S_NAMESPACE")

    def get_env_var(self, name, default=None):
        value = os.getenv(name, default)
        if value is None:
            raise ConfigError(f"Environment variable {name} is required but not set.")
        return value.replace('"', "")

    def get_env_int_var(self, name, default=None):
        value = self.get_env_var(name, default)
        try:
            return int(value)
        except ValueError:
            raise ConfigError(f"Environment variable {name} must be an integer.")


# Set up logging
def setup_logging(log_level):
    logging.basicConfig(
        level=logging.getLevelName(log_level),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


# Initialize configuration
config = Config()
setup_logging(config.LOG_LEVEL)
