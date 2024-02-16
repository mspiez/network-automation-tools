ARG PYTHON_VERSION

FROM python:${PYTHON_VERSION}

RUN pip install --upgrade pip

RUN git clone https://github.com/mspiez/network-importer.git
WORKDIR /network-importer

RUN pip install .
