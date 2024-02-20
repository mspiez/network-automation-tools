## About

The intention of this project is to help network engineers begin their journey towards network automation without a deep understanding of the tools on the backend side.

Getting familiar with each technology takes time, and without proper background, setting up a single standalone tool for testing may be cumbersome and discouraging.

The series of tutorials in this project aims to help set up the environment and focus only on the features, benefits and drawbacks of the particular tools.

Usually the steps come down to copying and pasting commands into the terminal and then building and starting containers.

> Note: Environment was build on top of Ubuntu OS, so commands may not work for other OS-s(Macbook) or Linux distros.


## Table of contents

### [VM Devices setup](./01-VM-Devices-setup)

Arista | KVM | Linux Bridging brctl | virsh

------------------------------------------------------------------

### [Nautobot setup](./02-Nautobot-setup)

Nautobot | GIT | Docker | docker-compose | Python3

-------------------------------------------------------------------------

### [Nautobot devices onboarding](./03-Nautobot-devices-onboarding)

Nautobot | GIT | Docker | docker-compose | Python3 | Nautobot Plugin - device onboarding

-------------------------------------------------------------------------

### [Nautobot network importer](./04-Nautobot-network-importer)

Nautobot | GIT | Docker | docker-compose | Python3 | Network importer

-------------------------------------------------------------------------

### [Nautobot Plugin Installation](./05-Nautobot-custom-plugin-installation)

Nautobot | GIT | Docker | docker-compose | Python3 | Nautobot Plugin - Interfaces telemetry | Nautobot Plugin - SSOT(Single Source of Truth)

-------------------------------------------------------------------------

### [GNMI gateway setup](./06-GNMI-gateway)

GIT | docker-compose | GNMI gateway | Prometheus

-------------------------------------------------------------------------

### [GNMI gateway and Nautobot setup](./07-GNMI-gateway-and-Nautobot)

Nautobot | GIT | docker-compose | Python3 | GNMI gateway | Nautobot GO client | Nautobot Plugin - Interfaces telemetry

-------------------------------------------------------------------------

### [Telegraf setup](./08-Telegraf-setup)

Telegraf | SNMP | Prometheus

-------------------------------------------------------------------------

### [Telegraf and Grafana](./09-Telegraf-and-Grafana)

Telegraf | SNMP | Prometheus | Grafana

-------------------------------------------------------------------------

### [AWX setup](./10-AWX-setup)

Minikube | helm | awx-operator | AWX

-------------------------------------------------------------------------
