ARG NAUTOBOT_VERSION
ARG NAUTOBOT_PYTHON_VERSION

FROM networktocode/nautobot:${NAUTOBOT_VERSION}-py${NAUTOBOT_PYTHON_VERSION}

COPY ./nautobot_config.py /opt/nautobot/
COPY ./plugin_requirements.txt /opt/nautobot/

RUN pip install --no-warn-script-location -r /opt/nautobot/plugin_requirements.txt
