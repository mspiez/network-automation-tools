import pycountry

from django.utils.text import slugify

active_status = Status.objects.get(name="Active")


# Create Sites
for c in list(pycountry.countries):
    site = Site.objects.create(name=c.name, status=active_status, slug=slugify(c.name))
    site.validated_save()
    print(f"Created site: {c.name}")


# Create manufacturer
m = Manufacturer.objects.create(name="Arista", slug="arista")
m.validated_save()
print(f"Created manufacturer: Arista")


# Create platform
p = Platform.objects.create(manufacturer=m, name="eos", slug="eos", napalm_driver="eos")
p.validated_save()
print(f"Created platform: Arista")
