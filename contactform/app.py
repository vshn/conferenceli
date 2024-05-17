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
MAILING_LIST_ID = int(os.getenv("MAILING_LIST_ID"))

# Configure logging
logging.basicConfig(level=logging.DEBUG)


@app.route("/")
def index():
    return render_template("form.html")


@app.route("/submit", methods=["POST"])
def submit():
    name = request.form.get("name")
    email = request.form.get("email")
    company = request.form.get("company")
    country = request.form.get("country")

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
        # Authenticate with Odoo
        common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
        uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
        logging.debug(f"Authenticated UID: {uid}")

        if not uid:
            raise ValueError("Authentication failed")

        # Create mailing contact in Odoo
        models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")
        contact_id = models.execute_kw(
            ODOO_DB,
            uid,
            ODOO_PASSWORD,
            "mailing.contact",
            "create",
            [
                {
                    "name": name,
                    "email": email,
                    "company_name": company,
                    "country_id": country,
                }
            ],
        )
        logging.debug(f"Created Contact ID: {contact_id}")

        # Add the contact to the mailing list
        models.execute_kw(
            ODOO_DB,
            uid,
            ODOO_PASSWORD,
            "mailing.list",
            "write",
            [[MAILING_LIST_ID], {"contact_ids": [(4, contact_id)]}],
        )
        logging.debug(
            f"Added Contact ID {contact_id} to Mailing List ID {MAILING_LIST_ID}"
        )

        return render_template(
            "modal.html",
            status="success",
            message="Contact created and added to mailing list successfully",
        )
    except Exception as e:
        logging.error(f"Error occurred: {str(e)}")
        return render_template("modal.html", status="error", message=str(e))


if __name__ == "__main__":
    app.run(debug=True)
