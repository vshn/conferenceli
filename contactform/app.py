from flask import Flask, render_template, request, jsonify
import xmlrpc.client
import os
from dotenv import load_dotenv
import logging
from email_validator import validate_email, EmailNotValidError

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Odoo settings
ODOO_URL = os.getenv("ODOO_URL")
ODOO_DB = os.getenv("ODOO_DB")
ODOO_USERNAME = os.getenv("ODOO_USERNAME")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")
ODOO_TAG_ID = int(os.getenv("ODOO_TAG_ID"))

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Authenticate with Odoo
common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")


@app.route("/")
def index():
    # Fetch country data from Odoo
    countries = models.execute_kw(
        ODOO_DB,
        uid,
        ODOO_PASSWORD,
        "res.country",
        "search_read",
        [[("id", "!=", 0)]],
        {"fields": ["id", "name"], "order": "name"},
    )
    # Sort countries for the dropdown
    preferred_countries = ["Switzerland", "Germany", "Austria", "France", "Italy"]
    sorted_countries = sorted(
        countries, key=lambda x: (x["name"] not in preferred_countries, x["name"])
    )

    return render_template(
        "form.html", countries=sorted_countries, preferred_countries=preferred_countries
    )


@app.route("/submit", methods=["POST"])
def submit():
    name = request.form.get("name")
    email = request.form.get("email")
    company = request.form.get("company")
    country_name = request.form.get("country")

    # Validate inputs
    if not name or not email:
        return render_template(
            "modal.html", status="error", message="Name and Email are required"
        )

    try:
        # Validate email
        validate_email(email)
    except EmailNotValidError as e:
        return render_template("modal.html", status="error", message=str(e))

    try:
        # Find the country ID
        country = models.execute_kw(
            ODOO_DB,
            uid,
            ODOO_PASSWORD,
            "res.country",
            "search_read",
            [[("name", "=", country_name)]],
            {"fields": ["id"], "limit": 1},
        )
        if not country:
            raise ValueError(f"Country '{country_name}' not found")

        country_id = country[0]["id"]

        # Create a new lead in Odoo
        lead_id = models.execute_kw(
            ODOO_DB,
            uid,
            ODOO_PASSWORD,
            "crm.lead",
            "create",
            [
                {
                    "name": name,
                    "email_from": email,
                    "partner_name": company,
                    "country_id": country_id,
                    "tag_ids": [(4, ODOO_TAG_ID)],
                }
            ],
        )
        logging.debug(f"Created Lead ID: {lead_id}")

        return render_template(
            "modal.html",
            status="success",
            message="Lead created",
        )
    except Exception as e:
        logging.error(f"Error occurred: {str(e)}")
        return render_template("modal.html", status="error", message=str(e))


if __name__ == "__main__":
    app.run(debug=True)
