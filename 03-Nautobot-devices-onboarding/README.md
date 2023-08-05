# Nautobot Device Onboarding


## Overview
-----------
Nautobot plugin `devices onboarding` allows pulling basic information about devices into Nautobot.
That is a very convenient way for brownfield environments to populate data directly from the network into a source of truth.

> Note: `devices onboarding` plugin is installed in previous tutorial.

## Setup
--------

In the Nauotbot UI, navigate to `plugins` section. At this stage, you should see an onboarding plugin available.

Add a new onboarding plugin task by clicking the green button and filling in the web form with device details that you want to get into Source of Truth(Nautobot), for example:

![New Onboarding task](./images/onboarding_form.png)

- Site: I have picked first from the list(does not really matter here)
- IP Address: mgmt interface/IP address for device that we plan to onboard
- Port: `443` because I m using Arista VM-s connecting through eAPI
- Platform: picked manually so that plugin can pick proper driver for device

Repeat the same steps for R2 with IP Address `192.168.10.2`

Once completed, you should see two devices available in the Nautobot:

![Onboarding devices](./images/onboarding_devices.png)


## Conclusion
-------------
Working with tools like Source of Truth means a lot of data needs to be placed into database.

`devices onboarding` plugin automates the initial process of getting devices into SoT therefore saves time for your networking team.
