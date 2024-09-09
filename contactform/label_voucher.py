import segno
import urllib

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
    label_voucher_filename = "label_voucher.png"
    qr_code_filename = "appuio_voucher_qr.png"

    label_voucher_css = """
    * {
        text-align: center;
    }
    .logo {
        display: block;
        margin-left: auto;
        margin-right: auto;
        width: 35%;
    }
    """
    label_voucher_html = f"""\
    <p><img src="appuio.png" class="logo"></p>
    <p>Hi {form.name.data}, your personal voucher code to try out APPUiO:</p>
    <p><strong>{voucher_code}</strong></p>
    <p>Register here: {config.APPUIO_SIGNUP_URL}</p>
    <p><img src="{qr_code_filename}"></p>
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
        scale=3,
    )

    hti = Html2Image()
    hti.load_file("contactform/static/images/appuio.png")
    hti.load_file(qr_code_filename)
    hti.size = (500, 500)
    hti.screenshot(
        html_str=label_voucher_html,
        css_str=label_voucher_css,
        save_as=label_voucher_filename,
    )

    label_voucher_image = open(label_voucher_filename, "rb")

    parameters = LabelParameters(
        configuration=printer_config,
        image=label_voucher_image.read(),
        label_size="54",
    )

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
        flash(f"Printing failed: {e}", "error")
