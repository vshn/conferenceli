from flask import flash
from wtforms.fields import *
from html2image import Html2Image
from brother_ql_web.labels import (
    LabelParameters,
    generate_label,
    print_label,
)
from brother_ql.backends.network import BrotherQLBackendNetwork


def print_raffle(form, config, printer_config):
    label_filename = "label_raffle.png"

    label_html = f"""\
    <h1>{form.name.data}</h1>
    <p><strong>yay</strong></p>
    """

    hti = Html2Image()
    hti.size = (500, 200)
    hti.screenshot(
        html_str=label_html,
        save_as=label_filename,
    )

    label_image = open(label_filename, "rb")

    parameters = LabelParameters(
        configuration=printer_config,
        image=label_image.read(),
        label_size="54",
    )

    qlr = generate_label(
        parameters=parameters,
        configuration=printer_config,
        save_image_to=(
            "print-preview-raffle.png" if config.LOG_LEVEL == "DEBUG" else None
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
        flash(f"Printing of raffle ticket failed: {e}", "error")
