import os
import logging
from dotenv import load_dotenv
from odoo_client import OdooClient


class ConfigError(Exception):
    pass


class Config:
    def __init__(self):
        load_dotenv()
        self.FLASK_APP_SECRET_KEY = self.get_env_var("FLASK_APP_SECRET_KEY")
        self.LOG_LEVEL = self.get_env_var("LOG_LEVEL", "INFO").upper()
        self.ODOO_URL = self.get_env_var("ODOO_URL")
        self.ODOO_DB = self.get_env_var("ODOO_DB")
        self.ODOO_USERNAME = self.get_env_var("ODOO_USERNAME")
        self.ODOO_PASSWORD = self.get_env_var("ODOO_PASSWORD")
        self.TAG_NAME = self.get_env_var("TAG_NAME")
        self.CAMPAIGN_NAME = self.get_env_var("CAMPAIGN_NAME")
        self.SOURCE_NAME = self.get_env_var("SOURCE_NAME")
        self.CSV_FILE_PATH = self.get_env_var("CSV_FILE_PATH")
        self.TAG_ID = None
        self.CAMPAIGN_ID = None
        self.SOURCE_ID = None

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

    def lookup_ids(self, odoo_client):
        self.CAMPAIGN_ID = odoo_client.find_id_by_name(
            "utm.campaign", self.CAMPAIGN_NAME
        )
        self.SOURCE_ID = odoo_client.find_id_by_name("utm.source", self.SOURCE_NAME)
        self.TAG_ID = odoo_client.find_id_by_name("crm.tag", self.TAG_NAME)


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
