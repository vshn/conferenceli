import csv
import os

from flask import Response, request
from functools import wraps

from config import config


# Function to append data to the CSV file
def append_to_csv(data, file_path):
    file_exists = os.path.isfile(file_path)
    with open(file_path, mode="a", newline="") as csv_file:
        fieldnames = [
            "Opportunity",
            "Contact Name",
            "Email",
            "Job Position",
            "Company Name",
            "Country",
            "Phone",
            "Notes",
            "Tags",
            "Campaign",
            "Source",
            "VoucherCode",
        ]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)

        if not file_exists:
            writer.writeheader()

        writer.writerow(data)


def check_auth(username, password):
    """Check if a username/password combination is valid."""
    return (
        username == config.BASIC_AUTH_USERNAME
        and password == config.BASIC_AUTH_PASSWORD
    )


def authenticate():
    """Sends a 401 response that enables basic auth"""
    return Response(
        "Could not verify your access level for that URL.\n"
        "You have to login with proper credentials",
        401,
        {"WWW-Authenticate": 'Basic realm="Login Required"'},
    )


def requires_auth(f):
    """Decorator to prompt for basic auth"""

    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)

    return decorated
