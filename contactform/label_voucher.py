import segno
import urllib
import logging
import uuid
import os

from html2image import Html2Image
from brother_ql_web.labels import (
    LabelParameters,
    generate_label,
    print_label,
)
from brother_ql.backends.network import BrotherQLBackendNetwork


def print_voucher(
    name_data,
    company_data,
    email_data,
    phone_data,
    voucher_code,
    config,
    printer_config,
):
    unique_id = uuid.uuid4().hex
    label_filename = f"label_voucher_{unique_id}.png"
    qr_code_filename = f"appuio_voucher_qr_{unique_id}.png"

    label_css = """
    body, html {
        margin: 0;
        padding: 0;
        height: 100%;
        display: grid;
        place-items: center;
        font-family: sans-serif;
        text-align: center;
    }
    .logo {
        width: 70%;
    }
    .text {
        font-size: 45px;
    }
    .text_small {
        font-size: 35px;
    }
    """
    label_html = f"""\
    <div>
        <p><img src="appuio-bw.png" class="logo"></p>
        <p class="text">Hi {name_data}<p>
        <p class="text">Your personal voucher code to try out APPUiO:</p>
        <p class="text"><strong>{voucher_code}</strong></p>
        <p class="text_small">Register here: {config.APPUIO_SIGNUP_URL}</p>
        <p><img src="{qr_code_filename}"></p>
    </div>
    """

    registration_url_parameters = (
        f"?voucher={voucher_code}"
        f"&name={urllib.parse.quote(name_data)}"
        f"&company={urllib.parse.quote(company_data)}"
        f"&email={urllib.parse.quote(email_data)}"
        f"&phone={urllib.parse.quote(phone_data)}"
        f"&utm_campaign={urllib.parse.quote(config.CAMPAIGN_NAME)}"
        f"&utm_source=Voucher"
    )
    signup_url = f"{config.APPUIO_SIGNUP_URL}{registration_url_parameters}"
    logging.debug(f"URL: {signup_url}")

    try:
        # Generate QR code
        qrcode = segno.make_qr(signup_url)
        qrcode.save(
            qr_code_filename,
            scale=5,
        )

        hti = Html2Image(
            size=(590, 1200),
            custom_flags=[
                "--default-background-color=FFFFFF",
                "--hide-scrollbars",
            ],
        )
        hti.load_file(config.APPUIO_LOGO_PATH)
        hti.load_file(qr_code_filename)
        hti.browser.print_command = True if config.LOG_LEVEL == "DEBUG" else False
        hti.screenshot(
            html_str=label_html,
            css_str=label_css,
            save_as=label_filename,
        )

        with open(label_filename, "rb") as label_image:
            parameters = LabelParameters(
                configuration=printer_config,
                image=label_image.read(),
                label_size="54",
                high_quality=True,
            )

            logging.info(f"Printing voucher label for {name_data}")
            preview_filename = (
                f"print-preview-voucher_{unique_id}.png"
                if config.LOG_LEVEL == "DEBUG"
                else None
            )

            qlr = generate_label(
                parameters=parameters,
                configuration=printer_config,
                save_image_to=preview_filename,
            )

            print_label(
                parameters=parameters,
                qlr=qlr,
                configuration=printer_config,
                backend_class=BrotherQLBackendNetwork,
            )
    except Exception as e:
        logging.error(f"Printing of voucher failed for {name_data}: {e}")
    finally:
        # Clean up temporary files
        if os.path.exists(label_filename):
            os.remove(label_filename)
        if os.path.exists(qr_code_filename):
            os.remove(qr_code_filename)
        if (
            config.LOG_LEVEL == "DEBUG"
            and preview_filename
            and os.path.exists(preview_filename)
        ):
            os.remove(preview_filename)
