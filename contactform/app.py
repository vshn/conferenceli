import logging
from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    flash,
    redirect,
    url_for,
    Response,
)
from wtforms.validators import DataRequired, Email
from wtforms.fields import *
from flask_wtf import CSRFProtect, FlaskForm
from flask_bootstrap import Bootstrap5


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

from odoo_client import *
from config import *
from utils import *

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
    printer=PrinterConfiguration(
        model="QL-820NWB", printer=f"tcp://{config.PRINTER_IP}"
    ),
    label=LabelConfiguration(
        default_size="54",
        default_orientation="standard",
        default_font_size=70,
        default_fonts=[
            Font(family="IBM Plex Sans", style="Bold"),
            Font(family="Source Code Pro", style="Bold"),
        ],
        default_font=Font(family="Source Code Pro", style="Bold"),
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
    notes = TextAreaField("What can VSHN help you with?")
    submit = SubmitField()


class ConfigForm(FlaskForm):
    campaign_name = StringField("Campaign Name *", validators=[DataRequired()])
    label_header = StringField("Label Header *", validators=[DataRequired()])
    printing_enabled = BooleanField("Printing Enabled")
    odoo_leadcreation_enabled = BooleanField("Odoo Lead Creation Enabled")
    submit = SubmitField("Save Changes")


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

        if config.ODOO_CREATELEAD_ENABLED:
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

        if config.PRINTING_ENABLED:
            name_splitted = form.name.data.split(" ")
            label_text = (
                f"{config.LABEL_HEADER}\n"
                "☺☺☺\n"
                f"{name_splitted[0]}\n"
                f"{name_splitted[1]}\n"
            )

            parameters = LabelParameters(
                configuration=printer_config,
                text=label_text,
                label_size="54",
                font_size=70,
            )

            qlr = generate_label(
                parameters=parameters,
                configuration=printer_config,
                save_image_to="sample-out.png" if config.LOG_LEVEL == "DEBUG" else None,
            )
            try:
                print_label(
                    parameters=parameters,
                    qlr=qlr,
                    configuration=printer_config,
                    backend_class=BrotherQLBackendNetwork,
                )
            except Exception as e:
                flash(f"Printing failed: {e}", "error")

        flash("Thanks for submitting", "success")
        return redirect(url_for("index"))

    return render_template(
        "form.html",
        form=form,
    )


@app.route("/config", methods=["GET", "POST"])
@requires_auth
def config_endpoint():
    form = ConfigForm(
        campaign_name=config.CAMPAIGN_NAME,
        printing_enabled=config.PRINTING_ENABLED,
        label_header=config.LABEL_HEADER,
        odoo_leadcreation_enabled=config.ODOO_CREATELEAD_ENABLED,
    )

    if form.validate_on_submit():
        try:
            config.CAMPAIGN_ID = odoo_client.find_id_by_name("utm.campaign", form.campaign_name.data)
            config.CAMPAIGN_NAME = form.campaign_name.data
            config.PRINTING_ENABLED = form.printing_enabled.data
            config.ODOO_CREATELEAD_ENABLED = form.odoo_leadcreation_enabled.data
            config.LABEL_HEADER = form.label_header.data
            save_config(config)
            flash("Configuration updated successfully", "success")
        except Exception as e:
            flash(f"{e}", "error")

        return redirect(url_for("config_endpoint"))

    return render_template("form.html", form=form)


if __name__ == "__main__":
    flask_debug = True if config.LOG_LEVEL == "DEBUG" else False
    try:
        app.run(debug=flask_debug)
    except ConfigError as e:
        logging.error(e)
