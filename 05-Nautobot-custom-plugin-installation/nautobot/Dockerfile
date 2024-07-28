ARG NAUTOBOT_VER="2.2.7"
ARG PYTHON_VER="3.9"

FROM ghcr.io/nautobot/nautobot-dev:${NAUTOBOT_VER}-py${PYTHON_VER} AS base


ARG NAUTOBOT_ROOT=/opt/nautobot

ENV prometheus_multiproc_dir=/prom_cache
ENV NAUTOBOT_ROOT=${NAUTOBOT_ROOT}


RUN which poetry || curl -sSL https://install.python-poetry.org | python3 - && \
    poetry config virtualenvs.create false


COPY pyproject.toml poetry.lock /source/
WORKDIR /source

ENV PATH="${POETRY_HOME}/bin:${PATH}"

RUN --mount=type=cache,target="/root/.cache",sharing=locked \
    poetry install --no-root --no-ansi --no-interaction --only main


FROM base AS apps

RUN --mount=type=cache,target="/root/.cache",sharing=locked \
    poetry install --no-root --no-ansi --no-interaction --only apps


FROM apps AS dev

COPY pkg /source/pkg

RUN --mount=type=cache,target="/root/.cache",sharing=locked \
    poetry install --no-root --no-ansi --no-interaction --only dev

RUN cd /source/pkg/custom_napalm && \
    poetry install --no-ansi --no-interaction --only main

RUN cd /source/pkg/onboarding_extensions && \ 
    poetry install --no-ansi --no-interaction --only main

RUN poetry install --no-ansi --no-interaction --only custom_apps


COPY nautobot_config.py ${NAUTOBOT_ROOT}/nautobot_config.py

