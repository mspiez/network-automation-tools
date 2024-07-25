# Simple VM-s topology setup

## Overview

This tutorial describes a quick way to set up VMs on your localhost, to be able run Network Automation tools against VM devices.

Guidelines apply to the Ubuntu system, so the commands may differ depending on the OS or distribution used. The intention is to build two VMs with one management interface each and connect them to each other with two `Ethernet` interfaces. The management interface is used for accessing devices through SSH, adding configuration, getting device state, etc.

> Please note, that below steps are optional, as there are many ways of setting up VM-s both locally and remotely from your localhost.

Ubuntu version:
```
$ lsb_release -a | grep Description
Description:    Ubuntu 22.04.2 LTS
$ 
```

## Setup

### Install KVM
---------------

Make sure to install KVM so that you can use commands like `virsh` and `brctl`.

Example instructions:
`https://phoenixnap.com/kb/ubuntu-install-kvm`


### Download Arista image `vEOS-lab-4.30.1F.qcow2`
--------------------------------------------------

* Login to your Arista account.
* Navigate to `https://www.arista.com/en/support/software-download`
* Expand section `vEOS-lab`
* Pick the latest image with `qcow2` extension

> Note: You can use other vendor images as well; these days I am not sure what is the easiest and best way to find vendor images, so here is an example with Arista. 


### Setup virtual bridges
-------------------------

VM interfaces are bound to virtual bridges to allow communication between devices. Virtual bridges have to be setup before VMs are booted.

Create virtual bridges
```
sudo brctl addbr virbr0
sudo brctl addbr virbr1
sudo brctl addbr virbr2
```

Enable virtual bridges:
```
sudo ip link set dev virbr0 up
sudo ip link set dev virbr1 up
sudo ip link set dev virbr2 up
```

Add IP address to virtual bridge on the localhost:
```
sudo ip addr add 192.168.10.10/24 dev virbr0
```

> Note: `192.168.10.0/24` network will be used to provide connectivity between local tools and scripts and VM devices through management interfaces.

### Add VM hostnames to `/etc/hosts`
------------------------------------

Optional step that allows connecting to VMs using hostnames rather than IP addresses.
Make sure to add the following section to `/etc/hosts` file on your system:
```
# LAB Arista devices
192.168.10.1   R1
192.168.10.2   R2
```

### Modify VM-s bootstrap config files
--------------------------------------

Replace the `TO_BE_REPLACED` with the path to the image in bootstrap config files:

Make sure that var is still present in the config files:
```
$ grep -r TO_BE_REPLACED ./files/bootstrap/
./files/bootstrap/R1.xml:      <source file='TO_BE_REPLACED' index='1'/>
./files/bootstrap/R2.xml:      <source file='TO_BE_REPLACED' index='1'/>
$
```

Change the `TO_BE_REPLACED` for each config file with a full path to your image:
```
$ sed -i 's#TO_BE_REPLACED#NEW_PATH#g' ./files/bootstrap/R1.xml
$ sed -i 's#TO_BE_REPLACED#NEW_PATH#g' ./files/bootstrap/R2.xml
```

> Note: `NEW_PATH` should be the full path to the VM image, for example: `/home/jack/downloads/vEOS-lab-4.30.1F.qcow2`


### Bootstrap VM devices
------------------------

KVM allows bootstraping VM-s by using XML config files. 

```
$ virsh define ./files/bootstrap/R1.xml
Domain 'R1' defined from ./files/bootstrap/R1.xml
$
```

Confirm VM is created:

```
$ virsh list --all | grep R1
 -    R1   shut off
$
```

Start the VM:

```
$ virsh start R1
Domain 'R1' started
$
```

### Configure devices
---------------------

Login to the devices using `virsh` command:
```
virsh console R1
```

In a enable mode copy the base config file from `files/configs` directory and paste it adequately to `R1/R2` - `R1_base.txt` and `R2_base.txt`


Confirm you can ping localhost IP address from devices:
```
$ ping 192.168.10.10 -c 1
```

Confirm you can ping R1/R2 mgmt interfaces from localhost:
```
ping 192.168.10.1 -c 1
PING 192.168.10.1 (192.168.10.1) 56(84) bytes of data.
64 bytes from 192.168.10.1: icmp_seq=1 ttl=64 time=0.980 ms
$
$ ping 192.168.10.2 -c 1
PING 192.168.10.2 (192.168.10.2) 56(84) bytes of data.
64 bytes from 192.168.10.2: icmp_seq=1 ttl=64 time=0.478 ms
$
```

SSH to R1/R2 from localhost:
```
ssh admin@R1
(admin@r1) Password: 
R1>enable
R1#
```

## Conclusion

The topology is very easy to set up, but as always keep in mind that steps may (and will) differ depending on the OS or the distribution. The VMs will be important part of the next tutorials.
