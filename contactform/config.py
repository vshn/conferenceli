import os
import logging
import json
from dotenv import load_dotenv
from odoo_client import OdooClient


class ConfigError(Exception):
    pass


class Config:
    def __init__(self):
        load_dotenv()
        self.FLASK_APP_SECRET_KEY = self.get_env_var("FLASK_APP_SECRET_KEY")
        self.LOG_LEVEL = self.get_env_var("LOG_LEVEL", "INFO").upper()
        self.PRINTER_IP = self.get_env_var("PRINTER_IP")
        self.ODOO_URL = self.get_env_var("ODOO_URL")
        self.ODOO_DB = self.get_env_var("ODOO_DB")
        self.ODOO_USERNAME = self.get_env_var("ODOO_USERNAME")
        self.ODOO_PASSWORD = self.get_env_var("ODOO_PASSWORD")
        self.TAG_NAME = self.get_env_var("TAG_NAME")
        self.CAMPAIGN_NAME = self.get_env_var("CAMPAIGN_NAME")
        self.SOURCE_NAME = self.get_env_var("SOURCE_NAME")
        self.CSV_FILE_PATH = self.get_env_var("CSV_FILE_PATH")
        self.LABEL_HEADER = self.get_env_var("LABEL_HEADER", "Welcome")
        self.PRINTING_ENABLED = (
            self.get_env_var("PRINTING_ENABLED", "true").lower() == "true"
        )
        self.ODOO_CREATELEAD_ENABLED = (
            self.get_env_var("ODOO_CREATELEAD_ENABLED", "true").lower() == "true"
        )
        self.CONFIG_FILE_PATH = self.get_env_var("CONFIG_FILE_PATH", "config.json")
        self.BASIC_AUTH_USERNAME = self.get_env_var("BASIC_AUTH_USERNAME")
        self.BASIC_AUTH_PASSWORD = self.get_env_var("BASIC_AUTH_PASSWORD")
        self.LABEL_FONT_FAMILY = self.get_env_var("LABEL_FONT_FAMILY", "DejaVu Sans")
        self.LABEL_FONT_STYLE = self.get_env_var("LABEL_FONT_STYLE", "Book")
        self.APPUIO_SIGNUP_URL = self.get_env_var(
            "APPUIO_SIGNUP_URL", "https://www.appuio.ch/sign-up"
        )
        self.TAG_ID = None
        self.CAMPAIGN_ID = None
        self.SOURCE_ID = None
        self.load_config_file()

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

    def load_config_file(self):
        if os.path.exists(self.CONFIG_FILE_PATH):
            with open(self.CONFIG_FILE_PATH, "r") as file:
                config_data = json.load(file)
                self.CAMPAIGN_NAME = config_data.get(
                    "CAMPAIGN_NAME", self.CAMPAIGN_NAME
                )
                self.LABEL_HEADER = config_data.get("LABEL_HEADER", self.LABEL_HEADER)
                self.PRINTING_ENABLED = config_data.get(
                    "PRINTING_ENABLED", self.PRINTING_ENABLED
                )
                self.ODOO_CREATELEAD_ENABLED = config_data.get(
                    "ODOO_CREATELEAD_ENABLED", self.ODOO_CREATELEAD_ENABLED
                )


def save_config(config):
    config_data = {
        "CAMPAIGN_NAME": config.CAMPAIGN_NAME,
        "PRINTING_ENABLED": config.PRINTING_ENABLED,
        "ODOO_CREATELEAD_ENABLED": config.ODOO_CREATELEAD_ENABLED,
        "LABEL_HEADER": config.LABEL_HEADER,
    }
    with open(config.CONFIG_FILE_PATH, "w") as file:
        json.dump(config_data, file, indent=4)


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
