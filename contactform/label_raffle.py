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


def print_raffle(name_data, voucher_code, config, printer_config):
    unique_id = uuid.uuid4().hex
    label_filename = f"label_raffle_{unique_id}.png"

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
    h1 {
        font-size: 70px;
    }
    .big {
        font-size: 35px;
    }
    .small {
        font-size: 25px;
    }
    """
    label_html = f"""\
    <div>
        <h1>{name_data}</h1>
        <p class="big">{config.LABEL_HEADER}</p>
        <p class="small">{voucher_code}</p>
    </div>
    """

    try:
        # Generate image from HTML and CSS
        hti = Html2Image(
            size=(590, 500),
            custom_flags=[
                "--default-background-color=FFFFFF",
                "--hide-scrollbars",
            ],
        )
        hti.browser.use_new_headless = True # https://github.com/vgalin/html2image/issues/174#issuecomment-2625720244
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
            )

        logging.info(f"Printing raffle label for {name_data}")
        preview_filename = (
            f"print-preview-raffle_{unique_id}.png"
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
        logging.error(f"Printing of raffle ticket failed for {name_data}: {e}")
    finally:
        # Clean up temporary files
        if os.path.exists(label_filename):
            os.remove(label_filename)
        if (
            config.LOG_LEVEL == "DEBUG"
            and preview_filename
            and os.path.exists(preview_filename)
        ):
            os.remove(preview_filename)
