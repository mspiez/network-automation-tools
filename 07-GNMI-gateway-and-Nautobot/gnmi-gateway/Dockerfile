FROM golang:1.18.1-alpine

ENV INSTALL_DIR /opt/gnmi-gateway

RUN apk add --update make gcc g++ git openssl

WORKDIR "${INSTALL_DIR}"

# RUN git clone https://github.com/openconfig/gnmi-gateway .
RUN git clone https://github.com/mspiez/gnmi-gateway.git --branch nautobot_exporter .

RUN make build
RUN make download
RUN make tls
RUN ./gnmi-gateway -version

# ENV NAUTOBOT_TOKEN=0123456789abcdef0123456789abcdef01234567
# ENV NAUTOBOT_URL=http://0.0.0.0:8080

CMD ["./gnmi-gateway", \
    "-TargetLoaders=json", \
    "-TargetJSONFile=./targets.json", \
    "-EnableGNMIServer", \
    "-Exporters=nautobot", \
    "-OpenConfigDirectory=./oc-models/", \
    "-ServerTLSCert=server.crt", \
    "-ServerTLSKey=server.key"]
