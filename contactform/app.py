import logging
from flask import Flask, render_template, request, jsonify, flash, redirect, url_for
from flask_wtf import FlaskForm, CSRFProtect
from flask_bootstrap import Bootstrap5
from wtforms.validators import DataRequired, Email
from wtforms.fields import *

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
from config import config, ConfigError
from utils import append_to_csv

app = Flask(__name__)
app.secret_key = config.FLASK_APP_SECRET_KEY
csrf = CSRFProtect(app)
bootstrap = Bootstrap5(app)

# Basic styling
app.config["BOOTSTRAP_BOOTSWATCH_THEME"] = "sandstone"
app.config["BOOTSTRAP_BTN_SIZE"] = "lg"
app.config["BOOTSTRAP_SERVE_LOCAL"] = True

# Initialize Odoo client and look up campaign and source IDs
odoo_client = OdooClient(
    config.ODOO_URL, config.ODOO_DB, config.ODOO_USERNAME, config.ODOO_PASSWORD
)
try:
    config.lookup_ids(odoo_client)
except ValueError as e:
    logging.error(e)
    exit(1)

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
    name = StringField("Name *", validators=[DataRequired()])
    email = EmailField("E-Mail *", validators=[DataRequired(), Email()])
    company = StringField("Company")
    job_position = StringField("Job Position")
    phone = TelField()
    country = SelectField("Country", choices=load_countries(odoo_client))
    notes = TextAreaField("Notes")
    submit = SubmitField()


@app.route("/", methods=["GET", "POST"])
def index():
    form = LeadForm()

    if form.validate_on_submit():
        # Append data to CSV file
        csv_data = {
            "Opportunity": f"Event Lead: {form.name.data}",
            "Contact Name": form.name.data,
            "Email": form.email.data,
            "Job Position": form.job_position.data,
            "Company Name": form.company.data,
            "Country": form.country.data,
            "Phone": form.phone.data,
            "Notes": form.notes.data,
            "Tags": config.TAG_NAME,
            "Campaign": config.CAMPAIGN_NAME,
            "Source": config.SOURCE_NAME,
        }
        append_to_csv(csv_data, config.CSV_FILE_PATH)

        # Create lead in Odoo
        try:
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
                    "description": form.notes.data,
                    "campaign_id": config.CAMPAIGN_ID,
                    "source_id": config.SOURCE_ID,
                    "tag_ids": [(4, config.TAG_ID)],
                },
            )
            logging.debug(f"Created Lead ID: {lead_id}")
        except Exception as e:
            logging.error(f"Couldn't create Lead in Odoo: {e}")

        label_text = f"Hello \n{form.name.data}"

        parameters = LabelParameters(
            configuration=printer_config, text=label_text, label_size="54"
        )
        qlr = generate_label(
            parameters=parameters,
            configuration=printer_config,
            save_image_to="sample-out.png" if config.LOG_LEVEL == "DEBUG" else None,
        )

        if config.LOG_LEVEL != "DEBUG":
            print_label(
                parameters=parameters,
                qlr=qlr,
                configuration=printer_config,
                backend_class=BrotherQLBackendNetwork,
            )

        flash("Thanks for submitting", "success")
        return redirect(url_for("index"))

    return render_template(
        "form.html",
        form=form,
    )


if __name__ == "__main__":
    flask_debug = True if config.LOG_LEVEL == "DEBUG" else False
    try:
        app.run(debug=flask_debug)
    except ConfigError as e:
        logging.error(e)
