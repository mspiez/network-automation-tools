# Nautobot setup

## Overview

This tutorial describes a quick way of setting up Nautobot on the local system.

After spinning up Nautobot containers, the database will be filled with some generic data, like credentials, so that user does not have to add it manually. 


## Setup Nautobot

The version of the Nautobot to be used: `2.2.7` and python `3.9`

Before starting Nautobot, create Docker network that containers will be using to communicate with each other:
```
$ docker network create --driver bridge automation_net
```

Make sure to install `invoke` on your local system and setup python version to 3.9:
```
$ pip install invoke==2.2.0
$ export PYTHON_VER=3.9
```

Now, docker images have to be build with `docker-compose build` but we can take advantage of `tasks.py` and run `invoke build`:

```
$ invoke build
Building Nautobot with Python 3.9...
Running docker compose command "build"
redis uses an image, skipping
selenium uses an image, skipping
db uses an image, skipping
celery_beat uses an image, skipping
celery_worker uses an image, skipping
Building nautobot
#2 [internal] load build definition from Dockerfile
#2 sha256:7278356e40f728c6282b8018e4afb12601a906d00c6574fa90d3bf6eff024c57
#2 transferring dockerfile: 997B done
#2 DONE 0.0s

#1 [internal] load .dockerignore
#1 sha256:4af1373924805dbe623198cd0b7e22555f2c5f32ea4970c0dfadc4f539b212ca
#1 transferring context: 2B done
#1 DONE 0.0s

#3 [internal] load metadata for ghcr.io/nautobot/nautobot-dev:2.2.7-py3.11
#3 sha256:c656460b0c17c61b03e1e7b00d4541daa593ea14b6291fceaaf23deaffe90605
#3 DONE 0.8s

#12 [base 1/5] FROM ghcr.io/nautobot/nautobot-dev:2.2.7-py3.11@sha256:1a93f873b672146cd526d3d9772d5ed2b113818e9b9f33d898f856522ad0b62e
#12 sha256:902149c9fad999e3035f48015c069ed7507623143f9dba9b5e8abfe1d7b6d6a2
#12 DONE 0.0s

#10 [internal] load build context
#10 sha256:a1de697bd746d9e9b374f64c45a81188ad4b59d73f0b6bead7164977336f27f6
#10 transferring context: 676B done
#10 DONE 0.0s

...
<skipped>

```

`invoke` command helps us manage local Nautobot instance. We can build image, start or stop instance and so on.

Once image was successfully build, Nautobot can be started using following command:
```
$ invoke start
```

At this step, after successful start, you can navigate to [Nautobot UI](http://localhost:8080/) and login with credentials `admin/admin`. There is no any data in Nautobot so far, so let's populate some data into Nautobot database.

### Pre-populate data into Nautobot
----------------------------------

This step generates:
- location_type
- locations
- manufacturer
- platform
- secrets

Enter the Nautobot shell inside container: `invoke nbshell`

```
$ invoke nbshell
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

Once in Python/nbshell shell, execute following command `exec(open('/source/scripts/populate_data.py').read())`:
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

At this stage Nautobot is up and running, but also is able to communicate with our VMs. In the next part let's look at the details of `device onboarding` app in Nautobot, but before that you can explore Nautobot UI from the browser.
