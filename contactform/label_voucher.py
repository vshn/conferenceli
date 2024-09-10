import segno
import urllib
import logging


from flask import flash
from wtforms.fields import *
from html2image import Html2Image
from brother_ql_web.labels import (
    LabelParameters,
    generate_label,
    print_label,
)
from brother_ql.backends.network import BrotherQLBackendNetwork


def print_voucher(form, voucher_code, config, printer_config):
    label_filename = "/tmp/label_voucher.png"
    qr_code_filename = "/tmp/appuio_voucher_qr.png"

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
        <p class="text">Hi {form.name.data}<p>
        <p class="text">Your personal voucher code to try out APPUiO:</p>
        <p class="text"><strong>{voucher_code}</strong></p>
        <p class="text_small">Register here: {config.APPUIO_SIGNUP_URL}</p>
        <p><img src="{qr_code_filename}"></p>
    </div>
    """

    registration_url_parameters = (
        f"?voucher={voucher_code}"
        f"&name={urllib.parse.quote(form.name.data)}"
        f"&company={urllib.parse.quote(form.company.data)}"
        f"&email={urllib.parse.quote(form.email.data)}"
        f"&phone={urllib.parse.quote(form.phone.data)}"
    )
    qrcode = segno.make_qr(f"{config.APPUIO_SIGNUP_URL}{registration_url_parameters}")
    qrcode.save(
        qr_code_filename,
        scale=5,
    )

    hti = Html2Image(size=(590, 1050))
    hti.load_file(config.APPUIO_LOGO_PATH)
    hti.load_file(qr_code_filename)
    hti.browser.print_command = True if config.LOG_LEVEL == "DEBUG" else False
    hti.screenshot(
        html_str=label_html,
        css_str=label_css,
        save_as=label_filename,
    )

    label_image = open(label_filename, "rb")

    parameters = LabelParameters(
        configuration=printer_config,
        image=label_image.read(),
        label_size="54",
        high_quality=True,
    )

    logging.info(f"Printing voucher label for {form.name.data}")
    qlr = generate_label(
        parameters=parameters,
        configuration=printer_config,
        save_image_to=(
            "print-preview-voucher.png" if config.LOG_LEVEL == "DEBUG" else None
        ),
    )
    try:
        print_label(
            parameters=parameters,
            qlr=qlr,
            configuration=printer_config,
            backend_class=BrotherQLBackendNetwork,
        )
    except Exception as e:
        flash(f"Printing of voucher failed: {e}", "error")
