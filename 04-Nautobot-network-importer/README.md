# Nautobot Network Importer

## Overview
-----------

Network importer operates on top of `device onboarding`. Meaning, devices have to be already present in Nautobot before `network importer` can execute any action. Therefore `onboarding plugin` should first import devices into Nautobot and then, `network importer` can load additional data from the devices, like interfaces, VLAN-s, Prefixes, IP Addresses and sometimes connections(cables in Naubobot) between devices.

Network Importer is another tool, very usefull in brownfield environments, that pulls data from the network into the SOT.

## Setup
--------

Make sure to setup ENV variables as such:
```
$ export PYTHON_VERSION=3.9
```

Next, make sure that `automation_net` is created on the local system:
```
$ docker network create --driver bridge automation_net
```

Now, docker images have to be build with `docker-compose build` command and arguments:


Build docker containers with the following command:

```
$ docker-compose build --build-arg PYTHON_VERSION=$PYTHON_VERSION
```

Start `Network Importer` with docker-compose cmd:
```
docker-compose up
```

Once containers are started, login to `network_importer` container and confirm connectivity to Nautobot(inventory):

```
docker exec -it network_importer bash
```

Execute following command inside container `network-importer inventory`:

```
root@b4a349fbb551:/network-importer# network-importer inventory
                       Device Inventory (limit:False)                        
┏━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━┓
┃ Device ┃ Platform ┃ Driver                           ┃ Reachable ┃ Reason ┃
┡━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━╇━━━━━━━━┩
│ R1     │ eos      │ network_importer.drivers.default │ True      │        │
│ R2     │ eos      │ network_importer.drivers.default │ True      │        │
└────────┴──────────┴──────────────────────────────────┴───────────┴────────┘
root@b4a349fbb551:/network-importer

```
> Note: You will only see similar output as soon as R1 and R2 devices were properly imported into Nautobot according to the guidelines in Nautobot Devices Onboarding plugin tutorial.

Next, run `network-importer` to import information about interfaces.

The first run have to be executed with `update-configs` flag, to make sure configs are dumped by network-importer, plus lets use `check` mode just to watch what is going to happen, before actually applying any changes into Nautobot:
```
root@54ba06cf3fef:/network-importer# network-importer check --update-configs
2023-07-04 14:41:32,366 - network-importer - INFO - Updating configuration from devices .. 
2023-07-04 14:41:32,699 - network-importer - INFO - R2 | Configuration file updated
2023-07-04 14:41:32,709 - network-importer - INFO - R1 | Configuration file updated
2023-07-04 14:41:32,710 - network-importer - INFO - Import SOT Model
2023-07-04 14:41:33,329 - network-importer - INFO - Import Network Model
2023-07-04 14:41:41,763 - network-importer - INFO - Collecting cabling information from devices .. 
site
  site: afghanistan
    prefix
      prefix: afghanistan__192.168.10.0/24 MISSING in Nautobot
      prefix: afghanistan__10.10.10.0/24 MISSING in Nautobot
      prefix: afghanistan__192.168.1.0/30 MISSING in Nautobot
      prefix: afghanistan__192.168.1.4/30 MISSING in Nautobot
device
  device: R1
    interface
      interface: Management0 MISSING in Nautobot
        ip_address
          ip_address: R1__Management0__10.10.10.1/24 MISSING in Nautobot
      interface: Ethernet1 MISSING in Nautobot
        ip_address
          ip_address: R1__Ethernet1__192.168.1.1/30 MISSING in Nautobot
      interface: Ethernet2 MISSING in Nautobot
        ip_address
          ip_address: R1__Ethernet2__192.168.1.5/30 MISSING in Nautobot
  device: R2
    interface
      interface: Ethernet2 MISSING in Nautobot
        ip_address
          ip_address: R2__Ethernet2__192.168.1.6/30 MISSING in Nautobot
      interface: Ethernet1 MISSING in Nautobot
        ip_address
          ip_address: R2__Ethernet1__192.168.1.2/30 MISSING in Nautobot
2023-07-04 14:41:41,876 - network-importer - INFO - Execution finished, processed 2 device(s)
root@54ba06cf3fef:/network-importer#
```

Two config files were updated(downloaded) and then whole bunch of info was analyzed. 

The output clearly shows that objects like interfaces or ip addresses are missing in Nautobot.
If we now run network-importer in `apply` mode, we should see new objects in Nautobot:

```
root@54ba06cf3fef:/network-importer# network-importer apply
2023-07-04 14:44:46,573 - network-importer - INFO - Import SOT Model
2023-07-04 14:44:47,693 - network-importer - INFO - Import Network Model
2023-07-04 14:44:49,942 - network-importer - INFO - Collecting cabling information from devices .. 
2023-07-04 14:44:50,231 - network-importer - INFO - Created Prefix 192.168.10.0/24 (1f79a32e-5fae-4cd5-be04-e7cc7ec56d57) in Nautobot
2023-07-04 14:44:50,309 - network-importer - INFO - Created Prefix 10.10.10.0/24 (2822cbdf-f959-4333-8157-17e0c80d237a) in Nautobot
2023-07-04 14:44:50,405 - network-importer - INFO - Created Prefix 192.168.1.0/30 (32f4761e-2116-44dc-adfd-30d399e5e8e0) in Nautobot
2023-07-04 14:44:50,505 - network-importer - INFO - Created Prefix 192.168.1.4/30 (32d82f60-3f9a-44e9-95f5-d784b8fa10d6) in Nautobot
2023-07-04 14:44:50,619 - network-importer - INFO - Created interface Management0 (857b02b0-2173-4e85-91ca-f0faf9738a55) in Nautobot
2023-07-04 14:44:50,717 - network-importer - INFO - Created IP 10.10.10.1/24 (cf003818-312d-4586-b435-51567d6b1a13) in Nautobot
2023-07-04 14:44:50,832 - network-importer - INFO - Created interface Ethernet1 (be0a9be9-bf35-4fea-833a-5f34ae9ef1f8) in Nautobot
2023-07-04 14:44:50,932 - network-importer - INFO - Created IP 192.168.1.1/30 (d4c41920-d9ce-483e-a9eb-f8989631927b) in Nautobot
2023-07-04 14:44:51,040 - network-importer - INFO - Created interface Ethernet2 (71233012-3573-426d-a2f1-a39fe6743fb5) in Nautobot
2023-07-04 14:44:51,127 - network-importer - INFO - Created IP 192.168.1.5/30 (b6bb6c7f-14b8-41eb-8c7f-7a9d8d07c3f4) in Nautobot
2023-07-04 14:44:51,246 - network-importer - INFO - Created interface Ethernet2 (4bf5595c-0cfc-4059-90cc-05e116df9a24) in Nautobot
2023-07-04 14:44:51,344 - network-importer - INFO - Created IP 192.168.1.6/30 (95d5f335-b7b9-4dea-9b43-7d6785b3b299) in Nautobot
2023-07-04 14:44:51,453 - network-importer - INFO - Created interface Ethernet1 (1ccb0759-4593-4658-946d-60e4f57fa436) in Nautobot
2023-07-04 14:44:51,540 - network-importer - INFO - Created IP 192.168.1.2/30 (af6b8e81-a5e1-40ec-83f6-fa88c2a09ad9) in Nautobot
2023-07-04 14:44:51,540 - network-importer - INFO - Execution finished, processed 2 device(s)
root@54ba06cf3fef:/network-importer#
```

Check Nautobot UI for yourself to confirm data like Prefixes, Interfaces or IP Addresses were successfully imported.

## Conclusion
-------------

Network importer is another tool that saves engineering time by importing devices data into SOT.
