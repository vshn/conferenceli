import os
import logging
import xmlrpc.client

from flask import Flask, render_template, request, jsonify, flash, redirect, url_for
from flask_wtf import FlaskForm, CSRFProtect
from flask_bootstrap import Bootstrap5
from wtforms.validators import DataRequired, Email
from wtforms.fields import *

from dotenv import load_dotenv

# Load configuration
load_dotenv()
FLASK_APP_SECRET_KEY = os.getenv("FLASK_APP_SECRET_KEY")
ODOO_URL = os.getenv("ODOO_URL")
ODOO_DB = os.getenv("ODOO_DB")
ODOO_USERNAME = os.getenv("ODOO_USERNAME")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")
ODOO_TAG_ID = int(os.getenv("ODOO_TAG_ID"))

app = Flask(__name__)
app.secret_key = FLASK_APP_SECRET_KEY
csrf = CSRFProtect(app)
bootstrap = Bootstrap5(app)


logging.basicConfig(level=logging.DEBUG)

# Authenticate with Odoo
common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")


def odoo_countries():
    # Load countries from Odoo for selection
    odoo_countries = models.execute_kw(
        ODOO_DB,
        uid,
        ODOO_PASSWORD,
        "res.country",
        "search_read",
        [[("id", "!=", 0)]],
        {"fields": ["id", "name"], "order": "name"},
    )

    preferred_countries = ["Switzerland", "Germany", "Austria", "France", "Italy"]

    # Convert the result to a list of tuples
    countries = [(str(item["id"]), item["name"]) for item in odoo_countries]

    # Separate preferred and other countries
    preferred = [(cid, name) for cid, name in countries if name in preferred_countries]
    others = [(cid, name) for cid, name in countries if name not in preferred_countries]

    # Sort the preferred countries by the order in preferred_countries list
    preferred_sorted = sorted(preferred, key=lambda x: preferred_countries.index(x[1]))

    # Sort the other countries alphabetically by name
    others_sorted = sorted(others, key=lambda x: x[1])

    # Combine the preferred and other countries
    sorted_countries = preferred_sorted + others_sorted

    return sorted_countries


class LeadForm(FlaskForm):
    name = StringField("Name", validators=[DataRequired()])
    email = EmailField("E-Mail", validators=[DataRequired(), Email()])
    company = StringField("Company")
    job_position = StringField("Job Position")
    phone = TelField()
    # TODO visually separate preffered countries from others
    # TODO make the field searchable
    country = SelectField("Country", choices=odoo_countries())
    submit = SubmitField()


@app.route("/", methods=["GET", "POST"])
def index():
    form = LeadForm()

    if form.validate_on_submit():
        # Create a new lead in Odoo
        # TODO add campaign and source - configurable - lookup IDs before
        lead_id = models.execute_kw(
            ODOO_DB,
            uid,
            ODOO_PASSWORD,
            "crm.lead",
            "create",
            [
                {
                    "name": f"Event Lead: {form.name.data}",
                    "contact_name": form.name.data,
                    "email_from": form.email.data,
                    "function": form.job_position.data,
                    "partner_name": form.company.data,
                    "country_id": form.country.data,
                    "phone": form.phone.data,
                    "tag_ids": [(4, ODOO_TAG_ID)],
                }
            ],
        )
        logging.debug(f"Created Lead ID: {lead_id}")
        flash("Thanks for submitting")
        return redirect(url_for("index"))

    return render_template(
        "form.html",
        form=form,
    )


if __name__ == "__main__":
    app.run(debug=True)
