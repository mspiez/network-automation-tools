import pycountry

active_status = Status.objects.get(name="Active")
device_ct = ContentType.objects.get_for_model(Device)
prefix_ct = ContentType.objects.get_for_model(Prefix)
vlan_ct = ContentType.objects.get_for_model(VLAN)
v_group_ct = ContentType.objects.get_for_model(VLANGroup)


# Create Location Types
lc, _ = LocationType.objects.get_or_create(name="Country")
lc.content_types.add(device_ct)
lc.content_types.add(prefix_ct)
lc.content_types.add(vlan_ct)
lc.content_types.add(v_group_ct)

# Create Locations
for c in list(pycountry.countries):
    location = Location.objects.create(name=c.name, status=active_status, location_type=lc)
    location.validated_save()
    print(f"Created location: {c.name}")


# Create manufacturer
m = Manufacturer.objects.create(name="Arista")
m.validated_save()
print(f"Created manufacturer: Arista")


# Create platform
p = Platform.objects.create(manufacturer=m, name="eos", napalm_driver="eos", network_driver="arista_eos")
p.validated_save()
print(f"Created platform: Arista")

# Secrets
secrets_group = SecretsGroup.objects.create(name="ARISTA_DEVICES")
_username = {"parameters": {"variable": "ARISTA_USERNAME"}}
_password = {"parameters": {"variable": "ARISTA_PASSWORD"}}
arista_username = Secret.objects.create(name="ARISTA_USERNAME", provider="environment-variable", **_username)
arista_password = Secret.objects.create(name="ARISTA_PASSWORD", provider="environment-variable", **_password)

secrets_group.secrets.add(arista_username)
sga_username = SecretsGroupAssociation.objects.get(secrets_group=secrets_group, secret=arista_username)
sga_username.access_type = "Generic"
sga_username.secret_type = "username"
sga_username.validated_save()

secrets_group.secrets.add(arista_password)
sga_password = SecretsGroupAssociation.objects.get(secrets_group=secrets_group, secret=arista_password)
sga_password.access_type = "Generic"
sga_password.secret_type = "password"
sga_password.validated_save()

# Enable jobs
jobs = Job.objects.filter()
for job in jobs:
    job.enabled=True
    job.validated_save()
