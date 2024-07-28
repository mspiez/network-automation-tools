ARG PYTHON_VER="3.9"

FROM python:${PYTHON_VER}

RUN pip install --upgrade pip \
  && pip install poetry==1.8.3

WORKDIR /local
RUN git clone https://github.com/mspiez/network-importer.git .

COPY pyproject.toml poetry.lock /local/

RUN poetry config virtualenvs.create false \
  && poetry install --no-interaction --no-ansi --no-root

RUN poetry install --no-ansi --no-interaction

