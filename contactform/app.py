import logging
from flask import (
    Flask,
    render_template,
    flash,
    redirect,
    url_for,
)
from wtforms.validators import DataRequired, Email
from wtforms.fields import *
from flask_wtf import CSRFProtect, FlaskForm
from flask_bootstrap import Bootstrap5
from label_voucher import print_voucher
from label_raffle import print_raffle


from brother_ql_web.configuration import (
    Configuration,
    ServerConfiguration,
    PrinterConfiguration,
    Font,
    LabelConfiguration,
    WebsiteConfiguration,
)

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
    notes = TextAreaField("What can VSHN help you with?", render_kw={"rows": 5})
    submit = SubmitField()


class ConfigForm(FlaskForm):
    campaign_name = StringField("Campaign Name *", validators=[DataRequired()])
    label_header = StringField("Label Header *", validators=[DataRequired()])
    print_appuio_voucher = BooleanField("Print APPUiO Voucher")
    print_raffle_ticket = BooleanField("Print Raffle Ticket")
    odoo_leadcreation_enabled = BooleanField("Odoo Lead Creation Enabled")
    submit = SubmitField("Save Changes")


def is_duplicate_submission(email, csv_file_path):
    """Check if the email has already been submitted."""
    try:
        with open(csv_file_path, mode="r") as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if row["Email"] == email:
                    return True
    except FileNotFoundError:
        # If the CSV file does not exist, treat as no duplicates
        pass
    return False


@app.route("/", methods=["GET", "POST"])
def index():
    form = LeadForm()

    if form.validate_on_submit():
        # Check if the form submission is a duplicate
        if is_duplicate_submission(form.email.data, config.CSV_FILE_PATH):
            flash(
                "You have already submitted the form. Duplicate submissions are not allowed.",
                "warning",
            )
            return redirect(url_for("index"))

        # Generate a random voucher code for APPUiO
        voucher_code = random_word(6)

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
            "VoucherCode": voucher_code,
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
                        "description": f"{form.notes.data}<br><br>APPUiO Voucher Code: {voucher_code}",
                        "campaign_id": config.CAMPAIGN_ID,
                        "source_id": config.SOURCE_ID,
                        "tag_ids": [(4, config.TAG_ID)],
                    },
                )
                logging.debug(f"Created Lead ID: {lead_id}")
            except Exception as e:
                logging.error(f"Couldn't create Lead in Odoo: {e}")

        if config.PRINT_APPUIO_VOUCHER:
            print_voucher(
                form=form,
                voucher_code=voucher_code,
                config=config,
                printer_config=printer_config,
            )

        if config.PRINT_RAFFLE_TICKET:
            print_raffle(
                form=form,
                voucher_code=voucher_code,
                config=config,
                printer_config=printer_config,
            )

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
        print_appuio_voucher=config.PRINT_APPUIO_VOUCHER,
        print_raffle_ticket=config.PRINT_RAFFLE_TICKET,
        label_header=config.LABEL_HEADER,
        odoo_leadcreation_enabled=config.ODOO_CREATELEAD_ENABLED,
    )

    if form.validate_on_submit():
        try:
            config.CAMPAIGN_ID = odoo_client.find_id_by_name(
                "utm.campaign", form.campaign_name.data
            )
            config.CAMPAIGN_NAME = form.campaign_name.data
            config.PRINT_APPUIO_VOUCHER = form.print_appuio_voucher.data
            config.PRINT_RAFFLE_TICKET = form.print_raffle_ticket.data
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
