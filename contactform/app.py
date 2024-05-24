import os
import logging
from flask import Flask, render_template, request, jsonify, flash, redirect, url_for
from flask_wtf import FlaskForm, CSRFProtect
from flask_bootstrap import Bootstrap5
from wtforms.validators import DataRequired, Email
from wtforms.fields import *

from dotenv import load_dotenv
from brother_ql_web.configuration import (
    Configuration,
    ServerConfiguration,
    PrinterConfiguration,
    Font,
    LabelConfiguration,
    WebsiteConfiguration,
)
from brother_ql_web.labels import (
    LabelParameters,
    create_label_image,
    image_to_png_bytes,
    generate_label,
    print_label,
)
from brother_ql.backends.network import BrotherQLBackendNetwork
from odoo_client import OdooClient, load_countries

# Load configuration
load_dotenv()
FLASK_APP_SECRET_KEY = os.getenv("FLASK_APP_SECRET_KEY")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
ODOO_URL = os.getenv("ODOO_URL")
ODOO_DB = os.getenv("ODOO_DB")
ODOO_USERNAME = os.getenv("ODOO_USERNAME")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")
ODOO_TAG_ID = int(os.getenv("ODOO_TAG_ID"))

# Set up logging
logging.basicConfig(
    level=logging.getLevelName(LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = Flask(__name__)
app.secret_key = FLASK_APP_SECRET_KEY
csrf = CSRFProtect(app)
bootstrap = Bootstrap5(app)

# Initialize Odoo client
odoo_client = OdooClient(ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD)

# Configure printer
printer_config = Configuration(
    server=ServerConfiguration,
    printer=PrinterConfiguration(model="QL-820NWB", printer="tcp://192.168.25.140"),
    label=LabelConfiguration(
        default_size="54",
        default_orientation="standard",
        default_font_size=70,
        default_fonts=[
            Font(family="Minion Pro", style="Semibold"),
            Font(family="Linux Libertine", style="Regular"),
            Font(family="DejaVu Serif", style="Book"),
        ],
        default_font=Font(family="DejaVu Serif", style="Book"),
    ),
    website=WebsiteConfiguration,
)


class LeadForm(FlaskForm):
    name = StringField("Name", validators=[DataRequired()])
    email = EmailField("E-Mail", validators=[DataRequired(), Email()])
    company = StringField("Company")
    job_position = StringField("Job Position")
    phone = TelField()
    country = SelectField("Country", choices=load_countries(odoo_client))
    submit = SubmitField()


@app.route("/", methods=["GET", "POST"])
def index():
    form = LeadForm()

    if form.validate_on_submit():
        lead_id = odoo_client.create(
            "crm.lead",
            {
                "name": f"Event Lead: {form.name.data}",
                "contact_name": form.name.data,
                "email_from": form.email.data,
                "function": form.job_position.data,
                "partner_name": form.company.data,
                "country_id": form.country.data,
                "phone": form.phone.data,
                "tag_ids": [(4, ODOO_TAG_ID)],
            },
        )
        logging.debug(f"Created Lead ID: {lead_id}")

        label_text = f"Hello \n{form.name.data}"

        parameters = LabelParameters(
            configuration=printer_config, text=label_text, label_size="54"
        )
        qlr = generate_label(
            parameters=parameters,
            configuration=printer_config,
            save_image_to="sample-out.png" if LOG_LEVEL == "DEBUG" else None,
        )

        print_label(
            parameters=parameters,
            qlr=qlr,
            configuration=printer_config,
            backend_class=BrotherQLBackendNetwork,
        )

        flash("Thanks for submitting")
        return redirect(url_for("index"))

    return render_template(
        "form.html",
        form=form,
    )


if __name__ == "__main__":
    flask_debug = True if LOG_LEVEL == "DEBUG" else False
    app.run(debug=flask_debug)
