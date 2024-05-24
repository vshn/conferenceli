### BUILDER
FROM python:3.12-bookworm as builder

RUN pip install poetry==1.8.3

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    POETRY_VIRTUALENVS_CREATE=1 \
    POETRY_CACHE_DIR=/tmp/poetry_cache

WORKDIR /app

COPY pyproject.toml poetry.lock ./
RUN touch README.md

RUN --mount=type=cache,target=$POETRY_CACHE_DIR poetry install --no-root

### RUNTIME
FROM python:3.12-bookworm as runtime

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    FLASK_APP="contactform/app.py" \
    FLASK_ENV="production" \
    FLASK_DEBUG="0" \
    FLASK_RUN_HOST="0.0.0.0" \
    FLASK_RUN_PORT="8000" \
    PYTHONPATH="/contactform"

COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}

COPY contactform ./contactform

EXPOSE 8000

CMD ["flask", "run"]