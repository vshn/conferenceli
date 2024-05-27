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

RUN poetry install --no-root

### RUNTIME
FROM python:3.12-bookworm as runtime

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/contactform" \
    GUNICORN_CMD_ARGS="--workers=1 --bind=0.0.0.0:8000 --access-logfile=-"

COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}

COPY contactform ./contactform

EXPOSE 8000

CMD ["gunicorn", "contactform.app:app"]