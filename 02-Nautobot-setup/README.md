# Nautobot setup

## Overview
-----------
This tutorial describes a quick way of setting up Nautobot on the local system.

After spinning up containers, the Nautobot database will be filled with some basic data, so that it does not have to be handled manually. 


## Setup
--------

### Run Nautobot
----------------

The version of the Nautobot to be used: `1.5.22`.

Make sure to setup ENV variables as such:
```
$ export NAUTOBOT_VERSION=1.5.22
$ export NAUTOBOT_PYTHON_VERSION=3.9
```

These ones are used by `docker-compose` when building Nautobot image on the local system.

Before starting Nautobot, create Docker network that containers will be using to communicate with each other:
```
$ docker network create --driver bridge automation_net
```

Now, docker images have to be build with `docker-compose build` command with arguments:

```
docker-compose build --build-arg NAUTOBOT_VERSION="$NAUTOBOT_VERSION" --build-arg NAUTOBOT_PYTHON_VERSION="$NAUTOBOT_PYTHON_VERSION"
```

Start Nautobot by using `docker-compose up` command:
```
$ docker-compose up
```

At this step you can navigate to Nautobot UI at `localhost:8080` and login with credentials `admin/admin`.

### Pre-populate data into Nautobot
----------------------------------

This step generates:
- sites
- manufacturer
- platform

Enter the Nautobot shell inside container

```
$ docker exec -it nautobot nautobot-server nbshell

```

Onced in Python/nbshell shell, execute following command `exec(open('./utils/populate_data.py').read())`:
```
### Nautobot interactive shell (1ae2c902bd34)
### Python 3.9.17 | Django 3.2.19 | Nautobot 1.5.22
### lsmodels() will show available models. Use help(<model>) for more info.
>>> exec(open('./utils/populate_data.py').read())
Created site: Aruba
Created site: Afghanistan
Created site: Angola
Created site: Anguilla
Created site: Åland Islands

<...>
Created site: Zimbabwe
Created manufacturer: Arista
Created platform: Arista
>>>
```

Without this step `Devices Onboarding` plugin cannot be run from Nautobot UI, as we need, for example, `Site` object to be present in Nautobot before a device can be imported.

## Conclusion
-------------

Nautobot will communicate with our VMs to gather some basic information about devices, but it is also capable of talking to other tools using the REST API.

