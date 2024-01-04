FROM golang:1.18.1-alpine

ENV INSTALL_DIR /opt/gnmi-gateway

RUN apk add --update make gcc g++ git openssl

WORKDIR "${INSTALL_DIR}"

RUN git clone https://github.com/openconfig/gnmi-gateway .

RUN make build
RUN make download
RUN make tls
RUN ./gnmi-gateway -version

CMD ["./gnmi-gateway", \
    "-TargetLoaders=json", \
    "-TargetJSONFile=./targets.json", \
    "-EnableGNMIServer", \
    "-Exporters=prometheus", \
    "-OpenConfigDirectory=./oc-models/", \
    "-ServerTLSCert=server.crt", \
    "-ServerTLSKey=server.key"]
