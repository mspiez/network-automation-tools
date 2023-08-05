ARG PYTHON_VERSION

FROM python:${PYTHON_VERSION}

RUN pip install --upgrade pip

RUN git clone https://github.com/networktocode/network-importer.git --branch v3.1.1
RUN pip install network-importer==3.1.0

WORKDIR /network-importer
