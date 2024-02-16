# Nautobot Network Importer

## Overview

Network importer operates on top of `device onboarding`. Meaning, devices have to be already present in Nautobot before `network importer` can execute any action. Therefore `onboarding plugin` should first import devices into Nautobot and then, `network importer` can load additional data like device interfaces, VLAN-s, Prefixes, IP Addresses and sometimes connections(cables in Nautobot) between devices.

Network Importer is another tool, very useful in brownfield environments, that pulls data from the network into the SOT.

Here assumption is that Nautobot is already running and we spin up additional containers just for network importer.

> Note: To support Nautobot `2.1.1` fork of the Network Importer repo was used. Only `create` methods were modified for the purposes of this tutorial. Further updates are required to be able to update or delete objects in Nautobot.

## Setup

Make sure to setup ENV variables as such:
```
$ export PYTHON_VERSION=3.9
```

Next, make sure that `automation_net` is created on the local system if not already created:
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
$ docker-compose up
```

Once containers are started, login to `network_importer` container and confirm connectivity to Nautobot(inventory):

```
$ docker exec -it network_importer bash
```

Execute following command inside `network_importer` container: `network-importer inventory`:

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
root@d44cccad130e:/network-importer# network-importer check --update-configs
2024-02-16 11:29:31,443 - network-importer - INFO - Updating configuration from devices .. 
2024-02-16 11:29:31,782 - network-importer - INFO - R1 | Configuration file updated
2024-02-16 11:29:31,801 - network-importer - INFO - R2 | Latest config file already present ...
2024-02-16 11:29:31,802 - network-importer - INFO - Import SOT Model
Nautobot IP Address: R1__Management1__192.168.10.1/24
Nautobot IP Address Diffsync: R1__Management1__192.168.10.1/24
Nautobot IP Address: R2__Management1__192.168.10.2/24
Nautobot IP Address Diffsync: R2__Management1__192.168.10.2/24
2024-02-16 11:29:35,739 - network-importer - INFO - Import Network Model
2024-02-16 11:29:45,089 - network-importer - INFO - Collecting cabling information from devices .. 
location
  location: 06eb3da9-edc9-4e50-9c6c-d2ec967167ee
    prefix
      prefix: 06eb3da9-edc9-4e50-9c6c-d2ec967167ee__192.168.10.0/24 MISSING in Nautobot
      prefix: 06eb3da9-edc9-4e50-9c6c-d2ec967167ee__192.168.1.0/30 MISSING in Nautobot
      prefix: 06eb3da9-edc9-4e50-9c6c-d2ec967167ee__192.168.1.4/30 MISSING in Nautobot
device
  device: R1
    interface
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
2024-02-16 11:29:45,163 - network-importer - INFO - Execution finished, processed 2 device(s)
root@d44cccad130e:/network-importer#
```

> Note: Depending on the state of network importer, config files may be updated(downloaded) or already present. 

The output clearly shows that objects like interfaces or ip addresses are missing in Nautobot.
If we now run network-importer in `apply` mode, we should see new objects in Nautobot:

```
root@d44cccad130e:/network-importer# network-importer apply
2024-02-16 11:35:08,194 - network-importer - INFO - Import SOT Model
Nautobot IP Address: R1__Management1__192.168.10.1/24
Nautobot IP Address Diffsync: R1__Management1__192.168.10.1/24
Nautobot IP Address: R2__Management1__192.168.10.2/24
Nautobot IP Address Diffsync: R2__Management1__192.168.10.2/24
2024-02-16 11:35:11,970 - network-importer - INFO - Import Network Model
2024-02-16 11:35:14,057 - network-importer - INFO - Collecting cabling information from devices .. 
2024-02-16 11:35:14,921 - network-importer - INFO - Created Prefix 192.168.1.0/30 (9704c69e-0890-4a3a-b151-3c1babd5ea5e) in Nautobot
2024-02-16 11:35:15,413 - network-importer - INFO - Created Prefix 192.168.1.4/30 (db3abd96-13b9-4f9d-9688-960943181f24) in Nautobot
2024-02-16 11:35:16,138 - network-importer - INFO - Created interface Ethernet1 (85085bd6-6fc0-488f-8003-0eed0edb2ee8) in Nautobot
2024-02-16 11:35:17,689 - network-importer - INFO - Created IP 192.168.1.1/30 (616b7236-9a91-4d5c-a07b-7137c26850f7) in Nautobot
2024-02-16 11:35:17,689 - network-importer - INFO - IP Address 192.168.1.1/30 (616b7236-9a91-4d5c-a07b-7137c26850f7) assigned to Interface Ethernet1 (85085bd6-6fc0-488f-8003-0eed0edb2ee8)
2024-02-16 11:35:18,730 - network-importer - INFO - Created interface Ethernet2 (5ee217cb-e280-430f-a79f-c2824015216f) in Nautobot
2024-02-16 11:35:20,319 - network-importer - INFO - Created IP 192.168.1.5/30 (250a606c-d2e3-4f1b-a345-d029dc625c30) in Nautobot
2024-02-16 11:35:20,320 - network-importer - INFO - IP Address 192.168.1.5/30 (250a606c-d2e3-4f1b-a345-d029dc625c30) assigned to Interface Ethernet2 (5ee217cb-e280-430f-a79f-c2824015216f)
2024-02-16 11:35:21,433 - network-importer - INFO - Created interface Ethernet2 (91532668-df12-4c8f-b4c5-a3a99ac20d6d) in Nautobot
2024-02-16 11:35:23,013 - network-importer - INFO - Created IP 192.168.1.6/30 (b4185f4d-ea1a-4b25-a3e2-c5c0347cb561) in Nautobot
2024-02-16 11:35:23,014 - network-importer - INFO - IP Address 192.168.1.6/30 (b4185f4d-ea1a-4b25-a3e2-c5c0347cb561) assigned to Interface Ethernet2 (91532668-df12-4c8f-b4c5-a3a99ac20d6d)
2024-02-16 11:35:24,037 - network-importer - INFO - Created interface Ethernet1 (a31c5ef2-ad1a-4f92-86b9-13918358efbc) in Nautobot
2024-02-16 11:35:26,141 - network-importer - INFO - Created IP 192.168.1.2/30 (c3546a86-f9cd-472d-ac50-e635ab061125) in Nautobot
2024-02-16 11:35:26,141 - network-importer - INFO - IP Address 192.168.1.2/30 (c3546a86-f9cd-472d-ac50-e635ab061125) assigned to Interface Ethernet1 (a31c5ef2-ad1a-4f92-86b9-13918358efbc)
2024-02-16 11:35:26,450 - network-importer - INFO - Execution finished, processed 2 device(s)
root@d44cccad130e:/network-importer#
```

Check Nautobot UI for yourself to confirm data like Prefixes, Interfaces or IP Addresses were successfully imported.

## Conclusion
-------------

Network importer is another tool that allows importing devices data into SOT.
