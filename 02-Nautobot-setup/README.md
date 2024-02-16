# Nautobot setup

## Overview

This tutorial describes a quick way of setting up Nautobot on the local system.

After spinning up containers, the Nautobot database will be filled with some basic data, so that it does not have to be handled manually. 


## Setup Nautobot

The version of the Nautobot to be used: `2.1.1`.

Clone nautobot repo into the `source` directory and then copy poetry dependency files adequately:

```
$ git clone https://github.com/nautobot/nautobot.git --branch v2.1.1 source
$ cp nautobot/pyproject.toml nautobot/poetry.lock ./source
```

Make sure to setup ENV variables as such:
```
$ export NAUTOBOT_VERSION=2.1.1
$ export PYTHON_VER=3.9
```

These ones are used by `docker-compose` when building Nautobot image on the local system.

Before starting Nautobot, create Docker network that containers will be using to communicate with each other:
```
$ docker network create --driver bridge automation_net
```

Now, docker images have to be build with `docker-compose build` command and some arguments:

```
$ docker-compose build --build-arg NAUTOBOT_VERSION="$NAUTOBOT_VERSION" --build-arg PYTHON_VER="$PYTHON_VER"
```

Start Nautobot by using `docker-compose up` command:
```
$ docker-compose up
```

At this step you can navigate to [Nautobot UI](http://localhost:8080/) and login with credentials `admin/admin`. There is no any data in Nautobot so far, so let's populate some data into Nautobot.

### Pre-populate data into Nautobot
----------------------------------

This step generates:
- location_type
- locations
- manufacturer
- platform
- secrets

Enter the Nautobot shell inside container: `docker exec -it nautobot_lab nautobot-server nbshell`

```
$ docker exec -it nautobot_lab nautobot-server nbshell
# Shell Plus Model Imports
from constance.backends.database.models import Constance
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.contrib.sessions.models import Session
from django_celery_beat.models import ClockedSchedule, CrontabSchedule, IntervalSchedule, PeriodicTask, PeriodicTasks, SolarSchedule
from django_celery_results.models import ChordCounter, GroupResult, TaskResult
from nautobot.circuits.models import Circuit, CircuitTermination, CircuitType, Provider, ProviderNetwork
from nautobot.dcim.models.cables import Cable, CablePath
from nautobot.dcim.models.device_component_templates import ConsolePortTemplate, ConsoleServerPortTemplate, DeviceBayTemplate, FrontPortTemplate, InterfaceTemplate, PowerOutletTemplate, PowerPortTemplate, RearPortTemplate
from nautobot.dcim.models.device_components import ConsolePort, ConsoleServerPort, DeviceBay, FrontPort, Interface, InterfaceRedundancyGroup, InterfaceRedundancyGroupAssociation, InventoryItem, PowerOutlet, PowerPort, RearPort
from nautobot.dcim.models.devices import Device, DeviceRedundancyGroup, DeviceType, Manufacturer, Platform, VirtualChassis
from nautobot.dcim.models.locations import Location, LocationType
from nautobot.dcim.models.power import PowerFeed, PowerPanel
from nautobot.dcim.models.racks import Rack, RackGroup, RackReservation
from nautobot.extras.models.change_logging import ObjectChange
from nautobot.extras.models.customfields import ComputedField, CustomField, CustomFieldChoice
from nautobot.extras.models.datasources import GitRepository
from nautobot.extras.models.groups import DynamicGroup, DynamicGroupMembership
from nautobot.extras.models.jobs import Job, JobButton, JobHook, JobLogEntry, JobResult, ScheduledJob, ScheduledJobs
from nautobot.extras.models.models import ConfigContext, ConfigContextSchema, CustomLink, ExportTemplate, ExternalIntegration, FileAttachment, FileProxy, GraphQLQuery, HealthCheckTestModel, ImageAttachment, Note, Webhook
from nautobot.extras.models.relationships import Relationship, RelationshipAssociation
from nautobot.extras.models.roles import Role
from nautobot.extras.models.secrets import Secret, SecretsGroup, SecretsGroupAssociation
from nautobot.extras.models.statuses import Status
from nautobot.extras.models.tags import Tag, TaggedItem
from nautobot.ipam.models import IPAddress, IPAddressToInterface, Namespace, Prefix, RIR, RouteTarget, Service, VLAN, VLANGroup, VRF, VRFDeviceAssignment, VRFPrefixAssignment
from nautobot.tenancy.models import Tenant, TenantGroup
from nautobot.users.models import AdminGroup, ObjectPermission, Token, User
from nautobot.virtualization.models import Cluster, ClusterGroup, ClusterType, VMInterface, VirtualMachine
from social_django.models import Association, Code, Nonce, Partial, UserSocialAuth
# Shell Plus Django Imports
from django.core.cache import cache
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Avg, Case, Count, F, Max, Min, Prefetch, Q, Sum, When
from django.utils import timezone
from django.urls import reverse
from django.db.models import Exists, OuterRef, Subquery
# Django version 3.2.23
# Nautobot version 2.1.3b1
# Device Onboarding version 3.0.1
Python 3.9.18 (main, Feb  1 2024, 05:59:22) 
[GCC 12.2.0] on linux
Type "help", "copyright", "credits" or "license" for more information.
(InteractiveConsole)
>>> 

```

Onced in Python/nbshell shell, execute following command `exec(open('/source/scripts/populate_data.py').read())`:
```
>>> 
>>> exec(open('/source/scripts/populate_data.py').read())
Created location: Aruba
Created location: Afghanistan
Created location: Angola
Created location: Anguilla
Created location: Åland Islands

<...>
Created location: Zimbabwe
Created manufacturer: Arista
Created platform: Arista
>>>
```

## Conclusion

At this stage Nautobot is able to communicate with our VMs and gather some basic information about them. Next let's look at the details of `device onboarding` app in Nautobot, but now you can already explore Nautobot UI from the browser.
