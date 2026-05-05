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


_LABEL_CSS = """
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
.logo_servala {
    width: 55%;
}
.text {
    font-size: 45px;
}
.text_small {
    font-size: 35px;
}
.code {
    font-size: 60px;
    font-weight: bold;
    letter-spacing: 4px;
}
.identifier {
    margin-top: 30px;
    font-size: 22px;
    color: #000;
    text-align: right;
    padding-right: 25px;
}
"""


def _render_and_print(
    label_html,
    load_files,
    transient_files,
    name_data,
    config,
    printer_config,
    label_kind,
):
    unique_id = uuid.uuid4().hex
    label_filename = f"label_{label_kind}_{unique_id}.png"
    preview_filename = None

    try:
        hti = Html2Image(
            size=(590, 1200),
            custom_flags=[
                "--default-background-color=FFFFFF",
                "--hide-scrollbars",
            ],
        )
        # https://github.com/vgalin/html2image/issues/174#issuecomment-2625720244
        hti.browser.use_new_headless = True
        for f in load_files:
            hti.load_file(f)
        hti.browser.print_command = True if config.LOG_LEVEL == "DEBUG" else False
        hti.screenshot(
            html_str=label_html,
            css_str=_LABEL_CSS,
            save_as=label_filename,
        )

        with open(label_filename, "rb") as label_image:
            parameters = LabelParameters(
                configuration=printer_config,
                image=label_image.read(),
                label_size="54",
                high_quality=True,
            )

            logging.info(f"Printing {label_kind} voucher label for {name_data}")
            preview_filename = (
                f"print-preview-{label_kind}_{unique_id}.png"
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
        logging.error(f"Printing of {label_kind} voucher failed for {name_data}: {e}")
    finally:
        if os.path.exists(label_filename):
            os.remove(label_filename)
        for f in transient_files:
            if os.path.exists(f):
                os.remove(f)
        if (
            config.LOG_LEVEL == "DEBUG"
            and preview_filename
            and os.path.exists(preview_filename)
        ):
            os.remove(preview_filename)


def print_appuio_voucher(
    name_data,
    company_data,
    email_data,
    phone_data,
    voucher_code,
    config,
    printer_config,
):
    unique_id = uuid.uuid4().hex
    qr_code_filename = f"appuio_voucher_qr_{unique_id}.png"

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

    qrcode = segno.make_qr(signup_url)
    qrcode.save(qr_code_filename, scale=5)

    _render_and_print(
        label_html=label_html,
        load_files=[config.APPUIO_LOGO_PATH, qr_code_filename],
        transient_files=[qr_code_filename],
        name_data=name_data,
        config=config,
        printer_config=printer_config,
        label_kind="appuio",
    )


def print_servala_voucher(name_data, voucher_code, config, printer_config):
    unique_id = uuid.uuid4().hex
    qr_code_filename = f"servala_voucher_qr_{unique_id}.png"

    label_html = f"""\
    <div>
        <p><img src="servala-bw.png" class="logo_servala"></p>
        <p class="text">Hi {name_data}.</p>
        <p class="text">Your personal voucher code to try Servala, the Sovereign App Store:</p>
        <p class="code">{config.SERVALA_VOUCHER_CODE}</p>
        <p class="text_small">Start here: {config.SERVALA_SIGNUP_URL}</p>
        <p><img src="{qr_code_filename}"></p>
        <p class="identifier">#{voucher_code}</p>
    </div>
    """

    logging.debug(f"Servala QR URL: {config.SERVALA_SIGNUP_URL}")

    qrcode = segno.make_qr(config.SERVALA_SIGNUP_URL)
    qrcode.save(qr_code_filename, scale=8)

    _render_and_print(
        label_html=label_html,
        load_files=[config.SERVALA_LOGO_PATH, qr_code_filename],
        transient_files=[qr_code_filename],
        name_data=name_data,
        config=config,
        printer_config=printer_config,
        label_kind="servala",
    )
