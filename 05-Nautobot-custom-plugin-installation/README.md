# Nautobot custom plugin installation

## Overview

In previous sections we already installed some well known Nautobot plugins like `Devices Onboarding`, `SSOT` or `Configuration Compliance` plugin.

Now let's install our own custom made plugin:
- [nautobot-plugin-interfaces-telemetry](https://github.com/mspiez/nautobot-plugin-interfaces-telemetry)

This is a crazy idea of adding a extension to the Nautobot interfaces where we could present the state of the device interfaces.

It's not common approach to keep state data in SoT systems, but let's try to do this with our custom plugin just for fun.

## Setup

Nautobot setup is described in one of the previous tutorials, but let's repeat the steps in case this is the first time you install Nautobot. 


Make sure to setup ENV variables as such:
```
$ export PYTHON_VER=3.9
```

> Note: Optionally if not done already, create Docker network that containers will be using to communicate with each other:
```
$ docker network create --driver bridge automation_net
```

Build images with `invoke build` command and some arguments:

```
$ invoke build
```

Start Nautobot by using `invoke start` command:
```
$ invoke start
```

At this step you can navigate to [Nautobot UI](http://localhost:8080/) and login with credentials `admin/admin`.

After logging into Nautobot you should see list of installed apps under `APPS` section in Nautobot UI:

![Installed Apps](./images/installed_apps.png)


Also, if you went through previous tutorials, two devices should already be available in the Nautobot.

If that is the case, navigate to one of the devices `view` and you should see additional tab there: `Interfaces Telemetry`

![Device view - interfaces status](./images/interfaces_status.png)

## Conclusion

Apps are a very powerful feature of the Nautobot which allow for quick and easy customization.

We are going to use our custom app in next tutorials to present the `admin/oper` states of the interfaces.
